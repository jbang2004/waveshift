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

# 配置日志 - 启用详细调试信息
logging.basicConfig(
    level=logging.DEBUG,  # 改为DEBUG级别以显示详细信息
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI应用
app = FastAPI(title="Audio Segment Container")

# 数据模型
class TranscriptItem(BaseModel):
    sequence: int
    startMs: int  # 开始时间（毫秒）
    endMs: int    # 结束时间（毫秒）
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
        
    # 时间转换函数已移除 - 直接使用毫秒格式，无需转换
    
    def _create_audio_clips(self, transcripts: List[TranscriptItem]) -> Tuple[Dict, Dict]:
        """根据转录数据创建音频切片计划"""
        self.logger.info(f"🎬 开始处理 {len(transcripts)} 个转录项")
        
        # 分析时间戳范围
        speech_items = [t for t in transcripts if t.content_type == 'speech']
        if speech_items:
            min_time = min(t.startMs for t in speech_items)
            max_time = max(t.endMs for t in speech_items)
            self.logger.info(f"📊 转录时间戳范围: {min_time}ms - {max_time}ms ({(max_time-min_time)/1000:.1f}秒)")
        
        # 预处理：只处理speech类型的内容
        sentences = []
        for i, item in enumerate(transcripts):
            self.logger.debug(f"转录项 {i}: sequence={item.sequence}, type={item.content_type}, "
                            f"start={item.startMs}ms, end={item.endMs}ms, speaker='{item.speaker}', "
                            f"text='{item.original[:50]}...'")
            
            if item.content_type != 'speech':
                self.logger.debug(f"  跳过非语音内容: {item.content_type}")
                continue
            
            start_ms = item.startMs
            end_ms = item.endMs
            
            if start_ms >= end_ms:
                self.logger.warning(f"  时间范围无效: start={start_ms}ms >= end={end_ms}ms，跳过")
                continue
            
            # 添加padding
            padded_start = max(0, start_ms - self.padding_ms)
            padded_end = end_ms + self.padding_ms
            duration = padded_end - padded_start
            
            self.logger.debug(f"  时间计算: 原始[{start_ms}-{end_ms}]ms ({end_ms-start_ms}ms), "
                            f"padding[{padded_start}-{padded_end}]ms ({duration}ms)")
            
            sentence_data = {
                'sequence': item.sequence,
                'speaker': item.speaker,
                'original': item.original,
                'translation': item.translation,
                'original_segment': [start_ms, end_ms],
                'padded_segment': [padded_start, padded_end],
                'segment_duration': duration
            }
            
            if sentence_data['segment_duration'] > 0:
                sentences.append(sentence_data)
                self.logger.debug(f"  ✅ 添加有效句子: {duration}ms")
            else:
                self.logger.warning(f"  ❌ 句子时长无效: {duration}ms")

        self.logger.info(f"📝 预处理完成，获得 {len(sentences)} 个有效语音句子")
        if not sentences:
            self.logger.warning("⚠️ 没有有效的语音句子，返回空结果")
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
        """使用ffmpeg直接切分音频 - 高性能AAC原生支持"""
        import subprocess
        
        # 验证音频文件
        self.logger.info(f"验证音频文件: {audio_path}")
        if not os.path.exists(audio_path):
            raise FileNotFoundError(f"音频文件不存在: {audio_path}")
        
        file_size = os.path.getsize(audio_path)
        self.logger.info(f"音频文件大小: {file_size} bytes")
        
        if file_size == 0:
            raise ValueError(f"音频文件为空: {audio_path}")
        
        # 检查ffmpeg可用性和音频信息
        try:
            # 获取音频时长信息
            probe_cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json', 
                '-show_format', '-show_streams', audio_path
            ]
            probe_result = await asyncio.to_thread(
                subprocess.run, probe_cmd, 
                capture_output=True, text=True, check=True
            )
            
            import json
            audio_info = json.loads(probe_result.stdout)
            duration_str = audio_info['format']['duration']
            total_duration_ms = int(float(duration_str) * 1000)
            
            # 获取转录时间戳范围用于时间轴验证
            speech_transcripts = [t for t in clips_library.values() if t.get('sentences')]
            if speech_transcripts:
                all_segments = []
                for clip_info in speech_transcripts:
                    all_segments.extend(clip_info['segments_to_concatenate'])
                
                if all_segments:
                    transcript_start = min(seg[0] for seg in all_segments)
                    transcript_end = max(seg[1] for seg in all_segments)
                    transcript_duration = transcript_end - transcript_start
                    
                    self.logger.info(f"🎵 音频文件时长: {total_duration_ms/1000:.1f}秒 ({total_duration_ms}ms)")
                    self.logger.info(f"📝 转录时间戳范围: {transcript_start}ms - {transcript_end}ms ({transcript_duration/1000:.1f}秒)")
                    
                    # 时间轴偏移检测
                    duration_diff = abs(total_duration_ms - transcript_duration) 
                    if duration_diff > 5000:  # 超过5秒差异
                        self.logger.warning(f"⚠️ 时间轴可能不匹配: 音频={total_duration_ms/1000:.1f}s vs 转录={transcript_duration/1000:.1f}s, 差异={duration_diff/1000:.1f}s")
                    
                    # 检查转录时间戳是否超出音频范围
                    if transcript_end > total_duration_ms:
                        self.logger.error(f"❌ 转录时间戳超出音频范围: {transcript_end}ms > {total_duration_ms}ms")
                        self.logger.error(f"   这通常意味着转录基于视频时间轴，但音频分离后时间轴发生偏移")
                    
                    if transcript_start > total_duration_ms / 2:
                        self.logger.warning(f"⚠️ 转录开始时间较晚: {transcript_start}ms，可能存在时间偏移")
            
            self.logger.info(f"音频格式: {audio_info['format']['format_name']}")
            
        except Exception as e:
            self.logger.error(f"ffprobe音频信息获取失败: {e}")
            raise ValueError(f"无法解析音频文件: {e}")
        
        segments = []
        
        # 并行处理所有切片 - 使用ffmpeg直接切分
        async def process_single_clip_with_ffmpeg(clip_id: str, clip_info: Dict) -> Optional[AudioSegment]:
            """使用ffmpeg处理单个切片"""
            try:
                speaker_clean = clip_info['speaker'].replace(' ', '_').replace('/', '_')
                audio_key = f"{output_prefix}/{clip_id}_{speaker_clean}.wav"
                
                # 创建临时输出文件
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                    output_path = tmp_file.name
                
                try:
                    # 构建ffmpeg命令 - 支持多段切分和合并
                    segments_to_concat = clip_info['segments_to_concatenate']
                    
                    if len(segments_to_concat) == 1:
                        # 单段切分 - 简单情况
                        start_ms, end_ms = segments_to_concat[0]
                        
                        # 边界检查
                        start_ms = max(0, start_ms)
                        end_ms = min(total_duration_ms, end_ms)
                        duration_ms = end_ms - start_ms
                        
                        if duration_ms <= 0:
                            self.logger.warning(f"切片 {clip_id} 时长无效，跳过")
                            return None
                        
                        # 转换为ffmpeg时间格式
                        start_sec = start_ms / 1000.0
                        duration_sec = duration_ms / 1000.0
                        end_sec = start_sec + duration_sec
                        
                        # 验证时间范围
                        audio_duration_sec = total_duration_ms / 1000.0
                        self.logger.info(f"🎵 切片 {clip_id}: 时间范围检查")
                        self.logger.info(f"  音频总长度: {audio_duration_sec:.3f}s ({total_duration_ms}ms)")
                        self.logger.info(f"  切分范围: {start_sec:.3f}s - {end_sec:.3f}s (时长: {duration_sec:.3f}s)")
                        self.logger.info(f"  原始时间戳: {start_ms}ms - {end_ms}ms")
                        
                        # 边界警告
                        if start_sec >= audio_duration_sec:
                            self.logger.warning(f"⚠️ 开始时间超出音频长度: {start_sec:.3f}s >= {audio_duration_sec:.3f}s")
                        if end_sec > audio_duration_sec:
                            self.logger.warning(f"⚠️ 结束时间超出音频长度: {end_sec:.3f}s > {audio_duration_sec:.3f}s，将截取")
                        
                        # 🚀 优化：使用stream copy避免重编码
                        # 只在必要时应用音频滤镜
                        use_filters = getattr(self, 'use_audio_filters', False)
                        
                        if use_filters:
                            # 带滤镜的处理（较慢）
                            fade_duration = min(self.padding_ms / 1000.0, 0.5)
                            ffmpeg_cmd = [
                                'ffmpeg', '-y',
                                '-i', audio_path,
                                '-ss', f'{start_sec:.3f}',
                                '-t', f'{duration_sec:.3f}',
                                '-af', f'afade=in:d={fade_duration:.3f},afade=out:d={fade_duration:.3f}',
                                '-c:a', 'aac',  # 保持AAC格式
                                '-b:a', '128k',  # 合理的比特率
                                output_path
                            ]
                        else:
                            # 🚀 快速模式：流复制，不重编码
                            ffmpeg_cmd = [
                                'ffmpeg', '-y',
                                '-ss', f'{start_sec:.3f}',  # 放在-i前面，使用快速seek
                                '-i', audio_path,
                                '-t', f'{duration_sec:.3f}',
                                '-c:a', 'copy',  # 直接复制音频流，不重编码
                                '-avoid_negative_ts', 'make_zero',  # 避免时间戳问题
                                output_path
                            ]
                        
                        self.logger.info(f"📝 ffmpeg命令: {' '.join(ffmpeg_cmd)}")
                        
                    else:
                        # 多段合并 - 复杂情况，使用filter_complex
                        filter_parts = []
                        input_specs = []
                        
                        for i, (start_ms, end_ms) in enumerate(segments_to_concat):
                            start_ms = max(0, start_ms)
                            end_ms = min(total_duration_ms, end_ms)
                            duration_ms = end_ms - start_ms
                            
                            if duration_ms <= 0:
                                continue
                                
                            start_sec = start_ms / 1000.0
                            duration_sec = duration_ms / 1000.0
                            
                            # 为每个段添加输入
                            input_specs.extend(['-ss', f'{start_sec:.3f}', '-t', f'{duration_sec:.3f}', '-i', audio_path])
                            
                            # 为每个段添加音频处理
                            fade_duration = min(self.padding_ms / 1000.0, 0.2)
                            if i == 0:
                                # 第一段：淡入
                                filter_parts.append(f'[{i}:a]afade=in:d={fade_duration:.3f}[a{i}]')
                            elif i == len(segments_to_concat) - 1:
                                # 最后一段：淡出
                                filter_parts.append(f'[{i}:a]afade=out:d={fade_duration:.3f}[a{i}]')
                            else:
                                # 中间段：轻微淡入淡出
                                filter_parts.append(f'[{i}:a]afade=in:d={fade_duration/2:.3f},afade=out:d={fade_duration/2:.3f}[a{i}]')
                        
                        if not filter_parts:
                            self.logger.warning(f"切片 {clip_id} 无有效段，跳过")
                            return None
                        
                        # 合并所有段
                        concat_inputs = ''.join(f'[a{i}]' for i in range(len(filter_parts)))
                        filter_parts.append(f'{concat_inputs}concat=n={len(filter_parts)}:v=0:a=1,loudnorm[out]')
                        
                        filter_complex = ';'.join(filter_parts)
                        
                        ffmpeg_cmd = ['ffmpeg', '-y'] + input_specs + [
                            '-filter_complex', filter_complex,
                            '-map', '[out]',
                            '-ac', '1',  # 单声道
                            '-ar', '22050',  # 采样率
                            output_path
                        ]
                    
                    # 执行ffmpeg命令
                    self.logger.info(f"🚀 执行ffmpeg处理切片 {clip_id}: {len(segments_to_concat)}段, 说话人={clip_info['speaker']}")
                    
                    result = await asyncio.to_thread(
                        subprocess.run, ffmpeg_cmd,
                        capture_output=True, text=True, check=True
                    )
                    
                    # 详细验证输出文件
                    if not os.path.exists(output_path):
                        raise ValueError(f"ffmpeg未生成输出文件: {output_path}")
                    
                    output_size = os.path.getsize(output_path)
                    if output_size == 0:
                        raise ValueError(f"ffmpeg生成空文件: {output_path}")
                    
                    # 🚀 优化：只在调试模式下验证
                    if getattr(self, 'debug_mode', False):
                        # 使用ffprobe验证生成的音频文件
                        try:
                            probe_cmd = [
                                'ffprobe', '-v', 'quiet', '-print_format', 'json', 
                                '-show_format', output_path
                            ]
                            probe_result = await asyncio.to_thread(
                                subprocess.run, probe_cmd,
                                capture_output=True, text=True, check=True
                            )
                            
                            import json
                            output_info = json.loads(probe_result.stdout)
                            output_duration = float(output_info['format']['duration'])
                            
                            self.logger.info(f"✅ 文件生成成功: {output_size} bytes, 时长: {output_duration:.3f}s")
                        except Exception as e:
                            self.logger.warning(f"ffprobe验证失败: {e}")
                    else:
                        self.logger.info(f"✅ 文件生成成功: {output_size} bytes")
                    
                    # 上传到R2
                    with open(output_path, 'rb') as f:
                        s3_client.put_object(
                            Bucket=bucket_name,
                            Body=f,
                            Key=audio_key,
                            ContentType='audio/wav'
                        )
                    
                    self.logger.info(f"📤 已上传切片到R2: {audio_key}")
                    
                    # 输出ffmpeg的stderr用于调试
                    if result.stderr:
                        self.logger.debug(f"ffmpeg stderr: {result.stderr}")
                    
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
                    return AudioSegment(**segment_data)
                    
                finally:
                    # 清理临时文件
                    if os.path.exists(output_path):
                        os.unlink(output_path)
                        
            except subprocess.CalledProcessError as e:
                self.logger.error(f"ffmpeg处理切片 {clip_id} 失败: stderr={e.stderr}")
                return None
            except Exception as e:
                self.logger.error(f"处理切片 {clip_id} 异常: {e}")
                return None
        
        # 🚀 优化：限制并发数量以避免CPU过载
        max_concurrent = min(3, len(clips_library))  # 最多3个并发任务
        self.logger.info(f"开始处理 {len(clips_library)} 个音频切片 (并发数: {max_concurrent})")
        
        # 使用信号量限制并发
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def process_with_limit(clip_id, clip_info):
            async with semaphore:
                return await process_single_clip_with_ffmpeg(clip_id, clip_info)
        
        tasks = [process_with_limit(clip_id, clip_info) 
                for clip_id, clip_info in clips_library.items()]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 收集成功的结果
        for result in results:
            if isinstance(result, AudioSegment):
                segments.append(result)
            elif isinstance(result, Exception):
                self.logger.error(f"切片处理异常: {result}")
        
        self.logger.info(f"ffmpeg并行处理完成，成功生成 {len(segments)} 个音频切片")
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
    
    # 🚀 性能优化开关
    use_optimization = request.performanceMode if hasattr(request, 'performanceMode') else True
    logger.info(f"使用优化模式: {use_optimization}")
    
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
            # 设置优化标志
            segmenter.use_audio_filters = not use_optimization  # 优化模式下不使用滤镜
            segmenter.debug_mode = False  # 生产环境关闭调试
            
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