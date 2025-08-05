# core/hls_manager.py
import logging
import m3u8
import os.path
import shutil
import time
import asyncio
from pathlib import Path
from typing import Union, Optional, Dict, List

import aiofiles
from utils.ffmpeg_utils import hls_segment, concat_videos
from utils.path_manager import PathManager
from config import Config
from core.cloudflare.d1_client import D1Client
from core.cloudflare.r2_hls_storage_manager import R2HLSStorageManager

logger = logging.getLogger(__name__)

class HLSManager:
    """HLS流媒体管理器 - 支持多任务管理和并行上传优化"""
    def __init__(self, d1_client: D1Client = None):
        self.config = Config()
        
        # 使用依赖注入的客户端，如果没有则创建新的（向后兼容）
        if d1_client is not None:
            self.d1_client = d1_client
        else:
            self.d1_client = D1Client(
                account_id=self.config.CLOUDFLARE_ACCOUNT_ID,
                api_token=self.config.CLOUDFLARE_API_TOKEN,
                database_id=self.config.CLOUDFLARE_D1_DATABASE_ID
            )
        
        # 初始化R2 HLS存储管理器
        self.hls_storage_manager = R2HLSStorageManager(config=self.config)
        self.logger = logging.getLogger(__name__)
        
        # 存储每个任务的HLS管理信息
        self.task_managers = {}
        
        # 并发锁，每个任务一个锁
        self.locks = {}
        
        # 并行上传优化
        self.upload_queues = {}  # 每个任务的上传队列
        self.upload_workers = {}  # 每个任务的上传工作器
        self.upload_semaphore = asyncio.Semaphore(3)  # 限制并发上传数
        
        self.logger.info("HLS管理器已初始化（支持并行上传优化）")

    async def create_manager(self, task_id: str, path_manager: PathManager) -> Dict:
        """
        为特定任务创建HLS管理器
        
        Args:
            task_id: 任务ID
            path_manager: 路径管理器
            
        Returns:
            Dict: 包含状态信息的字典
        """
        # 如果任务已存在，直接返回
        if task_id in self.task_managers:
            self.logger.info(f"任务 {task_id} 的HLS管理器已存在")
            return {"status": "success", "message": "任务HLS管理器已存在"}
        
        # 创建任务锁
        self.locks[task_id] = asyncio.Lock()
        
        async with self.locks[task_id]:
            try:
                playlist_path = path_manager.temp.get_temp_file(suffix=".m3u8", prefix="playlist_")
                segments_dir = path_manager.temp.segments_dir
                
                # 创建播放列表
                playlist = m3u8.M3U8()
                playlist.version = 3
                playlist.target_duration = 10  # 与实际分段时长保持一致
                playlist.media_sequence = 0
                playlist.playlist_type = 'EVENT'  # EVENT类型支持实时流
                playlist.is_endlist = False
                
                # 优化流式播放的配置
                playlist.allow_cache = False  # 禁用缓存，确保播放器获取最新版本
                playlist.program_date_time = None  # 可以添加时间戳支持
                
                sequence_number = 0
                has_segments = False
                
                # 尝试从Storage恢复现有播放列表
                if self.config.ENABLE_HLS_STORAGE:
                    try:
                        existing_content = await self.hls_storage_manager.get_existing_playlist_content(task_id)
                        if existing_content:
                            existing_playlist = m3u8.loads(existing_content)
                            if existing_playlist.segments:
                                # 恢复现有片段 - 逐个添加以保持SegmentList类型
                                for segment in existing_playlist.segments:
                                    playlist.add_segment(segment)
                                sequence_number = len(existing_playlist.segments)
                                has_segments = True
                                playlist.media_sequence = existing_playlist.media_sequence or 0
                                self.logger.info(f"[{task_id}] 从Storage恢复了 {len(existing_playlist.segments)} 个HLS片段")
                    except Exception as e:
                        self.logger.debug(f"[{task_id}] 无法从Storage恢复播放列表: {e}")
                
                # 存储任务管理信息
                self.task_managers[task_id] = {
                    "path_manager": path_manager,
                    "playlist_path": playlist_path,
                    "segments_dir": segments_dir,
                    "playlist": playlist,
                    "sequence_number": sequence_number,
                    "has_segments": has_segments,
                    "segment_time": 10,  # 默认分段时间为10秒
                    "created_at": time.time()
                }
                
                # 初始化并行上传支持
                await self._init_parallel_upload(task_id)
                
                # 保存初始播放列表
                await self._save_playlist(task_id)
                
                self.logger.info(f"已为任务 {task_id} 创建HLS管理器")
                return {"status": "success", "message": "HLS管理器创建成功"}
            except Exception as e:
                error_message = f"为任务 {task_id} 创建HLS管理器失败: {e}"
                self.logger.error(error_message)

                # 清理已创建的部分资源
                if task_id in self.task_managers:
                    del self.task_managers[task_id]
                if task_id in self.locks:
                    del self.locks[task_id]
                    
                # 清理可能已创建的上传工作器和队列
                if task_id in self.upload_workers:
                    worker = self.upload_workers[task_id]
                    worker.cancel()  # 取消未完成的工作器
                    del self.upload_workers[task_id]
                    
                if task_id in self.upload_queues:
                    del self.upload_queues[task_id]
                return {"status": "error", "message": f"创建HLS管理器失败: {str(e)}"}

    async def _init_parallel_upload(self, task_id: str) -> None:
        """
        初始化任务的并行上传支持
        
        Args:
            task_id: 任务ID
        """
        try:
            # 创建上传队列
            self.upload_queues[task_id] = asyncio.Queue(maxsize=10)
            
            # 启动上传工作器
            self.upload_workers[task_id] = asyncio.create_task(
                self._upload_worker(task_id),
                name=f"hls_upload_worker_{task_id}"
            )
            
            self.logger.info(f"[{task_id}] 并行上传支持已初始化")
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 初始化并行上传失败: {e}")
            # 不抛出异常，降级到串行模式
    
    async def _upload_worker(self, task_id: str) -> None:
        """
        并行上传工作器 - 后台处理上传任务
        
        Args:
            task_id: 任务ID
        """
        self.logger.info(f"[{task_id}] 上传工作器启动")
        
        upload_count = 0
        failed_count = 0
        
        try:
            while True:
                try:
                    # 从队列获取上传任务（设置超时避免无限等待）
                    upload_item = await asyncio.wait_for(
                        self.upload_queues[task_id].get(), timeout=30.0
                    )
                    
                    # 检查停止信号
                    if upload_item is None:
                        self.logger.info(f"[{task_id}] 上传工作器收到停止信号")
                        break
                    
                    # 处理上传任务
                    async with self.upload_semaphore:
                        success = await self._process_upload_item(task_id, upload_item)
                        
                        if success:
                            upload_count += 1
                            self.logger.debug(f"[{task_id}] 上传任务完成: {upload_item['type']}")
                        else:
                            failed_count += 1
                            self.logger.warning(f"[{task_id}] 上传任务失败: {upload_item['type']}")
                    
                    # 标记队列任务完成
                    self.upload_queues[task_id].task_done()
                    
                except asyncio.TimeoutError:
                    # 队列空闲超时，继续等待
                    self.logger.debug(f"[{task_id}] 上传工作器空闲等待")
                    continue
                    
                except Exception as e:
                    failed_count += 1
                    self.logger.error(f"[{task_id}] 上传工作器处理异常: {e}")
                    continue
        
        except Exception as e:
            self.logger.error(f"[{task_id}] 上传工作器严重异常: {e}")
        finally:
            self.logger.info(
                f"[{task_id}] 上传工作器关闭 - "
                f"成功: {upload_count}, 失败: {failed_count}"
            )
    
    async def _process_upload_item(self, task_id: str, upload_item: Dict) -> bool:
        """
        处理单个上传任务
        
        Args:
            task_id: 任务ID
            upload_item: 上传任务项
            
        Returns:
            bool: 上传是否成功
        """
        try:
            upload_type = upload_item['type']
            start_time = time.time()
            
            if upload_type == 'segments':
                # 上传段文件
                segment_files = upload_item['files']
                upload_result = await self.hls_storage_manager.batch_upload_segments(
                    task_id, segment_files
                )
                
                success = upload_result.get("status") in ["success", "partial"]
                if success:
                    uploaded_count = upload_result.get('uploaded_count', 0)
                    self.logger.info(
                        f"[{task_id}] 段文件批量上传完成: {uploaded_count}/{len(segment_files)}, "
                        f"耗时: {time.time() - start_time:.2f}s"
                    )
                else:
                    self.logger.warning(f"[{task_id}] 段文件上传失败: {upload_result.get('message')}")
                
                return success
                
            elif upload_type == 'playlist':
                # 上传播放列表
                await self._upload_playlist_to_storage(task_id)
                self.logger.info(
                    f"[{task_id}] 播放列表上传完成, "
                    f"耗时: {time.time() - start_time:.2f}s"
                )
                return True
                
            else:
                self.logger.warning(f"[{task_id}] 未知的上传任务类型: {upload_type}")
                return False
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 处理上传任务异常: {e}")
            return False
    
    async def _queue_segment_upload(self, task_id: str, segment_files: List[str]) -> None:
        """
        将段文件上传任务加入队列
        
        Args:
            task_id: 任务ID
            segment_files: 段文件路径列表
        """
        try:
            if task_id in self.upload_queues:
                upload_item = {
                    'type': 'segments',
                    'files': segment_files,
                    'timestamp': time.time()
                }
                
                # 非阻塞方式加入队列
                try:
                    self.upload_queues[task_id].put_nowait(upload_item)
                    self.logger.debug(
                        f"[{task_id}] 段文件上传任务已入队: {len(segment_files)} 个文件, "
                        f"队列大小: {self.upload_queues[task_id].qsize()}"
                    )
                except asyncio.QueueFull:
                    # 队列满时降级到同步上传
                    self.logger.warning(f"[{task_id}] 上传队列已满，降级到同步上传")
                    await self._fallback_upload_segments(task_id, segment_files)
            else:
                # 没有队列时降级到同步上传
                await self._fallback_upload_segments(task_id, segment_files)
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 队列段文件上传失败: {e}")
            # 降级到同步上传
            await self._fallback_upload_segments(task_id, segment_files)
    
    async def _queue_playlist_upload(self, task_id: str) -> None:
        """
        将播放列表上传任务加入队列
        
        Args:
            task_id: 任务ID
        """
        try:
            if task_id in self.upload_queues:
                upload_item = {
                    'type': 'playlist',
                    'timestamp': time.time()
                }
                
                # 非阻塞方式加入队列
                try:
                    self.upload_queues[task_id].put_nowait(upload_item)
                    self.logger.debug(
                        f"[{task_id}] 播放列表上传任务已入队, "
                        f"队列大小: {self.upload_queues[task_id].qsize()}"
                    )
                except asyncio.QueueFull:
                    # 队列满时降级到同步上传
                    self.logger.warning(f"[{task_id}] 上传队列已满，降级到同步播放列表上传")
                    await self._upload_playlist_to_storage(task_id)
            else:
                # 没有队列时降级到同步上传
                await self._upload_playlist_to_storage(task_id)
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 队列播放列表上传失败: {e}")
            # 降级到同步上传
            await self._upload_playlist_to_storage(task_id)
    
    async def _fallback_upload_segments(self, task_id: str, segment_files: List[str]) -> None:
        """
        降级的段文件上传
        
        Args:
            task_id: 任务ID
            segment_files: 段文件路径列表
        """
        try:
            upload_result = await self.hls_storage_manager.batch_upload_segments(task_id, segment_files)
            if upload_result["status"] in ["success", "partial"]:
                self.logger.info(f"[{task_id}] 同步段文件上传完成: {upload_result['uploaded_count']}/{len(segment_files)}")
            else:
                self.logger.warning(f"[{task_id}] 同步段文件上传失败")
        except Exception as e:
            self.logger.error(f"[{task_id}] 同步段文件上传异常: {e}")
    
    async def _wait_for_uploads_completion(self, task_id: str, timeout: float = 60.0) -> None:
        """
        等待任务的所有并行上传完成
        
        Args:
            task_id: 任务ID
            timeout: 超时时间（秒）
        """
        try:
            if task_id not in self.upload_queues or task_id not in self.upload_workers:
                self.logger.info(f"[{task_id}] 没有并行上传队列，无需等待")
                return
            
            self.logger.info(f"[{task_id}] 等待所有上传任务完成...")
            start_time = time.time()
            
            # 等待队列中的所有任务完成
            try:
                await asyncio.wait_for(
                    self.upload_queues[task_id].join(), timeout=timeout
                )
                wait_duration = time.time() - start_time
                self.logger.info(f"[{task_id}] 上传队列任务全部完成，耗时: {wait_duration:.2f}s")
                
            except asyncio.TimeoutError:
                queue_size = self.upload_queues[task_id].qsize()
                self.logger.warning(
                    f"[{task_id}] 等待上传完成超时，剩余任务: {queue_size}, "
                    f"超时时间: {timeout}s"
                )
            
            # 停止上传工作器
            await self._stop_upload_worker(task_id)
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 等待上传完成异常: {e}")
    
    async def _stop_upload_worker(self, task_id: str) -> None:
        """
        停止任务的上传工作器
        
        Args:
            task_id: 任务ID
        """
        try:
            if task_id in self.upload_queues:
                # 发送停止信号
                await self.upload_queues[task_id].put(None)
                self.logger.debug(f"[{task_id}] 上传工作器停止信号已发送")
            
            if task_id in self.upload_workers:
                worker = self.upload_workers[task_id]
                try:
                    await asyncio.wait_for(worker, timeout=5.0)
                    self.logger.info(f"[{task_id}] 上传工作器已正常关闭")
                except asyncio.TimeoutError:
                    worker.cancel()
                    self.logger.warning(f"[{task_id}] 上传工作器强制取消")
                except Exception as e:
                    self.logger.error(f"[{task_id}] 上传工作器关闭异常: {e}")
                
                # 清理工作器引用
                del self.upload_workers[task_id]
            
            # 清理队列引用
            if task_id in self.upload_queues:
                del self.upload_queues[task_id]
                
            self.logger.info(f"[{task_id}] 并行上传资源已清理")
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 停止上传工作器异常: {e}")

    async def _save_playlist(self, task_id: str) -> None:
        """
        保存特定任务的播放列表到文件
        
        Args:
            task_id: 任务ID
        """
        if task_id not in self.task_managers:
            raise ValueError(f"任务 {task_id} 的HLS管理器不存在")
            
        manager = self.task_managers[task_id]
        playlist = manager["playlist"]
        playlist_path = manager["playlist_path"]
        
        try:
            for segment in playlist.segments:
                # 确保 URI 带有斜杠
                if segment.uri is not None and not segment.uri.startswith('/'):
                    segment.uri = '/' + segment.uri

            self.logger.info(f"保存播放列表到: {playlist_path}, 任务ID={task_id}")
            # 确保目录存在
            playlist_path.parent.mkdir(parents=True, exist_ok=True)
            
            # 使用asyncio.to_thread避免阻塞
            await asyncio.to_thread(self._write_playlist, playlist, playlist_path)
                
            self.logger.info(f"播放列表已更新，总计{len(playlist.segments)}个分段, 任务ID={task_id}")
        except Exception as e:
            self.logger.error(f"保存播放列表失败: {e}, 任务ID={task_id}")
            raise
    
    def _write_playlist(self, playlist, playlist_path):
        """同步写入播放列表文件"""
        with open(playlist_path, 'w', encoding='utf-8') as f:
            content = playlist.dumps()
            f.write(content)
    
    async def _upload_playlist_to_storage(self, task_id: str) -> None:
        """
        将播放列表上传到R2存储（支持增量更新）
        
        Args:
            task_id: 任务ID
        """
        if task_id not in self.task_managers:
            raise ValueError(f"任务 {task_id} 的HLS管理器不存在")
            
        try:
            manager = self.task_managers[task_id]
            playlist = manager["playlist"]
            
            # 获取播放列表内容
            playlist_content = playlist.dumps()
            
            # 上传到R2存储
            upload_result = await self.hls_storage_manager.upload_playlist(task_id, playlist_content)
            
            if upload_result["status"] == "success":
                self.logger.info(f"[{task_id}] 播放列表已上传到R2: {upload_result['storage_path']} (包含 {len(playlist.segments)} 个片段)")
                
                # 更新数据库中的HLS播放列表URL为R2的公共URL
                storage_url = upload_result["public_url"]
                self.logger.info(f"[{task_id}] HLS播放列表已上传到R2: {storage_url}")
            else:
                self.logger.error(f"[{task_id}] 播放列表上传到R2失败: {upload_result.get('message', 'Unknown error')}")
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 上传播放列表到R2失败: {e}")
            raise

    async def add_segment(self, task_id: str, video_path: Union[str, Path], part_index: int) -> Dict:
        """
        添加新的视频片段到播放列表
        
        Args:
            task_id: 任务ID
            video_path: 视频片段路径
            part_index: 部分索引
            
        Returns:
            Dict: 包含状态信息的字典
        """
        if task_id not in self.task_managers:
            self.logger.error(f"任务 {task_id} 的HLS管理器不存在")
            return {"status": "error", "message": "任务HLS管理器不存在"}
            
        if task_id not in self.locks:
            self.locks[task_id] = asyncio.Lock()
            
        start_time = time.time()
        
        async with self.locks[task_id]:
            try:
                manager = self.task_managers[task_id]
                segments_dir = manager["segments_dir"]
                playlist = manager["playlist"]
                sequence_number = manager["sequence_number"]
                segment_time = manager["segment_time"]
                path_manager = manager["path_manager"]
                
                was_first_segment = not manager["has_segments"]

                self.logger.info(f"开始处理HLS片段 {part_index}, 任务ID={task_id}")
                segments_dir.mkdir(parents=True, exist_ok=True)

                segment_filename = f'segment_{sequence_number:04d}_%03d.ts'
                segment_pattern = str(segments_dir / segment_filename)
                temp_playlist_path = path_manager.temp.processing_dir / f'temp_{part_index}.m3u8'

                # 使用异步函数
                await hls_segment(
                    input_path=str(video_path),
                    segment_pattern=segment_pattern,
                    playlist_path=str(temp_playlist_path),
                    hls_time=segment_time
                )

                # 加入分段
                # 使用asyncio.to_thread避免阻塞
                temp_m3u8 = await asyncio.to_thread(m3u8.load, str(temp_playlist_path))
                
                discontinuity_segment = m3u8.Segment(discontinuity=True)
                playlist.add_segment(discontinuity_segment)

                # 收集新生成的分段文件路径，用于上传到Storage
                new_segment_files = []
                for segment in temp_m3u8.segments:
                    local_segment_path = segments_dir / Path(segment.uri).name
                    new_segment_files.append(str(local_segment_path))
                    # 使用相对路径，因为m3u8和ts文件在同一个文件夹下
                    segment.uri = Path(segment.uri).name
                    playlist.segments.append(segment)

                # 使用并行上传队列（如果启用且可用）
                if self.config.ENABLE_HLS_STORAGE and new_segment_files:
                    await self._queue_segment_upload(task_id, new_segment_files)

                # 更新序列号
                manager["sequence_number"] += len(temp_m3u8.segments)
                manager["has_segments"] = True
                
                # 确保播放列表不标记为结束，以便实时加载
                playlist.is_endlist = False
                
                # 保存本地播放列表
                await self._save_playlist(task_id)
                
                # 使用并行上传队列上传播放列表（如果启用）
                if self.config.ENABLE_HLS_STORAGE:
                    await self._queue_playlist_upload(task_id)

                # HLS播放列表URL现在在_upload_playlist_to_storage方法中更新为Storage URL
                
                # 删除临时播放列表
                if temp_playlist_path.exists():
                    await asyncio.to_thread(temp_playlist_path.unlink)
                
                elapsed = time.time() - start_time
                self.logger.info(f"已添加片段 {part_index} 到HLS流，耗时 {elapsed:.2f}s, 任务ID={task_id}")
                return {"status": "success", "part_index": part_index}
            except Exception as e:
                elapsed = time.time() - start_time
                self.logger.error(f"添加HLS片段失败: {e}，耗时 {elapsed:.2f}s, 任务ID={task_id}")
                return {"status": "error", "message": f"添加HLS片段失败: {str(e)}"}

    async def finalize_playlist(self, task_id: str) -> Dict:
        """
        标记播放列表为完成状态
        
        Args:
            task_id: 任务ID
            
        Returns:
            Dict: 包含状态信息的字典
        """
        if task_id not in self.task_managers:
            self.logger.error(f"任务 {task_id} 的HLS管理器不存在")
            return {"status": "error", "message": "任务HLS管理器不存在"}
            
        if task_id not in self.locks:
            self.locks[task_id] = asyncio.Lock()
            
        async with self.locks[task_id]:
            try:
                manager = self.task_managers[task_id]
                playlist = manager["playlist"]
                has_segments = manager["has_segments"]
                
                if has_segments:
                    playlist.is_endlist = True
                    await self._save_playlist(task_id)
                    
                    # 上传最终的播放列表到Storage（如果启用）
                    if self.config.ENABLE_HLS_STORAGE:
                        await self._upload_playlist_to_storage(task_id)
                        self.logger.info(f"播放列表已保存并上传到Storage，标记为完成状态, 任务ID={task_id}")
                        return {"status": "success", "message": "播放列表已标记为完成并上传到Storage"}
                    else:
                        self.logger.info(f"播放列表已保存，标记为完成状态, 任务ID={task_id}")
                        return {"status": "success", "message": "播放列表已标记为完成"}
                else:
                    self.logger.warning(f"播放列表为空，不标记为结束状态, 任务ID={task_id}")
                    return {"status": "warning", "message": "播放列表为空，未标记为完成"}
            except Exception as e:
                self.logger.error(f"完成播放列表失败: {e}, 任务ID={task_id}")
                return {"status": "error", "message": f"完成播放列表失败: {str(e)}"}

    async def get_has_segments(self, task_id: str) -> Dict:
        """
        获取任务是否有分段
        
        Args:
            task_id: 任务ID
            
        Returns:
            Dict: 包含状态和has_segments值的字典
        """
        if task_id not in self.task_managers:
            return {"status": "error", "message": "任务HLS管理器不存在", "has_segments": False}
            
        manager = self.task_managers[task_id]
        return {"status": "success", "has_segments": manager["has_segments"]}
    
    async def clean_old_tasks(self, max_age_hours: int = 24) -> Dict:
        """
        清理旧任务资源
        
        Args:
            max_age_hours: 最大保留小时数，默认24小时
            
        Returns:
            Dict: 包含清理信息的字典
        """
        now = time.time()
        max_age_seconds = max_age_hours * 3600
        tasks_to_clean = []
        
        # 标识需要清理的任务
        for task_id, manager in self.task_managers.items():
            if now - manager["created_at"] > max_age_seconds:
                tasks_to_clean.append(task_id)
        
        # 执行清理
        cleaned_count = 0
        for task_id in tasks_to_clean:
            if task_id in self.locks:
                async with self.locks[task_id]:
                    if task_id in self.task_managers:
                        del self.task_managers[task_id]
                        cleaned_count += 1
                del self.locks[task_id]
        
        self.logger.info(f"已清理 {cleaned_count} 个过期任务的HLS资源")
        return {"status": "success", "cleaned_count": cleaned_count}

    async def finalize_merge(self, task_id: str, all_processed_segment_paths: List[str], path_manager: PathManager) -> Dict:
        """最终化任务处理：结束播放列表，合并片段，并更新数据库状态"""
        self.logger.info(f"[{task_id}] HLSManager: 开始最终化任务处理，包含 {len(all_processed_segment_paths)} 个片段。")

        # 1. 结束HLS播放列表
        await self.finalize_playlist(task_id)
        self.logger.info(f"[{task_id}] HLSManager: 播放列表已标记为结束。")
        
        # 等待所有并行上传完成
        await self._wait_for_uploads_completion(task_id)
        self.logger.info(f"[{task_id}] HLSManager: 所有并行上传已完成。")

        # 2. 合并处理好的视频片段
        self.logger.info(f"[{task_id}] HLSManager: 开始合并 {len(all_processed_segment_paths)} 个视频片段。")
        
        # 处理无片段情况
        if not all_processed_segment_paths:
            msg = "HLSManager: 没有处理成功的视频片段可以合并。"
            self.logger.error(f"[{task_id}] {msg}")
            return {"status": "error", "message": msg}

        try:
            # 确保输出目录存在
            output_dir = path_manager.temp.get_subdir("output")
            output_dir.mkdir(parents=True, exist_ok=True)
            self.logger.info(f"[{task_id}] HLSManager: 确保输出目录存在: {output_dir}")
            
            # 创建合并列表文件
            list_txt_path = path_manager.temp.processing_dir / "concat_list.txt"
            async with aiofiles.open(list_txt_path, "w", encoding='utf-8') as f:
                for seg_mp4 in all_processed_segment_paths:
                    # 确保路径是绝对的并且格式正确
                    formatted_path = str(Path(seg_mp4).resolve()).replace("\\", "/")
                    await f.write(f"file '{formatted_path}'\n")
            self.logger.info(f"[{task_id}] HLSManager: 合并列表文件已创建: {list_txt_path}")

            # 执行视频合并
            final_output_path = output_dir / f"final_{task_id}.mp4"
            merge_start_time = time.time()
            self.logger.info(f"[{task_id}] HLSManager: 开始调用 concat_videos, 输出到 {final_output_path}")
            
            # concat_videos 应该是异步的，如果不是，需要用 asyncio.to_thread 包装
            # 假设 concat_videos 是异步的
            final_video_path_obj = await concat_videos(str(list_txt_path), str(final_output_path))

            # 处理合并结果
            if not final_video_path_obj or not final_video_path_obj.exists():
                msg = "HLSManager: 视频合并失败，最终文件未生成。"
                self.logger.error(f"[{task_id}] {msg}")
                return {"status": "error", "message": msg}

            # 完成流程并更新状态
            final_video_path_str = str(final_video_path_obj)
            merge_duration = time.time() - merge_start_time
            

            # 3. 清理本地HLS文件（如果启用Storage且配置了清理）
            if self.config.ENABLE_HLS_STORAGE and self.config.CLEANUP_LOCAL_HLS_FILES:
                try:
                    if task_id in self.task_managers:
                        manager = self.task_managers[task_id]
                        segments_dir = manager["segments_dir"]
                        playlist_path = manager["playlist_path"]
                        
                        # 收集所有本地HLS文件
                        local_hls_files = []
                        if segments_dir.exists():
                            local_hls_files.extend([str(f) for f in segments_dir.glob("*.ts")])
                        if playlist_path.exists():
                            local_hls_files.append(str(playlist_path))
                        
                        if local_hls_files:
                            cleanup_result = await self.hls_storage_manager.cleanup_local_files(task_id, local_hls_files)
                            self.logger.info(f"[{task_id}] HLS本地文件清理完成: {cleanup_result['cleaned_count']}/{len(local_hls_files)}")
                except Exception as cleanup_e:
                    self.logger.warning(f"[{task_id}] HLS本地文件清理失败: {cleanup_e}")

            self.logger.info(f"[{task_id}] HLSManager: 视频合并成功，耗时: {merge_duration:.2f}s")
            return {"status": "success", "message": "视频处理成功", "output_path": final_video_path_str}
            
        except Exception as e:
            msg = f"HLSManager: 视频合并过程中出错: {e}"
            self.logger.exception(f"[{task_id}] {msg}") # Log with stack trace
            return {"status": "error", "message": msg} 