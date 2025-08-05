# ---------------------------------------------------
# backend/core/media_mixer.py (精简版)
# ---------------------------------------------------
import numpy as np
import logging
from typing import List, Optional, Tuple
import asyncio
import gc
import psutil
import os

# 工具函数导入
from utils.audio_utils import apply_fade_effect, mix_with_background, normalize_audio
from utils.video_utils import add_video_segment 
from config import Config
from core.sentence_tools import Sentence
from utils.path_manager import PathManager
from utils.async_utils import BackgroundTaskManager

# 使用全局日志配置，直接获取 logger
logger = logging.getLogger(__name__)

class MediaMixer:
    """
    媒体混合，负责混合音频和视频
    """
    def __init__(self):
        self.config = Config()
        self.sample_rate = self.config.TARGET_SR
        self.max_val = 0.8  # 音频最大值
        self.logger = logging.getLogger(__name__)
        
        # 音频缓冲区设置
        self.full_audio_buffer = np.array([], dtype=np.float32)
        # 滑动窗口优化：固定最大缓冲区大小
        self.max_buffer_samples = int(10.0 * self.sample_rate)  # 最多保留10秒音频
        
        # 内存管理配置
        self.max_buffer_duration = getattr(self.config, 'MAX_BUFFER_DURATION', 10.0)  # 最大缓冲时长（秒）
        self.memory_threshold_mb = getattr(self.config, 'MEMORY_THRESHOLD_MB', 500)  # 内存阈值（MB）
        self.cleanup_interval = getattr(self.config, 'CLEANUP_INTERVAL', 5)  # 清理间隔（批次）
        self.batch_counter = 0  # 批次计数器
        
        # 任务管理器
        self.task_manager = BackgroundTaskManager()
        
        # 内存监控
        self.process = psutil.Process(os.getpid())
        
        self.logger.info(f"MediaMixer初始化完成，采样率={self.sample_rate}")
        self.logger.info(f"内存管理配置 - 最大缓冲时长: {self.max_buffer_duration}s, 内存阈值: {self.memory_threshold_mb}MB")
        
    
    def _get_memory_usage(self) -> float:
        """获取当前内存使用量（MB）"""
        try:
            memory_info = self.process.memory_info()
            return memory_info.rss / (1024 * 1024)  # 转换为MB
        except Exception:
            return 0.0
    
    def _should_cleanup_buffer(self) -> bool:
        """检查是否需要清理缓冲区"""
        # 检查缓冲区大小
        buffer_duration = len(self.full_audio_buffer) / self.sample_rate
        if buffer_duration > self.max_buffer_duration:
            return True
        
        # 检查内存使用量
        memory_usage = self._get_memory_usage()
        if memory_usage > self.memory_threshold_mb:
            return True
        
        # 检查批次间隔
        if self.batch_counter % self.cleanup_interval == 0:
            return True
        
        return False
    
    def _cleanup_buffer(self):
        """清理音频缓冲区"""
        if len(self.full_audio_buffer) == 0:
            return
        
        # 保留最后几秒的音频用于平滑过渡
        preserve_duration = min(5.0, self.max_buffer_duration * 0.5)
        preserve_samples = int(preserve_duration * self.sample_rate)
        
        if len(self.full_audio_buffer) > preserve_samples:
            old_size = len(self.full_audio_buffer)
            self.full_audio_buffer = self.full_audio_buffer[-preserve_samples:]
            
            # 手动触发垃圾回收
            gc.collect()
            
            memory_usage = self._get_memory_usage()
            self.logger.info(
                f"缓冲区清理完成 - 保留样本: {preserve_samples}, "
                f"释放样本: {old_size - preserve_samples}, "
                f"当前内存: {memory_usage:.2f}MB"
            )
    
    def _create_status_update_task(self, task_id: str, status: str):
        """创建状态更新后台任务"""
        def error_handler(e: Exception):
            self.logger.error(f"状态更新失败 [任务ID: {task_id}] [状态: {status}]: {e}")
        
    
    async def mix_media(
            self,
            sentences_batch: List[Sentence],
            path_manager: PathManager,
            batch_counter: int,
            task_id: str
    ) -> Optional[str]:
        """处理一批句子并返回处理后的视频片段路径"""
        try:
            # 更新批次计数器
            self.batch_counter = batch_counter
            
            # 记录内存使用情况
            memory_usage = self._get_memory_usage()
            buffer_duration = len(self.full_audio_buffer) / self.sample_rate
            
            self.logger.info(
                f"[{task_id}] 开始处理批次 {batch_counter} - "
                f"句子数: {len(sentences_batch)}, "
                f"内存使用: {memory_usage:.2f}MB, "
                f"缓冲区时长: {buffer_duration:.2f}s"
            )
            
            # 第一批次时更新状态
            if batch_counter == 0:
                self.logger.info(f"[{task_id}] 第一批次，更新状态为 'mixing'")
                self._create_status_update_task(task_id, 'mixing')

            if not sentences_batch:
                logger.warning(f"[{task_id}] mix_media: 收到空的句子列表")
                return None

            # 使用传递的path_manager获取媒体文件路径
            media_files = {}
            target_language = 'zh'  # 默认中文
            generate_subtitle = False  # 默认不生成字幕
            
            # 从path_manager获取媒体文件路径
            media_files['silent_video_path'] = path_manager.video_file_path
            media_files['vocals_audio_path'] = path_manager.audio_file_path
            media_files['background_audio_path'] = path_manager.instrumental_file_path  # 使用分离的背景音
            media_files['video_width'] = 1920  # 默认视频尺寸
            media_files['video_height'] = 1080
            
            if not media_files.get('silent_video_path') or not media_files.get('vocals_audio_path'):
                self.logger.error(f"[{task_id}] MediaMixer: 缺少视频或音频文件路径")
                return None
            
            output_path = path_manager.temp.segments_dir / f"segment_{batch_counter}.mp4"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            max_val = 1.0
            
            success, updated_buffer = await create_mixed_segment(
                sentences=sentences_batch,
                media_files=media_files,
                output_path=str(output_path),
                generate_subtitle=generate_subtitle,
                config=self.config,
                sample_rate=self.sample_rate,
                max_val=max_val,
                full_audio_buffer=self.full_audio_buffer,
                task_id=task_id,
                target_language=target_language,
                max_buffer_samples=self.max_buffer_samples  # 传递滑动窗口参数
            )
            
            if not success:
                logger.error(f"[{task_id}] 批次 {batch_counter} 处理失败")
                return None
            
            # 更新缓冲区
            self.full_audio_buffer = updated_buffer
            
            logger.info(f"[{task_id}] 批次 {batch_counter} 处理完成")
            
            # 清理临时变量
            if 'updated_buffer' in locals() and updated_buffer is not self.full_audio_buffer:
                del updated_buffer
            
            # 定期强制垃圾回收（保留这个机制以提高内存效率）
            if batch_counter % self.cleanup_interval == 0:
                gc.collect()
            
            return str(output_path)
        except Exception as e:
            self.logger.error(f"[{task_id}] 音视频混合处理失败: {e}")
            return None
    
    async def cleanup(self):
        """清理MediaMixer资源"""
        try:
            if self.task_manager:
                await self.task_manager.close()
                self.logger.info("MediaMixer任务管理器已关闭")
                
            # 清理缓冲区
            if hasattr(self, 'full_audio_buffer'):
                del self.full_audio_buffer
                
            # 强制垃圾回收
            gc.collect()
            
        except Exception as e:
            self.logger.error(f"MediaMixer清理失败: {e}")

async def create_mixed_segment(
    sentences: List[Sentence],
    media_files: dict,
    output_path: str,
    generate_subtitle: bool,
    config: Config,
    sample_rate: int,
    max_val: float,
    full_audio_buffer: np.ndarray,
    task_id: str,
    target_language: str,
    max_buffer_samples: int
) -> Tuple[bool, np.ndarray]:
    """
    将一批句子的合成音频与原视频片段混合，并可生成带字幕的视频。
    返回(成功标志, 更新后的音频缓冲区)
    """
    full_audio = None
    updated_audio_buffer = None
    audio_data = None
    
    try:
        if not sentences:
            logger.warning(f"[{task_id}] create_mixed_segment: 收到空的句子列表")
            return False, full_audio_buffer

        full_audio = _concat_audio_segments(sentences, full_audio_buffer, config.AUDIO_OVERLAP)
        if len(full_audio) == 0:
            logger.error(f"[{task_id}] create_mixed_segment: 没有有效的合成音频数据")
            return False, full_audio_buffer

        start_time_param, duration = _calculate_time_params(sentences)

        if not media_files:
            logger.error(f"[{task_id}] create_mixed_segment: 找不到媒体文件信息")
            return False, full_audio_buffer

        background_audio_path = media_files.get('background_audio_path')
        if background_audio_path:
            audio_data = await _process_background_audio(
                background_audio_path, 
                start_time_param, 
                duration, 
                full_audio,
                sample_rate, 
                config.VOCALS_VOLUME, 
                config.BACKGROUND_VOLUME, 
                max_val
            )
            if audio_data is not None:
                full_audio = audio_data
                del audio_data
                audio_data = None

        video_path = media_files.get('silent_video_path')
        if not video_path:
            logger.warning(f"[{task_id}] create_mixed_segment: 本片段无video_path可用")
            return False, full_audio_buffer
            
        # Extract video_width and video_height from media_files
        video_width = media_files.get('video_width', -1)
        video_height = media_files.get('video_height', -1)
        if video_width == -1 or video_height == -1:
            logger.warning(f"[{task_id}] create_mixed_segment: video_width or video_height not found or invalid in media_files. Defaulting or skipping scaling.")
            # Potentially set to a default or handle error, for now, it will pass -1

        updated_audio_buffer = np.concatenate((full_audio_buffer, full_audio))
        
        # 滑动窗口优化：只保留最后N秒的音频
        if len(updated_audio_buffer) > max_buffer_samples:
            updated_audio_buffer = updated_audio_buffer[-max_buffer_samples:]

        await add_video_segment(
            video_path=video_path,
            start_time=start_time_param,
            duration=duration,
            audio_data=full_audio,
            output_path=output_path,
            sentences=sentences,
            generate_subtitle=generate_subtitle,
            target_language=target_language,
            sample_rate=sample_rate,
            video_width=video_width,      # Pass video_width
            video_height=video_height    # Pass video_height
        )
        
        return True, updated_audio_buffer
        
    except Exception as e:
        logger.exception(f"[{task_id}] create_mixed_segment 执行出错，错误: {e}")
        return False, full_audio_buffer
    finally:
        if 'full_audio' in locals() and full_audio is not None and full_audio is not updated_audio_buffer: 
            del full_audio

def _concat_audio_segments(sentences: List[Sentence], full_audio_buffer: np.ndarray, overlap: float) -> np.ndarray:
    """拼接所有句子的合成音频"""
    full_audio = np.array([], dtype=np.float32)
    for sentence in sentences:
        if sentence.generated_audio is not None and len(sentence.generated_audio) > 0:
            audio_data = np.asarray(sentence.generated_audio, dtype=np.float32)
            if len(full_audio) > 0:
                audio_data = apply_fade_effect(audio_data, full_audio_buffer, overlap)
            full_audio = np.concatenate((full_audio, audio_data))
        else:
            logger.warning(
                "句子音频生成失败或为空: text=%r, UUID=%s",
                sentence.original_text,
                sentence.model_input.get("uuid", "unknown")
            )
    return full_audio

def _calculate_time_params(sentences: List[Sentence]) -> tuple:
    """计算时间参数"""

    start_time = 0.0
    if not sentences[0].is_first:
        start_time = sentences[0].adjusted_start / 1000.0
    duration = sum(s.adjusted_duration for s in sentences) / 1000.0
    return start_time, duration

async def _process_background_audio(
    bg_path: str, start_time: float, duration: float, audio_data: np.ndarray,
    sample_rate: int, vocals_volume: float, background_volume: float, max_val: float
) -> np.ndarray:
    """处理背景音频 - 异步版本"""
    try:
        mixed_audio = await mix_with_background(
            bg_path=bg_path,
            start_time=start_time,
            duration=duration,
            audio_data=audio_data,
            sample_rate=sample_rate,
            vocals_volume=vocals_volume,
            background_volume=background_volume
        )
        return normalize_audio(mixed_audio, max_val)
    finally:
        if 'mixed_audio' in locals():
            del mixed_audio
