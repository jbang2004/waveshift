#!/usr/bin/env python3
"""
音频切分容器服务
基于转录数据和说话人信息进行智能音频片段提取
"""
import os
import asyncio
import logging
import tempfile
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from datetime import datetime, timezone

import boto3
from fastapi import FastAPI
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

class AudioSegmentConfig(BaseModel):
    """音频切分配置参数"""
    gapDurationMs: int = 500
    maxDurationMs: int = 12000
    minDurationMs: int = 1000
    gapThresholdMultiplier: int = 3

class SegmentRequest(BaseModel):
    audioKey: str
    transcripts: List[TranscriptItem]
    outputPrefix: str
    r2Config: R2Config
    segmentConfig: Optional[AudioSegmentConfig] = None

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


from enum import Enum
from typing import Optional, NamedTuple

class AccumulatorState(Enum):
    ACCUMULATING = "accumulating"      # 正在累积sentences

class BreakDecision(NamedTuple):
    should_break: bool
    reason: str

class StreamingAccumulator:
    """流式累积器：维护当前音频片段的处理状态"""
    def __init__(self, first_sentence: Dict):
        self.speaker = first_sentence['speaker']
        self.time_ranges = [[first_sentence['startMs'], first_sentence['endMs']]]
        self.pending_sentences = [first_sentence]
        self.sequence_start = first_sentence['sequence']
        self.state = AccumulatorState.ACCUMULATING
        # 音频复用字段
        self.generated_audio_key: Optional[str] = None
        self.is_audio_generated: bool = False
        
        
    def get_total_duration(self, gap_duration_ms: int) -> int:
        """计算累积器的总时长（包含gaps）"""
        audio_duration = sum(end - start for start, end in self.time_ranges)
        gap_count = max(0, len(self.time_ranges) - 1)
        return audio_duration + (gap_count * gap_duration_ms)
        
    def add_sentence(self, sentence: Dict, gap_threshold_ms: int):
        """添加句子到累积器，智能处理时间范围"""
        if self.state != AccumulatorState.ACCUMULATING:
            raise ValueError("Cannot add sentence to non-accumulating accumulator")
            
        # 检查间隔并决定如何合并时间范围
        last_end = self.time_ranges[-1][1]
        gap = sentence['startMs'] - last_end
        
        if gap <= gap_threshold_ms:
            # 小间隔：扩展最后一个时间范围
            self.time_ranges[-1][1] = sentence['endMs']
        else:
            # 大间隔：添加新时间范围
            self.time_ranges.append([sentence['startMs'], sentence['endMs']])
            
        self.pending_sentences.append(sentence)
    
    def can_reuse_audio(self) -> bool:
        """检查是否可以复用已生成的音频"""
        return (self.state == AccumulatorState.ACCUMULATING and 
                self.is_audio_generated and 
                self.generated_audio_key is not None)


class SegmentationDecision:
    """音频切分决策逻辑"""
    
    @staticmethod
    def should_break_accumulation(accumulator: StreamingAccumulator, sentence: Dict) -> BreakDecision:
        """统一的累积中断决策"""
        if not accumulator:
            return BreakDecision(False, "no_accumulator")
            
        # 说话人变化
        if sentence['speaker'] != accumulator.speaker:
            return BreakDecision(True, "speaker_change")
                
        return BreakDecision(False, "continue_accumulation")


class AudioSegmenter:
    """音频切分服务 - 流式处理的智能音频切片"""
    
    def __init__(self, config: Optional[AudioSegmentConfig] = None):
        # 优先使用传入的配置参数，否则从环境变量读取
        if config:
            self.gap_duration_ms = config.gapDurationMs
            self.max_duration_ms = config.maxDurationMs  
            self.min_duration_ms = config.minDurationMs
            self.gap_threshold_multiplier = config.gapThresholdMultiplier
        else:
            # 环境变量回退（更新默认值）
            self.gap_duration_ms = int(os.getenv('GAP_DURATION_MS', '500'))
            self.max_duration_ms = int(os.getenv('MAX_DURATION_MS', '12000'))  
            self.min_duration_ms = int(os.getenv('MIN_DURATION_MS', '1000'))  # ✅ 更新默认值
            self.gap_threshold_multiplier = int(os.getenv('GAP_THRESHOLD_MULTIPLIER', '3'))
            
        self.gap_threshold_ms = self.gap_duration_ms * self.gap_threshold_multiplier
        
        self.logger = logger
        self.logger.info(f"🎵 AudioSegmenter初始化 - Gap:{self.gap_duration_ms}ms, "
                        f"Max:{self.max_duration_ms}ms, Min:{self.min_duration_ms}ms, "
                        f"GapThreshold:{self.gap_threshold_ms}ms")
        
    async def process_sentences_streaming(self, transcripts: List[TranscriptItem], 
                                        audio_path: str, output_prefix: str, 
                                        s3_client, bucket_name: str) -> Tuple[List[AudioSegment], Dict[int, str]]:
        """流式处理：一次遍历，实时决策，立即上传"""
        segments = []
        sentence_to_segment_map = {}
        accumulator = None
        
        # 提取有效语音句子（直接使用TranscriptItem，避免不必要转换）
        valid_sentences = [item for item in transcripts 
                          if item.content_type == 'speech' and item.startMs < item.endMs]
        
        self.logger.info(f"🎬 开始流式处理 {len(valid_sentences)} 个语音句子")
        
        for sentence in valid_sentences:
            # 检查是否需要发射当前累积器
            decision = SegmentationDecision.should_break_accumulation(
                accumulator, self._sentence_to_dict(sentence)
            )
            
            if decision.should_break:
                await self._process_and_add_segment(
                    accumulator, segments, sentence_to_segment_map, 
                    audio_path, output_prefix, s3_client, bucket_name
                )
                accumulator = None
            
            # 添加当前句子到累积器
            if not accumulator:
                accumulator = StreamingAccumulator(self._sentence_to_dict(sentence))
            else:
                # 检查是否可以复用已生成的音频
                if accumulator.can_reuse_audio():
                    # 复用现有音频：直接为当前句子创建映射，无需重新生成音频
                    current_sentence = self._sentence_to_dict(sentence)
                    audio_key = accumulator.generated_audio_key
                    segment_id = audio_key.split('/')[-1].replace('.wav', '') if audio_key else None
                    
                    if segment_id:
                        sentence_to_segment_map[current_sentence['sequence']] = segment_id
                        self.logger.info(f"🔄 复用音频: segment_id={segment_id}, "
                                       f"句子{current_sentence['sequence']}直接映射")
                else:
                    # 正常添加句子到累积器
                    accumulator.add_sentence(self._sentence_to_dict(sentence), self.gap_threshold_ms)
            
            # 检查是否满载并生成音频（保持accumulator以供复用）
            if self._is_accumulator_full(accumulator):
                await self._process_and_add_segment(
                    accumulator, segments, sentence_to_segment_map, 
                    audio_path, output_prefix, s3_client, bucket_name
                )
                # 注意：不再重置accumulator，保持以供同说话人句子复用
        
        # 处理最后的累积器
        if accumulator and accumulator.pending_sentences:
            await self._process_and_add_segment(
                accumulator, segments, sentence_to_segment_map, 
                audio_path, output_prefix, s3_client, bucket_name
            )
        
        self.logger.info(f"✅ 流式处理完成，生成 {len(segments)} 个音频片段")
        return segments, sentence_to_segment_map
    
    def _sentence_to_dict(self, item: TranscriptItem) -> Dict:
        """转换TranscriptItem为字典（仅在需要时转换）"""
        return {
            'sequence': item.sequence,
            'speaker': item.speaker,
            'original': item.original,
            'translation': item.translation,
            'startMs': item.startMs,
            'endMs': item.endMs,
            'duration': item.endMs - item.startMs
        }
    
    async def _process_and_add_segment(self, accumulator: StreamingAccumulator, 
                                     segments: List, sentence_map: Dict[int, str],
                                     audio_path: str, output_prefix: str, 
                                     s3_client, bucket_name: str) -> None:
        """统一的accumulator处理逻辑：完成、添加到segments、更新mapping"""
        if not accumulator:
            return
            
        segment = await self._finalize_accumulator(accumulator, audio_path, output_prefix, s3_client, bucket_name)
        if segment:
            segments.append(segment)
            self._update_sentence_mapping(accumulator, segment.segmentId, sentence_map)
    
    def _update_sentence_mapping(self, accumulator: StreamingAccumulator, segment_id: str, 
                                sentence_map: Dict[int, str]):
        """统一的句子映射更新逻辑"""
        for sentence in accumulator.pending_sentences:
            sentence_map[sentence['sequence']] = segment_id
    
    def _is_accumulator_full(self, accumulator: StreamingAccumulator) -> bool:
        """检查累积器是否满载且需要处理"""
        if not accumulator or accumulator.state != AccumulatorState.ACCUMULATING:
            return False
        
        # 如果未达到最大时长，继续累积
        if accumulator.get_total_duration(self.gap_duration_ms) < self.max_duration_ms:
            return False
            
        # 如果达到最大时长但还没生成音频，需要处理（生成音频）
        if not accumulator.is_audio_generated:
            return True
            
        # 如果已生成音频，可以继续复用，不需要处理
        return False
    
    def _reuse_existing_audio(self, accumulator: StreamingAccumulator, 
                            sentence_map: Dict[int, str]) -> None:
        """复用已生成的音频，更新句子映射关系"""
        if not accumulator.can_reuse_audio():
            return
            
        # 从generated_audio_key提取segment_id（去掉路径前缀）
        audio_key = accumulator.generated_audio_key
        segment_id = audio_key.split('/')[-1].replace('.wav', '') if audio_key else None
        
        if segment_id:
            # 更新映射关系：将当前句子映射到已生成的segment
            for sentence in accumulator.pending_sentences:
                sentence_map[sentence['sequence']] = segment_id
                
            self.logger.info(f"🔄 复用音频: segment_id={segment_id}, "
                           f"新增{len(accumulator.pending_sentences)}个句子映射")
    
    async def _finalize_accumulator(self, accumulator: StreamingAccumulator, 
                                   audio_path: str, output_prefix: str, 
                                   s3_client, bucket_name: str) -> Optional[AudioSegment]:
        """完成累积器：生成音频并上传"""
        if not accumulator or not accumulator.pending_sentences:
            return None
        
        # 检查最小时长
        total_duration = accumulator.get_total_duration(self.gap_duration_ms)
        if len(accumulator.pending_sentences) == 1 and total_duration < self.min_duration_ms:
            sentence_details = [(s['sequence'], s['startMs'], s['endMs'], s['endMs']-s['startMs']) 
                               for s in accumulator.pending_sentences]
            self.logger.warning(f"🗑️ 丢弃过短单句片段: speaker={accumulator.speaker}, "
                              f"计算时长={total_duration}ms < 最小时长={self.min_duration_ms}ms, "
                              f"句子详情(sequence,start,end,实际时长)={sentence_details}")
            return None
        
        # 生成clip信息
        clip_id = f"sequence_{accumulator.sequence_start:04d}"
        audio_key = f"{output_prefix}/{clip_id}_{accumulator.speaker}.wav"
        
        self.logger.info(f"🎵 完成音频片段 {clip_id}: speaker={accumulator.speaker}, "
                        f"ranges={len(accumulator.time_ranges)}, sentences={len(accumulator.pending_sentences)}, "
                        f"duration={total_duration}ms")
        
        # 使用FFmpeg处理音频
        success = await self._process_audio_with_ffmpeg(
            audio_path, accumulator.time_ranges, audio_key, s3_client, bucket_name
        )
        
        if not success:
            return None
        
        # 标记音频已生成，支持后续复用
        accumulator.generated_audio_key = audio_key
        accumulator.is_audio_generated = True
        
        # 创建segment对象
        return AudioSegment(
            segmentId=clip_id,
            audioKey=audio_key,
            speaker=accumulator.speaker,
            startMs=accumulator.time_ranges[0][0],
            endMs=accumulator.time_ranges[-1][1],
            durationMs=total_duration,
            sentences=[{
                'sequence': s['sequence'],
                'original': s['original'],
                'translation': s.get('translation')
            } for s in accumulator.pending_sentences]
        )
    
    async def _process_audio_with_ffmpeg(self, audio_path: str, time_ranges: List[List[int]], 
                                       audio_key: str, s3_client, bucket_name: str) -> bool:
        """使用FFmpeg处理音频并上传到R2"""
        import subprocess
        import tempfile
        
        # 创建临时输出文件
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
            output_path = tmp_file.name
        
        try:
            if len(time_ranges) == 1:
                # 🎯 单段处理 - 高性能流复制
                start_ms, end_ms = time_ranges[0]
                start_sec = start_ms / 1000.0
                duration_sec = (end_ms - start_ms) / 1000.0
                
                ffmpeg_cmd = [
                    'ffmpeg', '-y',
                    '-ss', f'{start_sec:.3f}',
                    '-i', audio_path,
                    '-t', f'{duration_sec:.3f}',
                    '-c:a', 'copy',
                    '-avoid_negative_ts', 'make_zero',
                    output_path
                ]
                
                self.logger.info(f"📝 单段FFmpeg: {' '.join(ffmpeg_cmd)}")
                
            else:
                # 🎵 多段处理 - Gap静音插入
                input_specs = []
                
                # 为每个音频段添加输入
                for i, (start_ms, end_ms) in enumerate(time_ranges):
                    start_sec = start_ms / 1000.0
                    duration_sec = (end_ms - start_ms) / 1000.0
                    
                    input_specs.extend(['-ss', f'{start_sec:.3f}', '-t', f'{duration_sec:.3f}', '-i', audio_path])
                    
                    self.logger.info(f"  段{i+1}: {start_sec:.3f}s - {start_sec + duration_sec:.3f}s ({duration_sec:.3f}s)")
                
                # 构建filter_complex - Gap静音插入
                gap_sec = self.gap_duration_ms / 1000.0
                gap_filter = f'anullsrc=channel_layout=mono:sample_rate=44100:duration={gap_sec:.3f}'
                
                # 构建拼接序列：音频1 + gap + 音频2 + gap + 音频3...
                concat_parts = []
                for i in range(len(time_ranges)):
                    concat_parts.append(f'[{i}:a]')
                    if i < len(time_ranges) - 1:
                        concat_parts.append('[gap]')
                
                filter_complex = f'{gap_filter}[gap];{"".join(concat_parts)}concat=n={len(concat_parts)}:v=0:a=1[out]'
                
                ffmpeg_cmd = ['ffmpeg', '-y'] + input_specs + [
                    '-filter_complex', filter_complex,
                    '-map', '[out]',
                    output_path
                ]
                
                self.logger.info(f"🎵 多段处理: {len(time_ranges)}段 + {len(time_ranges)-1}个Gap({gap_sec:.3f}s)")
            
            # 执行ffmpeg命令
            await asyncio.to_thread(
                subprocess.run, ffmpeg_cmd,
                capture_output=True, text=True, check=True
            )
            
            # 验证输出文件
            if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
                self.logger.error(f"FFmpeg未生成有效输出文件")
                return False
            
            # 上传到R2
            with open(output_path, 'rb') as f:
                s3_client.put_object(
                    Bucket=bucket_name,
                    Body=f,
                    Key=audio_key,
                    ContentType='audio/wav'
                )
            
            self.logger.info(f"📤 已上传音频到R2: {audio_key}")
            return True
            
        except subprocess.CalledProcessError as e:
            self.logger.error(f"FFmpeg处理失败: {e.stderr}")
            return False
        except Exception as e:
            self.logger.error(f"处理音频异常: {e}")
            return False
        finally:
            # 清理临时文件
            if os.path.exists(output_path):
                os.unlink(output_path)
    
    # 所有旧的处理逻辑已移除，使用新的流式处理方法
    # 原有方法：
    # - _calculate_total_duration_with_gaps
    # - _create_audio_clips
    # - _extract_speech_sentences
    # - _group_by_speaker
    # - _process_speaker_groups
    # - _split_long_group
    # - _should_keep_clip
    # - _generate_clip_info
    # 已全部被流式处理方法取代


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
    
    # 已移除性能优化开关 - 新算法已彻底移除fade逻辑
    
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
            
            # 🎵 创建切分器 - 使用请求参数配置（优先）或环境变量
            segmenter = AudioSegmenter(request.segmentConfig)
            
            # 🚀 使用新的流式处理方法
            s3_client_for_upload = boto3.client(
                's3',
                endpoint_url=f'https://{request.r2Config.accountId}.r2.cloudflarestorage.com',
                aws_access_key_id=request.r2Config.accessKeyId,
                aws_secret_access_key=request.r2Config.secretAccessKey,
                region_name='auto'
            )
            
            segments, sentence_to_segment_map = await segmenter.process_sentences_streaming(
                request.transcripts,
                str(audio_path),
                request.outputPrefix,
                s3_client_for_upload,
                request.r2Config.bucketName
            )
            
            if not segments:
                return SegmentResponse(
                    success=True,
                    segments=[],
                    sentenceToSegmentMap={}
                )
            
            logger.info(f"✅ 流式处理成功生成 {len(segments)} 个音频切片")
            
            return SegmentResponse(
                success=True,
                segments=segments,
                sentenceToSegmentMap=sentence_to_segment_map
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