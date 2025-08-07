"""
任务上下文管理器 - 管理TTS任务的媒体上下文和资源
基于现有的HLSManager和PathManager架构设计
"""
import asyncio
import logging
import aiohttp
from typing import Dict, Optional, Any
from dataclasses import dataclass
from pathlib import Path
import time

from utils.path_manager import PathManager
from utils.async_utils import BackgroundTaskManager
from core.vocal_separator import VocalSeparator
from config import get_config

logger = logging.getLogger(__name__)

@dataclass
class TaskMediaContext:
    """任务媒体上下文数据结构"""
    task_id: str
    user_id: str
    audio_url: str
    video_url: str
    
    # 本地文件路径（下载后填充）
    local_audio_path: Optional[str] = None
    local_video_path: Optional[str] = None
    vocals_path: Optional[str] = None
    instrumental_path: Optional[str] = None
    
    # 状态和元数据
    created_at: float = 0.0
    initialized: bool = False
    error: Optional[str] = None

class TaskContextManager:
    """
    任务上下文管理器
    负责任务级媒体资源的生命周期管理
    """
    
    def __init__(self):
        self.config = get_config()
        self.contexts: Dict[str, TaskMediaContext] = {}
        self.path_managers: Dict[str, PathManager] = {}
        self.locks: Dict[str, asyncio.Lock] = {}
        self.task_manager = BackgroundTaskManager()
        
        # 资源下载配置
        self.download_timeout = 300  # 5分钟超时
        self.max_concurrent_downloads = 3
        self.download_semaphore = asyncio.Semaphore(self.max_concurrent_downloads)
        
        logger.info("TaskContextManager 初始化完成")
    
    async def initialize_task(
        self, 
        task_id: str, 
        user_id: str, 
        audio_url: str, 
        video_url: str
    ) -> Dict[str, Any]:
        """
        初始化任务上下文
        
        Args:
            task_id: 任务ID
            user_id: 用户ID  
            audio_url: 音频文件URL
            video_url: 视频文件URL
            
        Returns:
            初始化结果
        """
        # 获取任务锁
        if task_id not in self.locks:
            self.locks[task_id] = asyncio.Lock()
        
        async with self.locks[task_id]:
            # 检查是否已初始化
            if task_id in self.contexts and self.contexts[task_id].initialized:
                logger.info(f"[{task_id}] 任务上下文已存在，跳过初始化")
                return {"success": True, "message": "任务上下文已存在"}
            
            logger.info(f"[{task_id}] 开始初始化任务上下文")
            logger.info(f"  - 用户ID: {user_id}")
            logger.info(f"  - 音频URL: {audio_url}")
            logger.info(f"  - 视频URL: {video_url}")
            
            try:
                # 创建任务上下文
                context = TaskMediaContext(
                    task_id=task_id,
                    user_id=user_id,
                    audio_url=audio_url,
                    video_url=video_url,
                    created_at=time.time()
                )
                
                # 创建路径管理器
                path_manager = PathManager(task_id)
                
                # 并行下载音视频文件
                download_tasks = [
                    self._download_media_file(audio_url, "audio", path_manager.temp.audio_dir),
                    self._download_media_file(video_url, "video", path_manager.temp.video_dir)
                ]
                
                results = await asyncio.gather(*download_tasks, return_exceptions=True)
                
                # 检查下载结果
                audio_result, video_result = results
                if isinstance(audio_result, Exception):
                    raise audio_result
                if isinstance(video_result, Exception):
                    raise video_result
                
                # 更新上下文
                context.local_audio_path = audio_result
                context.local_video_path = video_result
                
                # 设置PathManager的媒体路径
                path_manager.set_media_paths(audio_result, video_result)
                
                # 可选：音频分离（如果需要背景音乐混合）
                if self.config.tts.enable_audio_separation:
                    logger.info(f"[{task_id}] 开始音频分离")
                    separator = VocalSeparator()
                    if separator.is_available():
                        separation_result = await separator.separate_complete_audio(
                            audio_result, path_manager
                        )
                        if separation_result['success']:
                            context.vocals_path = separation_result['vocals_path']
                            context.instrumental_path = separation_result['instrumental_path']
                            path_manager.set_separated_paths(
                                context.vocals_path,
                                context.instrumental_path
                            )
                            logger.info(f"[{task_id}] 音频分离完成")
                        else:
                            logger.warning(f"[{task_id}] 音频分离失败: {separation_result.get('error')}")
                
                # 标记为已初始化
                context.initialized = True
                
                # 存储上下文
                self.contexts[task_id] = context
                self.path_managers[task_id] = path_manager
                
                logger.info(f"[{task_id}] 任务上下文初始化完成")
                return {
                    "success": True,
                    "message": "任务上下文初始化完成",
                    "local_audio_path": context.local_audio_path,
                    "local_video_path": context.local_video_path,
                    "has_separated_audio": bool(context.vocals_path)
                }
                
            except Exception as e:
                error_msg = f"任务上下文初始化失败: {str(e)}"
                logger.error(f"[{task_id}] {error_msg}")
                
                # 记录错误到上下文
                if task_id in self.contexts:
                    self.contexts[task_id].error = error_msg
                
                # 清理部分资源
                await self._cleanup_task_resources(task_id)
                
                return {
                    "success": False,
                    "error": error_msg
                }
    
    async def _download_media_file(self, url: str, media_type: str, target_dir: Path) -> str:
        """
        下载媒体文件到本地
        
        Args:
            url: 文件URL
            media_type: 媒体类型 (audio/video)
            target_dir: 目标目录
            
        Returns:
            本地文件路径
        """
        async with self.download_semaphore:
            target_dir.mkdir(parents=True, exist_ok=True)
            
            # 生成本地文件名
            file_extension = url.split('.')[-1] if '.' in url else ('aac' if media_type == 'audio' else 'mp4')
            local_filename = f"{media_type}.{file_extension}"
            local_path = target_dir / local_filename
            
            logger.info(f"开始下载 {media_type}: {url} -> {local_path}")
            
            timeout = aiohttp.ClientTimeout(total=self.download_timeout)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url) as response:
                    response.raise_for_status()
                    
                    with open(local_path, 'wb') as f:
                        async for chunk in response.content.iter_chunked(8192):
                            f.write(chunk)
            
            logger.info(f"{media_type} 下载完成: {local_path} ({local_path.stat().st_size} bytes)")
            return str(local_path)
    
    def get_context(self, task_id: str) -> Optional[TaskMediaContext]:
        """获取任务上下文"""
        return self.contexts.get(task_id)
    
    def get_path_manager(self, task_id: str) -> Optional[PathManager]:
        """获取任务的路径管理器"""
        return self.path_managers.get(task_id)
    
    async def cleanup_task(self, task_id: str) -> Dict[str, Any]:
        """
        清理任务资源
        
        Args:
            task_id: 任务ID
            
        Returns:
            清理结果
        """
        logger.info(f"[{task_id}] 开始清理任务资源")
        
        try:
            await self._cleanup_task_resources(task_id)
            logger.info(f"[{task_id}] 任务资源清理完成")
            return {"success": True, "message": "任务资源清理完成"}
            
        except Exception as e:
            error_msg = f"任务资源清理失败: {str(e)}"
            logger.error(f"[{task_id}] {error_msg}")
            return {"success": False, "error": error_msg}
    
    async def _cleanup_task_resources(self, task_id: str):
        """内部资源清理方法"""
        try:
            # 清理PathManager
            if task_id in self.path_managers:
                self.path_managers[task_id].cleanup(force=True)
                del self.path_managers[task_id]
            
            # 清理上下文
            if task_id in self.contexts:
                del self.contexts[task_id]
            
            # 清理锁
            if task_id in self.locks:
                del self.locks[task_id]
            
        except Exception as e:
            logger.error(f"[{task_id}] 资源清理异常: {e}")
    
    async def cleanup_all(self):
        """清理所有资源"""
        logger.info("开始清理所有任务上下文管理器资源")
        
        # 清理所有任务
        task_ids = list(self.contexts.keys())
        cleanup_tasks = [self._cleanup_task_resources(task_id) for task_id in task_ids]
        await asyncio.gather(*cleanup_tasks, return_exceptions=True)
        
        # 关闭后台任务管理器
        await self.task_manager.close()
        
        logger.info("任务上下文管理器资源清理完成")

# 全局单例
_task_context_manager = None

def get_task_context_manager() -> TaskContextManager:
    """获取全局任务上下文管理器单例"""
    global _task_context_manager
    if _task_context_manager is None:
        _task_context_manager = TaskContextManager()
    return _task_context_manager 