#!/usr/bin/env python3
"""
音频切分容器服务
基于转录数据和说话人信息进行智能音频片段提取
"""
import os
import re
import json
import asyncio
import logging
import tempfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timezone

import boto3
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pydub import AudioSegment

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI应用
app = FastAPI(title="Audio Segment Container")

# 数据模型
class TranscriptItem(BaseModel):
    sequence: int
    start: str  # "1m23s456ms"
    end: str
    speaker: str
    original: str
    translation: Optional[str] = None
    content_type: str = 'speech'

class R2Config(BaseModel):
    accountId: str
    accessKeyId: str
    secretAccessKey: str
    bucketName: str
    publicDomain: str

class SegmentRequest(BaseModel):
    audioKey: str
    transcripts: List[TranscriptItem]
    goalDurationMs: int = 10000  # 默认10秒
    minDurationMs: int = 3000    # 默认3秒
    paddingMs: int = 500         # 默认500ms
    outputPrefix: str
    r2Config: R2Config

class AudioSegment(BaseModel):
    segmentId: str
    audioKey: str
    speaker: str
    startMs: int
    endMs: int
    durationMs: int
    sentences: List[Dict]

class SegmentResponse(BaseModel):
    success: bool
    segments: Optional[List[AudioSegment]] = None
    sentenceToSegmentMap: Optional[Dict[int, str]] = None
    error: Optional[str] = None


class AudioSegmenter:
    """音频切分服务 - 基于说话人分组的智能音频切片"""
    
    def __init__(self, goal_duration_ms: int, min_duration_ms: int, padding_ms: int):
        self.goal_duration_ms = goal_duration_ms
        self.min_duration_ms = min_duration_ms
        self.padding_ms = padding_ms
        self.logger = logger
        
    def _time_str_to_ms(self, time_str: str) -> int:
        """时间字符串转毫秒"""
        match = re.match(r'(\d+)m(\d+)s(\d+)ms', time_str)
        if not match: 
            return 0
        m, s, ms = map(int, match.groups())
        return m * 60 * 1000 + s * 1000 + ms
    
    def _ms_to_time_str(self, ms: int) -> str:
        """毫秒转时间字符串"""
        minutes = ms // 60000
        seconds = (ms % 60000) // 1000
        milliseconds = ms % 1000
        return f"{minutes}m{seconds}s{milliseconds}ms"
    
    def _create_audio_clips(self, transcripts: List[TranscriptItem]) -> Tuple[Dict, Dict]:
        """根据转录数据创建音频切片计划"""
        # 预处理：只处理speech类型的内容
        sentences = []
        for item in transcripts:
            if item.content_type != 'speech':
                continue
            
            start_ms = self._time_str_to_ms(item.start)
            end_ms = self._time_str_to_ms(item.end)
            
            # 添加padding
            padded_start = max(0, start_ms - self.padding_ms)
            padded_end = end_ms + self.padding_ms
            
            sentence_data = {
                'sequence': item.sequence,
                'speaker': item.speaker,
                'original': item.original,
                'translation': item.translation,
                'original_segment': [start_ms, end_ms],
                'padded_segment': [padded_start, padded_end],
                'segment_duration': padded_end - padded_start
            }
            
            if sentence_data['segment_duration'] > 0:
                sentences.append(sentence_data)

        if not sentences:
            return {}, {}

        # 识别同说话人连续块
        large_blocks = []
        if sentences:
            current_block = [sentences[0]]
            for i in range(1, len(sentences)):
                current_sentence = sentences[i]
                last_sentence = current_block[-1]
                
                # 检查说话人是否相同且序列连续
                same_speaker = current_sentence['speaker'] == last_sentence['speaker']
                continuous = current_sentence['sequence'] == last_sentence['sequence'] + 1
                
                if same_speaker and continuous:
                    current_block.append(current_sentence)
                else:
                    large_blocks.append(current_block)
                    current_block = [current_sentence]
            large_blocks.append(current_block)

        # 生成切片
        clips_library = {}
        sentence_to_clip_id_map = {}
        clip_id_counter = 0

        for block in large_blocks:
            block_total_duration = sum(s['segment_duration'] for s in block)
            
            # 只处理总时长大于等于min_duration_ms的块
            if block_total_duration >= self.min_duration_ms:
                clip_id_counter += 1
                clip_id = f"segment_{clip_id_counter:04d}"
                
                # 如果总时长超过goal_duration_ms，需要截取
                if block_total_duration > self.goal_duration_ms:
                    accumulated_duration = 0
                    sentences_to_include = []
                    
                    for sentence in block:
                        if accumulated_duration + sentence['segment_duration'] <= self.goal_duration_ms:
                            sentences_to_include.append(sentence)
                            accumulated_duration += sentence['segment_duration']
                        else:
                            # 添加部分句子
                            remaining_duration = self.goal_duration_ms - accumulated_duration
                            if remaining_duration > 0:
                                truncated_sentence = sentence.copy()
                                truncated_sentence['segment_duration'] = remaining_duration
                                start_time = truncated_sentence['padded_segment'][0]
                                truncated_sentence['padded_segment'] = [start_time, start_time + remaining_duration]
                                sentences_to_include.append(truncated_sentence)
                            break
                    
                    final_sentences = sentences_to_include
                else:
                    final_sentences = block
                
                # 合并重叠的segments
                merged_segments = self._merge_overlapping_segments(final_sentences)
                
                clips_library[clip_id] = {
                    "speaker": block[0]['speaker'],
                    "total_duration_ms": sum(end - start for start, end in merged_segments),
                    "segments_to_concatenate": merged_segments,
                    "sentences": [{
                        "sequence": s['sequence'], 
                        "original": s['original'], 
                        "translation": s['translation']
                    } for s in final_sentences]
                }
                
                # 映射sentence到clip
                for sentence in block:
                    sentence_to_clip_id_map[sentence['sequence']] = clip_id

        return clips_library, sentence_to_clip_id_map
    
    def _merge_overlapping_segments(self, block: List[Dict]) -> List[List[int]]:
        """合并重叠的segments"""
        if not block:
            return []
        
        segments = [s['padded_segment'] for s in block]
        segments.sort(key=lambda x: x[0])
        
        merged = [segments[0]]
        for current in segments[1:]:
            last = merged[-1]
            
            if current[0] <= last[1]:
                merged[-1] = [last[0], max(last[1], current[1])]
            else:
                merged.append(current)
        
        return merged
    
    async def extract_and_save_clips(self, audio_path: str, clips_library: Dict, 
                                    output_prefix: str, s3_client, bucket_name: str) -> List[AudioSegment]:
        """提取并保存音频切片到R2"""
        # 验证音频文件
        self.logger.info(f"验证音频文件: {audio_path}")
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        file_size = os.path.getsize(audio_path)
        self.logger.info(f"音频文件大小: {file_size} bytes")
        
        if file_size == 0:
            raise ValueError(f"音频文件为空: {audio_path}")
        
        # 加载音频文件
        try:
            self.logger.info(f"开始加载音频文件: {audio_path}")
            # 先尝试直接加载
            audio = await asyncio.to_thread(AudioSegment.from_file, audio_path)
            self.logger.info(f"音频文件加载成功，时长: {len(audio)/1000:.1f}秒")
        except Exception as e:
            self.logger.error(f"直接加载失败，尝试指定格式: {e}")
            # 尝试根据扩展名指定格式
            try:
                file_ext = os.path.splitext(audio_path)[1].lower()
                if file_ext in ['.mp3']:
                    audio = await asyncio.to_thread(AudioSegment.from_mp3, audio_path)
                elif file_ext in ['.wav']:
                    audio = await asyncio.to_thread(AudioSegment.from_wav, audio_path)
                elif file_ext in ['.aac', '.m4a']:
                    audio = await asyncio.to_thread(AudioSegment.from_file, audio_path, format="aac")
                else:
                    # 最后尝试原始格式
                    audio = await asyncio.to_thread(AudioSegment.from_file, audio_path, format="mp3")
                self.logger.info(f"指定格式加载成功，时长: {len(audio)/1000:.1f}秒")
            except Exception as e2:
                self.logger.error(f"所有格式尝试失败: {e2}")
                raise ValueError(f"无法加载音频文件 {audio_path}: {e2}")
        
        segments = []
        
        # 处理每个切片
        for clip_id, clip_info in clips_library.items():
            try:
                # 合并音频片段
                combined_audio = AudioSegment.empty()
                
                for i, (start_ms, end_ms) in enumerate(clip_info['segments_to_concatenate']):
                    # 边界检查
                    start_ms = max(0, start_ms)
                    end_ms = min(len(audio), end_ms)
                    
                    if start_ms >= end_ms:
                        continue
                    
                    segment = audio[start_ms:end_ms]
                    
                    # 淡入淡出处理
                    fade_duration = min(self.padding_ms // 2, 100)
                    if i == 0:
                        segment = segment.fade_in(fade_duration)
                    if i == len(clip_info['segments_to_concatenate']) - 1:
                        segment = segment.fade_out(fade_duration)
                    
                    combined_audio += segment
                
                if len(combined_audio) == 0:
                    continue
                
                # 标准化音频
                combined_audio = combined_audio.normalize()
                
                # 导出到临时文件
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                    combined_audio.export(tmp_file.name, format="wav")
                    
                    # 上传到R2
                    speaker_clean = clip_info['speaker'].replace(' ', '_').replace('/', '_')
                    audio_key = f"{output_prefix}/{clip_id}_{speaker_clean}.wav"
                    
                    with open(tmp_file.name, 'rb') as f:
                        s3_client.put_object(
                            Bucket=bucket_name,
                            Body=f,
                            Key=audio_key,
                            ContentType='audio/wav'
                        )
                    
                    # 删除临时文件
                    os.unlink(tmp_file.name)
                
                # 创建segment对象
                segment_data = {
                    'segmentId': clip_id,
                    'audioKey': audio_key,
                    'speaker': clip_info['speaker'],
                    'startMs': clip_info['segments_to_concatenate'][0][0],
                    'endMs': clip_info['segments_to_concatenate'][-1][1],
                    'durationMs': clip_info['total_duration_ms'],
                    'sentences': clip_info['sentences']
                }
                segment = AudioSegment(**segment_data)
                segments.append(segment)
                
                self.logger.info(f"已保存切片: {audio_key}")
                
            except Exception as e:
                self.logger.error(f"处理切片 {clip_id} 失败: {e}")
                continue
        
        return segments


# 创建R2客户端
def create_r2_client(config: R2Config):
    """创建R2客户端"""
    return boto3.client(
        's3',
        endpoint_url=f'https://{config.accountId}.r2.cloudflarestorage.com',
        aws_access_key_id=config.accessKeyId,
        aws_secret_access_key=config.secretAccessKey,
        region_name='auto'
    )


@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "audio-segment-container",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.post("/segment", response_model=SegmentResponse)
async def segment_audio(request: SegmentRequest):
    """音频切分接口"""
    logger.info(f"收到切分请求: audioKey={request.audioKey}, transcripts={len(request.transcripts)}")
    
    try:
        # 创建R2客户端
        s3_client = create_r2_client(request.r2Config)
        
        # 下载音频文件到临时目录
        with tempfile.TemporaryDirectory() as temp_dir:
            # 根据原始文件扩展名创建临时文件
            original_ext = os.path.splitext(request.audioKey)[1] or '.aac'
            audio_path = Path(temp_dir) / f"input_audio{original_ext}"
            
            # 从R2下载音频
            try:
                logger.info(f"从R2下载音频: {request.audioKey}")
                logger.info(f"目标路径: {audio_path}")
                
                s3_client.download_file(
                    Bucket=request.r2Config.bucketName,
                    Key=request.audioKey,
                    Filename=str(audio_path)
                )
                
                # 验证下载的文件
                if not audio_path.exists():
                    raise FileNotFoundError(f"下载失败，文件不存在: {audio_path}")
                
                downloaded_size = audio_path.stat().st_size
                logger.info(f"音频文件下载成功: {downloaded_size} bytes")
                
                if downloaded_size == 0:
                    raise ValueError(f"下载的音频文件为空: {request.audioKey}")
                    
            except Exception as e:
                logger.error(f"下载音频文件失败: {e}")
                raise ValueError(f"无法下载音频文件 {request.audioKey}: {e}")
            
            # 创建切分器
            segmenter = AudioSegmenter(
                goal_duration_ms=request.goalDurationMs,
                min_duration_ms=request.minDurationMs,
                padding_ms=request.paddingMs
            )
            
            # 生成切片计划
            clips_library, sentence_to_clip_map = segmenter._create_audio_clips(request.transcripts)
            
            if not clips_library:
                return SegmentResponse(
                    success=True,
                    segments=[],
                    sentenceToSegmentMap={}
                )
            
            logger.info(f"生成了 {len(clips_library)} 个切片计划")
            
            # 提取并保存切片
            s3_client_for_upload = boto3.client(
                's3',
                endpoint_url=f'https://{request.r2Config.accountId}.r2.cloudflarestorage.com',
                aws_access_key_id=request.r2Config.accessKeyId,
                aws_secret_access_key=request.r2Config.secretAccessKey,
                region_name='auto'
            )
            
            segments = await segmenter.extract_and_save_clips(
                str(audio_path),
                clips_library,
                request.outputPrefix,
                s3_client_for_upload,
                request.r2Config.bucketName
            )
            
            logger.info(f"成功生成 {len(segments)} 个音频切片")
            
            return SegmentResponse(
                success=True,
                segments=segments,
                sentenceToSegmentMap=sentence_to_clip_map
            )
            
    except ValueError as e:
        logger.error(f"参数错误: {e}")
        return SegmentResponse(
            success=False,
            error=str(e)
        )
    except FileNotFoundError as e:
        logger.error(f"文件不存在: {e}")
        return SegmentResponse(
            success=False,
            error=str(e)
        )
    except Exception as e:
        logger.error(f"音频切分失败: {e}", exc_info=True)
        # 获取更详细的错误信息
        error_type = type(e).__name__
        error_message = str(e)
        if hasattr(e, '__cause__') and e.__cause__:
            error_message += f" (原因: {e.__cause__})"
        
        return SegmentResponse(
            success=False,
            error=f"{error_type}: {error_message}"
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)