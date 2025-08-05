"""
路径管理器 - 管理 R2 存储路径和临时文件
"""
import os
import shutil
import tempfile
from pathlib import Path
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class R2PathManager:
    """管理 R2 存储路径"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
    
    @property
    def hls_prefix(self) -> str:
        """HLS 文件存储路径前缀"""
        return f"hls/{self.task_id}"
    
    @property
    def audio_prompts_prefix(self) -> str:
        """音频提示文件存储路径前缀"""
        return f"audio_prompts/{self.task_id}"
    
    @property
    def segments_prefix(self) -> str:
        """音频片段存储路径前缀"""
        return f"segments/{self.task_id}"
    
    @property
    def outputs_prefix(self) -> str:
        """输出文件存储路径前缀"""
        return f"outputs/{self.task_id}"
    
    @property
    def media_prefix(self) -> str:
        """媒体文件存储路径前缀"""
        return f"media/{self.task_id}"
    
    def get_playlist_key(self) -> str:
        """获取播放列表的 R2 key"""
        return f"{self.hls_prefix}/playlist_{self.task_id}.m3u8"
    
    def get_segment_key(self, segment_name: str) -> str:
        """获取片段的 R2 key"""
        return f"{self.segments_prefix}/{segment_name}"
    
    def get_audio_prompt_key(self, filename: str) -> str:
        """获取音频提示的 R2 key"""
        return f"{self.audio_prompts_prefix}/{filename}"
    
    def get_output_key(self, filename: str) -> str:
        """获取输出文件的 R2 key"""
        return f"{self.outputs_prefix}/{filename}"


class TempFileManager:
    """管理临时文件和目录"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.temp_dir: Optional[Path] = None
        self._subdirs = {}
    
    def create_temp_dir(self) -> Path:
        """创建临时目录"""
        if self.temp_dir is None:
            self.temp_dir = Path(tempfile.mkdtemp(prefix=f"tts_{self.task_id}_"))
            logger.debug(f"创建临时目录: {self.temp_dir}")
        return self.temp_dir
    
    def get_subdir(self, name: str) -> Path:
        """获取或创建子目录"""
        if name not in self._subdirs:
            base_dir = self.create_temp_dir()
            subdir = base_dir / name
            subdir.mkdir(exist_ok=True)
            self._subdirs[name] = subdir
            logger.debug(f"创建子目录: {subdir}")
        return self._subdirs[name]
    
    @property
    def processing_dir(self) -> Path:
        """处理目录"""
        return self.get_subdir("processing")
    
    @property
    def media_dir(self) -> Path:
        """媒体文件目录"""
        return self.get_subdir("media")
    
    @property
    def segments_dir(self) -> Path:
        """片段目录"""
        return self.get_subdir("segments")
    
    @property
    def audio_prompts_dir(self) -> Path:
        """音频提示目录"""
        return self.get_subdir("audio_prompts")
    
    @property
    def tts_output_dir(self) -> Path:
        """TTS输出音频目录"""
        return self.get_subdir("tts_output")
    
    @property
    def separated_dir(self) -> Path:
        """音频分离目录"""
        return self.get_subdir("separated")
    
    def get_temp_file(self, suffix: str = "", prefix: str = "") -> Path:
        """创建临时文件"""
        base_dir = self.create_temp_dir()
        fd, path = tempfile.mkstemp(suffix=suffix, prefix=prefix, dir=base_dir)
        os.close(fd)  # 关闭文件描述符
        return Path(path)
    
    def cleanup(self, force=False):
        """清理临时文件
        
        Args:
            force: 是否强制清理，忽略配置选项
        """
        # 检查是否应该清理临时文件
        from config import get_config
        config = get_config()
        should_cleanup = force or getattr(config, 'CLEANUP_TEMP_FILES', False)
        
        if not should_cleanup:
            logger.info(f"保留临时目录（CLEANUP_TEMP_FILES=false）: {self.temp_dir}")
            return
            
        if self.temp_dir and self.temp_dir.exists():
            try:
                shutil.rmtree(self.temp_dir)
                logger.info(f"清理临时目录: {self.temp_dir}")
            except Exception as e:
                logger.error(f"清理临时目录失败: {e}")
        self.temp_dir = None
        self._subdirs.clear()
    
    def __enter__(self):
        """上下文管理器入口"""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口 - 自动清理"""
        self.cleanup()


class PathManager:
    """统一的路径管理器"""
    
    def __init__(self, task_id: str):
        self.task_id = task_id
        self.r2 = R2PathManager(task_id)
        self.temp = TempFileManager(task_id)
        self.audio_file_path: Optional[str] = None
        self.video_file_path: Optional[str] = None
        self.vocals_file_path: Optional[str] = None
        self.instrumental_file_path: Optional[str] = None
    
    def set_media_paths(self, audio_path: str, video_path: str):
        """设置音频和视频文件路径"""
        self.audio_file_path = audio_path
        self.video_file_path = video_path
    
    def set_separated_paths(self, vocals_path: str, instrumental_path: str):
        """设置分离后的音频文件路径"""
        self.vocals_file_path = vocals_path
        self.instrumental_file_path = instrumental_path
    
    def cleanup(self, force=False):
        """清理临时文件
        
        Args:
            force: 是否强制清理，忽略配置选项
        """
        self.temp.cleanup(force=force)