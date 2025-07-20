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
    """音频切分服务 - 基于精确时间戳和Gap机制的智能音频切片"""
    
    def __init__(self):
        # 从环境变量读取配置参数
        self.gap_duration_ms = int(os.getenv('GAP_DURATION_MS', '500'))
        self.max_duration_ms = int(os.getenv('MAX_DURATION_MS', '12000'))  
        self.min_duration_ms = int(os.getenv('MIN_DURATION_MS', '1500'))  # 改为1500ms
        
        self.logger = logger
        self.logger.info(f"🎵 AudioSegmenter初始化 - Gap:{self.gap_duration_ms}ms, "
                        f"Max:{self.max_duration_ms}ms, Min:{self.min_duration_ms}ms")
        
    # 时间转换函数已移除 - 直接使用毫秒格式，无需转换
    
    def _calculate_total_duration_with_gaps(self, block: List[Dict]) -> int:
        """计算包含gap的总时长"""
        if not block:
            return 0
        
        # 音频总时长
        audio_duration = sum(s['duration'] for s in block)
        
        # Gap总时长 = (句子数量 - 1) * gap_duration_ms
        gap_duration = (len(block) - 1) * self.gap_duration_ms
        
        total = audio_duration + gap_duration
        self.logger.debug(f"时长计算: 音频{audio_duration}ms + Gap{gap_duration}ms = {total}ms")
        
        return total
    
    def _truncate_block_with_gaps(self, block: List[Dict]) -> List[Dict]:
        """考虑gap的智能截断"""
        if not block:
            return block
        
        accumulated_duration = 0
        sentences_to_include = []
        
        for i, sentence in enumerate(block):
            # 当前句子时长
            sentence_duration = sentence['duration']
            
            # 如果不是第一个句子，需要加上gap时长
            gap_duration = self.gap_duration_ms if i > 0 else 0
            
            # 检查是否超过最大时长
            if accumulated_duration + gap_duration + sentence_duration <= self.max_duration_ms:
                sentences_to_include.append(sentence)
                accumulated_duration += gap_duration + sentence_duration
                self.logger.debug(f"包含句子{sentence['sequence']}: 累计{accumulated_duration}ms")
            else:
                # 超过限制，停止添加
                self.logger.debug(f"截断: 句子{sentence['sequence']}会导致超过{self.max_duration_ms}ms")
                break
        
        return sentences_to_include
    
    def _merge_adjacent_short_blocks(self, blocks: List[List[Dict]]) -> List[List[Dict]]:
        """智能合并相邻的同说话人短块，避免误删可合并的片段"""
        if not blocks:
            return blocks
            
        merged_blocks = []
        i = 0
        
        while i < len(blocks):
            current_block = blocks[i]
            current_duration = self._calculate_total_duration_with_gaps(current_block)
            current_speaker = current_block[0]['speaker']
            
            # 如果当前块已经足够长，直接保留
            if current_duration >= self.min_duration_ms:
                merged_blocks.append(current_block)
                i += 1
                continue
            
            # 当前块太短，尝试与后续同说话人块合并
            merged = current_block.copy()
            j = i + 1
            
            while j < len(blocks):
                next_block = blocks[j]
                next_speaker = next_block[0]['speaker']
                
                # 只合并同说话人的块
                if next_speaker != current_speaker:
                    break
                    
                # 尝试合并
                potential_merged = merged + next_block
                potential_duration = self._calculate_total_duration_with_gaps(potential_merged)
                
                # 如果合并后超过最大时长，停止合并
                if potential_duration > self.max_duration_ms:
                    break
                    
                # 执行合并
                merged = potential_merged
                self.logger.info(f"🔗 合并相邻短块: speaker={current_speaker}, "
                               f"blocks {i+1}-{j+1}, duration {current_duration}ms -> {potential_duration}ms")
                
                # 如果合并后达到最小时长，可以停止（但继续检查是否能合并更多）
                if potential_duration >= self.min_duration_ms:
                    # 继续尝试合并，直到达到合理长度或最大时长
                    j += 1
                    if j < len(blocks) and blocks[j][0]['speaker'] == current_speaker:
                        continue
                    else:
                        break
                else:
                    j += 1
            
            # 添加合并后的块（可能仍然很短，但已经是最好的结果）
            merged_blocks.append(merged)
            i = j  # 跳过已合并的块
            
        return merged_blocks
    
    def _process_speaker_block(self, block: List[Dict]) -> Tuple[List[Dict], bool]:
        """处理单个说话人块：合并 -> 截断 -> 验证时长
        
        Returns:
            (final_sentences, should_keep): 处理后的句子列表和是否保留的标志
        """
        if not block:
            return [], False
            
        # 1. 计算合并后的总时长
        total_duration = self._calculate_total_duration_with_gaps(block)
        
        self.logger.debug(f"📊 处理说话人块: speaker='{block[0]['speaker']}', "
                         f"sentences={len(block)}, total_duration={total_duration}ms")
        
        # 2. 如果超过最大时长，进行智能截断
        if total_duration > self.max_duration_ms:
            self.logger.info(f"📏 块时长{total_duration}ms超过最大值{self.max_duration_ms}ms，执行截断")
            final_sentences = self._truncate_block_with_gaps(block)
        else:
            # 块大小合适，直接使用
            final_sentences = block
        
        # 3. 计算截断后的最终时长
        final_duration = self._calculate_total_duration_with_gaps(final_sentences)
        
        # 4. 更宽松的保留策略：只丢弃极短的孤立片段
        # 如果是多句子块，即使略短也保留（因为已经尝试过合并）
        if len(final_sentences) > 1:
            # 多句子块更宽松，只要超过1000ms就保留
            if final_duration < 1000:
                self.logger.warning(f"🗑️ 丢弃极短多句块: speaker='{block[0]['speaker']}', "
                               f"sentences={len(final_sentences)}, duration={final_duration}ms < 1000ms")
                return final_sentences, False
        else:
            # 单句子块使用标准阈值
            if final_duration < self.min_duration_ms:
                self.logger.info(f"🗑️ 丢弃过短单句: speaker='{block[0]['speaker']}', "
                               f"sequence={final_sentences[0]['sequence']}, duration={final_duration}ms < {self.min_duration_ms}ms")
                return final_sentences, False
        
        self.logger.info(f"✅ 保留有效片段: speaker='{block[0]['speaker']}', "
                        f"sentences={len(final_sentences)}, final_duration={final_duration}ms")
        return final_sentences, True
    
    def _create_audio_clips(self, transcripts: List[TranscriptItem]) -> Tuple[Dict, Dict]:
        """根据转录数据创建音频切片计划"""
        self.logger.info(f"🎬 开始处理 {len(transcripts)} 个转录项")
        
        # 分析时间戳范围
        speech_items = [t for t in transcripts if t.content_type == 'speech']
        if speech_items:
            min_time = min(t.startMs for t in speech_items)
            max_time = max(t.endMs for t in speech_items)
            self.logger.info(f"📊 转录时间戳范围: {min_time}ms - {max_time}ms ({(max_time-min_time)/1000:.1f}秒)")
        
        # 🎯 精确时间戳预处理：直接使用转录时间戳，无padding
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
            
            # 🎯 精确时长计算，无padding
            duration = end_ms - start_ms
            
            self.logger.debug(f"  精确时间: [{start_ms}-{end_ms}]ms ({duration}ms)")
            
            sentence_data = {
                'sequence': item.sequence,
                'speaker': item.speaker,
                'original': item.original,
                'translation': item.translation,
                'time_segment': [start_ms, end_ms],  # 精确时间边界
                'duration': duration                # 精确时长
            }
            
            if sentence_data['duration'] > 0:
                sentences.append(sentence_data)
                self.logger.debug(f"  ✅ 添加有效句子: {duration}ms")
            else:
                self.logger.warning(f"  ❌ 句子时长无效: {duration}ms")

        self.logger.info(f"📝 预处理完成，获得 {len(sentences)} 个有效语音句子")
        if not sentences:
            self.logger.warning("⚠️ 没有有效的语音句子，返回空结果")
            return {}, {}

        # 🔧 改进的分组策略：更宽松的连续性判断
        large_blocks = []
        if sentences:
            current_block = [sentences[0]]
            for i in range(1, len(sentences)):
                current_sentence = sentences[i]
                last_sentence = current_block[-1]
                
                # 检查说话人是否相同（移除严格的序列连续性要求）
                same_speaker = current_sentence['speaker'] == last_sentence['speaker']
                # 允许序列号有小跳跃（例如中间有non-speech被过滤）
                sequence_gap = current_sentence['sequence'] - last_sentence['sequence']
                reasonable_gap = sequence_gap <= 3  # 允许最多跳过2个序号
                
                if same_speaker and reasonable_gap:
                    current_block.append(current_sentence)
                else:
                    large_blocks.append(current_block)
                    current_block = [current_sentence]
            large_blocks.append(current_block)

        # 🎵 智能合并策略：相邻同说话人短块尝试合并
        self.logger.info(f"📋 初始分组完成，共 {len(large_blocks)} 个块")
        
        # 显示初始分组情况
        for i, block in enumerate(large_blocks):
            duration = self._calculate_total_duration_with_gaps(block)
            sequences = [s['sequence'] for s in block]
            self.logger.debug(f"  块{i+1}: speaker={block[0]['speaker']}, "
                            f"sentences={len(block)}, duration={duration}ms, sequences={sequences}")
        
        # 🔧 二次处理：合并相邻的同说话人短块
        optimized_blocks = self._merge_adjacent_short_blocks(large_blocks)
        self.logger.info(f"🔄 智能合并后，优化为 {len(optimized_blocks)} 个块")
        
        clips_library = {}
        sentence_to_clip_id_map = {}
        processed_count = 0
        kept_count = 0

        for block in optimized_blocks:
            processed_count += 1
            
            # 处理当前说话人块：合并 -> 截断 -> 验证
            final_sentences, should_keep = self._process_speaker_block(block)
            
            if not should_keep:
                # 添加详细信息帮助调试
                sequences = [s['sequence'] for s in block]
                self.logger.warning(f"⚠️ 即使合并后仍然过短，丢弃块: speaker={block[0]['speaker']}, "
                                  f"sentences={len(block)}, sequences={sequences}")
                continue  # 只有在尝试合并后仍然过短才丢弃
                
            kept_count += 1
            
            # 🎯 使用第一个句子的序号作为标识（更直观）
            first_sequence = final_sentences[0]['sequence']
            clip_id = f"sequence_{first_sequence:04d}"
            
            # 🎵 生成精确音频段列表（用于FFmpeg处理）
            audio_segments = [s['time_segment'] for s in final_sentences]
            
            clips_library[clip_id] = {
                "speaker": final_sentences[0]['speaker'],
                "first_sequence": first_sequence,  # 用于文件命名
                "total_duration_ms": self._calculate_total_duration_with_gaps(final_sentences),
                "audio_segments": audio_segments,  # 精确音频段，用于FFmpeg
                "gap_duration_ms": self.gap_duration_ms,  # gap信息
                "sentences": [{
                    "sequence": s['sequence'], 
                    "original": s['original'], 
                    "translation": s['translation']
                } for s in final_sentences]
            }
            
            # 映射sentence到clip（只映射最终包含的句子）
            for sentence in final_sentences:
                sentence_to_clip_id_map[sentence['sequence']] = clip_id
            
            self.logger.info(f"✅ 生成切片 {clip_id}: 序号{first_sequence}开始, {len(final_sentences)}个句子, "
                           f"总时长{clips_library[clip_id]['total_duration_ms']}ms")
        
        self.logger.info(f"🎯 处理完成: 处理{processed_count}个块，保留{kept_count}个有效片段")

        return clips_library, sentence_to_clip_id_map
    
    # _merge_overlapping_segments方法已移除 - 新算法使用精确时间段和gap机制
    
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
            
            # 🔍 调试：检查clips_library的实际内容
            self.logger.info(f"🔍 调试clips_library结构:")
            for clip_id, clip_info in clips_library.items():
                self.logger.info(f"  clip_id: {clip_id}")
                self.logger.info(f"  clip_info keys: {list(clip_info.keys())}")
                break  # 只显示第一个用于调试
            
            # 获取转录时间戳范围用于时间轴验证
            speech_transcripts = [t for t in clips_library.values() if t.get('sentences')]
            if speech_transcripts:
                all_segments = []
                for clip_info in speech_transcripts:
                    # 🔍 添加安全访问和调试信息
                    if 'audio_segments' in clip_info:
                        all_segments.extend(clip_info['audio_segments'])
                    elif 'segments_to_concatenate' in clip_info:
                        self.logger.warning(f"🚨 发现旧字段名segments_to_concatenate，使用兼容模式")
                        all_segments.extend(clip_info['segments_to_concatenate'])
                    else:
                        self.logger.error(f"❌ clip_info缺少音频段数据，available keys: {list(clip_info.keys())}")
                        continue
                
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
                # 🎯 使用序号命名文件（更直观）
                speaker_clean = clip_info['speaker'].replace(' ', '_').replace('/', '_')
                first_sequence = clip_info.get('first_sequence', 0)
                audio_key = f"{output_prefix}/{first_sequence:04d}_{speaker_clean}.wav"
                
                # 创建临时输出文件
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_file:
                    output_path = tmp_file.name
                
                try:
                    # 🎵 新的FFmpeg处理逻辑 - 支持精确时间戳和Gap机制
                    # 🔍 兼容性访问audio_segments字段
                    if 'audio_segments' in clip_info:
                        audio_segments = clip_info['audio_segments']
                    elif 'segments_to_concatenate' in clip_info:
                        self.logger.warning(f"🚨 切片{clip_id}使用旧字段名segments_to_concatenate")
                        audio_segments = clip_info['segments_to_concatenate']
                    else:
                        self.logger.error(f"❌ 切片{clip_id}缺少音频段数据: {list(clip_info.keys())}")
                        return None
                    
                    gap_duration_ms = clip_info.get('gap_duration_ms', self.gap_duration_ms)
                    
                    if len(audio_segments) == 1:
                        # 🎯 单段处理 - 高性能流复制
                        start_ms, end_ms = audio_segments[0]
                        
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
                        
                        # 验证时间范围
                        audio_duration_sec = total_duration_ms / 1000.0
                        self.logger.info(f"🎵 单段切片 {clip_id}: {start_sec:.3f}s - {start_sec + duration_sec:.3f}s (时长: {duration_sec:.3f}s)")
                        
                        # 🚀 高性能单段切取 - 无fade，纯流复制
                        ffmpeg_cmd = [
                            'ffmpeg', '-y',
                            '-ss', f'{start_sec:.3f}',  # 快速seek
                            '-i', audio_path,
                            '-t', f'{duration_sec:.3f}',
                            '-c:a', 'copy',  # 流复制，保持原始质量
                            '-avoid_negative_ts', 'make_zero',
                            output_path
                        ]
                        
                        self.logger.info(f"📝 单段FFmpeg: {' '.join(ffmpeg_cmd)}")
                        
                    else:
                        # 🎵 多段处理 - Gap静音插入，无fade
                        input_specs = []
                        filter_parts = []
                        
                        # 为每个音频段添加输入
                        for i, (start_ms, end_ms) in enumerate(audio_segments):
                            start_ms = max(0, start_ms)
                            end_ms = min(total_duration_ms, end_ms)
                            duration_ms = end_ms - start_ms
                            
                            if duration_ms <= 0:
                                continue
                                
                            start_sec = start_ms / 1000.0
                            duration_sec = duration_ms / 1000.0
                            
                            # 添加音频段输入
                            input_specs.extend(['-ss', f'{start_sec:.3f}', '-t', f'{duration_sec:.3f}', '-i', audio_path])
                            
                            self.logger.info(f"  段{i+1}: {start_sec:.3f}s - {start_sec + duration_sec:.3f}s ({duration_sec:.3f}s)")
                        
                        if not input_specs:
                            self.logger.warning(f"切片 {clip_id} 无有效音频段，跳过")
                            return None
                        
                        # 🎵 构建filter_complex - Gap静音插入，无fade
                        gap_sec = gap_duration_ms / 1000.0
                        
                        if len(audio_segments) == 1:
                            # 实际只有一个有效段，直接输出
                            filter_complex = '[0:a]anull[out]'
                        else:
                            # 多段拼接，插入gap静音
                            # 生成gap静音源
                            gap_filter = f'anullsrc=channel_layout=mono:sample_rate=44100:duration={gap_sec:.3f}'
                            
                            # 构建拼接序列：音频1 + gap + 音频2 + gap + 音频3...
                            concat_parts = []
                            for i in range(len(audio_segments)):
                                concat_parts.append(f'[{i}:a]')  # 音频段
                                if i < len(audio_segments) - 1:  # 不是最后一个
                                    concat_parts.append('[gap]')  # gap静音
                            
                            filter_complex = f'{gap_filter}[gap];{"".join(concat_parts)}concat=n={len(concat_parts)}:v=0:a=1[out]'
                        
                        ffmpeg_cmd = ['ffmpeg', '-y'] + input_specs + [
                            '-filter_complex', filter_complex,
                            '-map', '[out]',
                            output_path
                        ]
                        
                        self.logger.info(f"🎵 多段切片 {clip_id}: {len(audio_segments)}段 + {len(audio_segments)-1}个Gap({gap_sec:.3f}s)")
                        self.logger.info(f"📝 多段FFmpeg: {' '.join(ffmpeg_cmd[:10])}... (共{len(ffmpeg_cmd)}个参数)")
                    
                    # 执行ffmpeg命令
                    self.logger.info(f"🚀 执行ffmpeg处理切片 {clip_id}: {len(audio_segments)}段, 说话人={clip_info['speaker']}")
                    
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
                        'startMs': audio_segments[0][0],
                        'endMs': audio_segments[-1][1],
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
            
            # 🎵 创建切分器 - 从环境变量读取配置
            segmenter = AudioSegmenter()
            
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