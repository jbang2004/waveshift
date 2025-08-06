"""
音频样本管理器 - 负责从URL下载音频到本地并提供缓存
"""
import os
import asyncio
import hashlib
import logging
from pathlib import Path
from typing import Optional, Dict
import aiohttp
import aiofiles

logger = logging.getLogger(__name__)

class AudioSampleManager:
    """
    音频样本管理器
    - 支持从HTTP URL下载音频文件
    - 提供本地缓存避免重复下载
    - 自动管理临时文件生命周期
    """
    
    def __init__(self, cache_dir: Optional[Path] = None):
        """
        初始化音频样本管理器
        
        Args:
            cache_dir: 缓存目录，如果为None则使用临时目录
        """
        if cache_dir is None:
            # 使用/tmp下的缓存目录
            cache_dir = Path("/tmp/tts_audio_cache")
        
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # URL到本地路径的映射缓存
        self._download_cache: Dict[str, str] = {}
        
        # 下载锁，避免同一URL被并发下载多次
        self._download_locks: Dict[str, asyncio.Lock] = {}
        
        logger.info(f"音频样本管理器初始化，缓存目录: {self.cache_dir}")
    
    def _get_cache_filename(self, url: str) -> str:
        """
        根据URL生成缓存文件名
        
        Args:
            url: 音频URL
            
        Returns:
            缓存文件名
        """
        # 使用URL的MD5作为文件名，保留扩展名
        url_hash = hashlib.md5(url.encode()).hexdigest()
        
        # 尝试从URL中提取扩展名
        ext = ".wav"  # 默认扩展名
        if "." in url.split("/")[-1]:
            ext = "." + url.split(".")[-1].split("?")[0]  # 处理带参数的URL
            if ext not in [".wav", ".mp3", ".aac", ".m4a", ".flac"]:
                ext = ".wav"  # 不识别的扩展名使用默认值
        
        return f"{url_hash}{ext}"
    
    async def get_local_path(self, audio_source: str) -> str:
        """
        获取音频的本地路径（从URL下载或从缓存获取）
        
        Args:
            audio_source: 音频源，可以是本地路径或HTTP URL
            
        Returns:
            本地文件路径
            
        Raises:
            Exception: 下载失败时抛出异常
        """
        # 如果已经是本地路径，直接返回
        if not audio_source.startswith(("http://", "https://")):
            # 检查文件是否存在
            if os.path.exists(audio_source):
                return audio_source
            else:
                logger.warning(f"本地音频文件不存在: {audio_source}")
                raise FileNotFoundError(f"音频文件不存在: {audio_source}")
        
        # 检查内存缓存
        if audio_source in self._download_cache:
            cached_path = self._download_cache[audio_source]
            if Path(cached_path).exists():
                logger.debug(f"使用缓存的音频文件: {cached_path}")
                return cached_path
            else:
                # 缓存文件已被删除，清理内存缓存
                del self._download_cache[audio_source]
        
        # 获取或创建该URL的下载锁
        if audio_source not in self._download_locks:
            self._download_locks[audio_source] = asyncio.Lock()
        
        lock = self._download_locks[audio_source]
        
        async with lock:
            # 再次检查（可能其他协程已经下载完成）
            if audio_source in self._download_cache:
                cached_path = self._download_cache[audio_source]
                if Path(cached_path).exists():
                    return cached_path
            
            # 下载音频文件
            filename = self._get_cache_filename(audio_source)
            local_path = self.cache_dir / filename
            
            # 如果文件已存在（之前下载过但不在内存缓存中）
            if local_path.exists():
                logger.info(f"发现已下载的音频文件: {local_path}")
                self._download_cache[audio_source] = str(local_path)
                return str(local_path)
            
            # 执行下载
            logger.info(f"开始下载音频: {audio_source}")
            try:
                await self._download_file(audio_source, local_path)
                self._download_cache[audio_source] = str(local_path)
                logger.info(f"音频下载完成: {local_path} (大小: {local_path.stat().st_size} bytes)")
                return str(local_path)
            except Exception as e:
                logger.error(f"下载音频失败: {audio_source}, 错误: {e}")
                # 清理可能的部分下载文件
                if local_path.exists():
                    local_path.unlink()
                raise
    
    async def _download_file(self, url: str, local_path: Path, 
                            timeout: int = 30, 
                            max_retries: int = 3) -> None:
        """
        下载文件到本地
        
        Args:
            url: 文件URL
            local_path: 本地保存路径
            timeout: 超时时间（秒）
            max_retries: 最大重试次数
            
        Raises:
            Exception: 下载失败时抛出异常
        """
        retry_count = 0
        last_error = None
        
        while retry_count < max_retries:
            try:
                timeout_config = aiohttp.ClientTimeout(total=timeout)
                async with aiohttp.ClientSession(timeout=timeout_config) as session:
                    async with session.get(url) as response:
                        response.raise_for_status()
                        
                        # 获取文件大小（如果有）
                        content_length = response.headers.get('Content-Length')
                        if content_length:
                            logger.debug(f"下载文件大小: {int(content_length):,} bytes")
                        
                        # 异步写入文件
                        content = await response.read()
                        async with aiofiles.open(local_path, 'wb') as f:
                            await f.write(content)
                        
                        return  # 下载成功
                        
            except asyncio.TimeoutError:
                last_error = f"下载超时（{timeout}秒）"
                logger.warning(f"下载超时，重试 {retry_count + 1}/{max_retries}: {url}")
            except aiohttp.ClientError as e:
                last_error = f"HTTP错误: {e}"
                logger.warning(f"HTTP错误，重试 {retry_count + 1}/{max_retries}: {e}")
            except Exception as e:
                last_error = f"未知错误: {e}"
                logger.warning(f"下载失败，重试 {retry_count + 1}/{max_retries}: {e}")
            
            retry_count += 1
            if retry_count < max_retries:
                # 指数退避重试
                await asyncio.sleep(2 ** retry_count)
        
        # 所有重试都失败
        raise Exception(f"下载失败（重试{max_retries}次后）: {last_error}")
    
    def clear_cache(self, keep_recent: bool = False) -> int:
        """
        清理缓存目录
        
        Args:
            keep_recent: 是否保留最近使用的文件
            
        Returns:
            清理的文件数量
        """
        count = 0
        
        if not keep_recent:
            # 清理所有缓存文件
            for file_path in self.cache_dir.glob("*"):
                if file_path.is_file():
                    try:
                        file_path.unlink()
                        count += 1
                    except Exception as e:
                        logger.error(f"删除缓存文件失败: {file_path}, 错误: {e}")
            
            # 清空内存缓存
            self._download_cache.clear()
        else:
            # 基于时间的清理策略（保留最近使用的文件）
            import time
            current_time = time.time()
            for file_path in self.cache_dir.glob("*"):
                if file_path.is_file():
                    # 删除1小时前的文件
                    if current_time - file_path.stat().st_mtime > 3600:
                        try:
                            file_path.unlink()
                            count += 1
                        except Exception as e:
                            logger.error(f"删除缓存文件失败: {file_path}, 错误: {e}")
        
        logger.info(f"清理了 {count} 个缓存文件")
        return count
    
    def get_cache_size(self) -> int:
        """
        获取缓存目录的总大小（字节）
        
        Returns:
            缓存大小（字节）
        """
        total_size = 0
        for file_path in self.cache_dir.glob("*"):
            if file_path.is_file():
                total_size += file_path.stat().st_size
        return total_size
    
    def get_cache_info(self) -> dict:
        """
        获取缓存信息
        
        Returns:
            缓存信息字典
        """
        file_count = len(list(self.cache_dir.glob("*")))
        cache_size = self.get_cache_size()
        
        return {
            "cache_dir": str(self.cache_dir),
            "file_count": file_count,
            "cache_size_bytes": cache_size,
            "cache_size_mb": round(cache_size / (1024 * 1024), 2),
            "memory_cache_count": len(self._download_cache)
        }


# 全局实例（可选）
_global_manager: Optional[AudioSampleManager] = None

def get_audio_sample_manager() -> AudioSampleManager:
    """
    获取全局音频样本管理器实例
    
    Returns:
        AudioSampleManager实例
    """
    global _global_manager
    if _global_manager is None:
        _global_manager = AudioSampleManager()
    return _global_manager