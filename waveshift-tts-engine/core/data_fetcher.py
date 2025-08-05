import logging
import asyncio
import time
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import aiofiles

from config import get_config
from core.cloudflare.d1_client import D1Client
from core.cloudflare.r2_client import R2Client
from core.sentence_tools import Sentence
from utils.path_manager import PathManager
from core.vocal_separator import VocalSeparator

logger = logging.getLogger(__name__)

class DataFetcher:
    """数据获取服务 - 从Cloudflare D1和R2获取任务数据"""
    
    def __init__(self, d1_client: D1Client = None, r2_client: R2Client = None):
        self.config = get_config()
        self.logger = logging.getLogger(__name__)
        
        # 使用依赖注入的客户端，如果没有则抛出异常（强制使用依赖注入）
        if d1_client is None:
            raise ValueError("D1Client 必须通过依赖注入提供")
        if r2_client is None:
            raise ValueError("R2Client 必须通过依赖注入提供")
            
        self.d1_client = d1_client
        self.r2_client = r2_client
        
        # 初始化音频处理器（保持架构一致性）
        self.vocal_separator = VocalSeparator()
        
        self.logger.info("数据获取服务初始化完成")
    
    async def fetch_task_data(self, task_id: str, path_manager: PathManager = None) -> Dict:
        """
        并行化的任务数据获取 - 真正的并行优化版本
        
        优化策略：
        1. D1查询并行化（句子数据 + 媒体路径）
        2. 音频处理链独立完成（下载+分离+切分）
        3. 视频下载作为后台任务，不阻塞音频处理
        4. 详细性能监控
        
        Args:
            task_id: 任务ID
            path_manager: 路径管理器（如果没有则创建新的）
            
        Returns:
            Dict: 包含句子列表、音频文件路径和视频下载任务的字典
        """
        start_time = time.time()
        
        try:
            self.logger.info(f"[{task_id}] 开始并行获取任务数据")
            
            # 创建或使用传入的路径管理器
            if path_manager is None:
                path_manager = PathManager(task_id)
                self.logger.warning(f"[{task_id}] DataFetcher: 未传入path_manager，创建新的")
            
            # 阶段1: 并行执行D1查询
            d1_start_time = time.time()
            self.logger.info(f"[{task_id}] 开始并行D1查询")
            
            sentences_task = asyncio.create_task(
                self.d1_client.get_transcription_segments_from_worker(task_id),
                name=f"get_sentences_{task_id}"
            )
            media_paths_task = asyncio.create_task(
                self.d1_client.get_worker_media_paths(task_id),
                name=f"get_media_paths_{task_id}"
            )
            
            # 等待D1查询完成
            sentences, media_paths = await asyncio.gather(
                sentences_task, media_paths_task, return_exceptions=True
            )
            
            d1_duration = time.time() - d1_start_time
            self.logger.info(f"[{task_id}] D1并行查询完成，耗时: {d1_duration:.2f}s")
            
            # 检查D1查询结果
            if isinstance(sentences, Exception):
                self.logger.error(f"[{task_id}] 获取句子数据失败: {sentences}")
                return {"status": "error", "message": f"获取句子数据失败: {sentences}"}
            
            if isinstance(media_paths, Exception):
                self.logger.error(f"[{task_id}] 获取媒体路径失败: {media_paths}")
                return {"status": "error", "message": f"获取媒体路径失败: {media_paths}"}
                
            if not sentences:
                return {"status": "error", "message": "未找到转录数据"}
            
            # 阶段2: 真正的并行优化 - 音频处理链和视频下载真正同时开始
            parallel_start_time = time.time()
            self.logger.info(f"[{task_id}] 开始真正的并行媒体处理：音频处理链和视频下载同时开始")
            
            # 初始化结果变量
            vocals_path, instrumental_path, segmented_sentences = None, None, sentences
            video_download_task = None
            
            # 创建并行任务（真正同时开始）
            audio_task = None
            
            # 音频处理链任务
            if media_paths.get('audio_path'):
                audio_task = asyncio.create_task(
                    self._process_audio_chain(task_id, media_paths['audio_path'], path_manager),
                    name=f"audio_chain_{task_id}"
                )
                self.logger.info(f"[{task_id}] 音频处理链任务已启动")
            
            # 视频下载任务（同时开始）
            if media_paths.get('video_path'):
                video_download_task = asyncio.create_task(
                    self._download_video_file(task_id, media_paths['video_path'], path_manager),
                    name=f"download_video_{task_id}"
                )
                self.logger.info(f"[{task_id}] 视频下载任务已启动（同时开始）")
            
            # 只等待音频处理链完成
            if audio_task:
                try:
                    self.logger.info(f"[{task_id}] 等待音频处理链完成...")
                    audio_result = await audio_task
                    
                    if audio_result and len(audio_result) == 2:
                        vocals_path, instrumental_path = audio_result
                        self.logger.info(f"[{task_id}] 音频处理链完成: 分离处理完成")
                    else:
                        self.logger.error(f"[{task_id}] 音频处理链失败")
                        vocals_path, instrumental_path = None, None
                        
                except Exception as e:
                    self.logger.error(f"[{task_id}] 音频处理链异常: {e}")
                    vocals_path, instrumental_path = None, None
            
            # 音频切分功能已由 audio-segment-worker 服务实现，这里直接使用原始句子
            segmented_sentences = sentences
            
            # 计算音频处理耗时
            audio_duration = time.time() - parallel_start_time
            self.logger.info(f"[{task_id}] 音频处理链完成，耗时: {audio_duration:.2f}s, 视频下载在后台继续")
            
            # 设置媒体路径（暂时使用音频路径，视频在需要时再获取）
            if vocals_path:
                path_manager.set_media_paths(vocals_path, None)  # 视频路径暂时为None
            
            # 构建结果（真正的并行优化版本）
            total_duration = time.time() - start_time
            result = {
                "status": "success",
                "sentences": segmented_sentences,  # 返回切分后的句子（包含音频路径）
                "audio_file_path": vocals_path,  # 返回分离后的人声
                "video_file_path": None,  # 视频路径在后台任务中获取
                "vocals_file_path": vocals_path,
                "instrumental_file_path": instrumental_path,
                "transcription_count": len(segmented_sentences),
                "path_manager": path_manager,
                "video_download_task": video_download_task,  # 视频下载任务引用
                "performance": {
                    "total_duration": total_duration,
                    "d1_duration": d1_duration,
                    "audio_duration": audio_duration if 'audio_duration' in locals() else 0,
                    "efficiency_gain": f"{(d1_duration / total_duration * 100):.1f}%",
                    "optimization": "true_parallel"
                }
            }
            
            self.logger.info(
                f"[{task_id}] 真正并行数据获取成功: {len(segmented_sentences)} 个句子(已切分), "
                f"总耗时: {total_duration:.2f}s, D1: {d1_duration:.2f}s, "
                f"音频处理: {audio_duration if 'audio_duration' in locals() else 0:.2f}s, "
                f"视频下载: 后台运行中"
            )
            
            return result
            
        except Exception as e:
            total_duration = time.time() - start_time
            self.logger.error(f"[{task_id}] 并行获取任务数据失败: {e}, 耗时: {total_duration:.2f}s")
            return {"status": "error", "message": "数据获取失败"}
    
    async def _process_audio_chain(self, task_id: str, audio_path_r2: str, 
                                  path_manager: PathManager) -> Tuple[Optional[str], Optional[str]]:
        """
        音频处理链：下载 -> 分离
        
        优化策略：
        1. 异步下载音频文件
        2. 音频分离处理
        3. 智能降级策略和错误恢复
        
        注意：音频切分功能已由 audio-segment-worker 服务实现
        
        Args:
            task_id: 任务ID
            audio_path_r2: R2中的音频文件路径
            path_manager: 路径管理器
        
        Returns:
            Tuple[vocals_path, instrumental_path]: 分离后的人声、背景音路径
        """
        try:
            download_start_time = time.time()
            
            # 异步下载音频数据
            self.logger.info(f"[{task_id}] 开始下载音频文件: {audio_path_r2}")
            audio_data = await self.r2_client.download_audio(audio_path_r2)
            
            if not audio_data:
                self.logger.error(f"[{task_id}] 下载音频文件失败: {audio_path_r2}")
                return None, None, None
            
            download_duration = time.time() - download_start_time
            self.logger.info(f"[{task_id}] 音频下载完成，耗时: {download_duration:.2f}s, 大小: {len(audio_data)} bytes")
            
            # 异步保存原始音频到本地
            save_start_time = time.time()
            original_audio_path = path_manager.temp.media_dir / "original_audio.wav"
            
            async with aiofiles.open(original_audio_path, 'wb') as f:
                await f.write(audio_data)
            
            save_duration = time.time() - save_start_time
            self.logger.info(f"[{task_id}] 音频文件保存完成，耗时: {save_duration:.2f}s")
            
            # 音频分离处理（如果启用）
            if getattr(self.config, 'ENABLE_VOCAL_SEPARATION', True) and self.vocal_separator.is_available():
                self.logger.info(f"[{task_id}] 开始后台音频分离处理...")
                separation_start_time = time.time()
                
                # 使用异步音频分离
                separation_result = await self.vocal_separator.separate_complete_audio(
                    str(original_audio_path), path_manager
                )
                
                separation_duration = time.time() - separation_start_time
                
                if separation_result['success']:
                    self.logger.info(
                        f"[{task_id}] 音频分离成功，耗时: {separation_duration:.2f}s, "
                        f"人声: {separation_result['vocals_path']}, 背景: {separation_result['instrumental_path']}"
                    )
                    # 分离成功，记录结果但不返回，继续到统一的音频切分处理
                    vocals_path = separation_result['vocals_path']
                    instrumental_path = separation_result['instrumental_path']
                    
                    # 不在这里返回，让所有分支都走统一的音频切分处理
                    # return vocals_path, instrumental_path, segmented_sentences
                else:
                    self.logger.warning(
                        f"[{task_id}] 音频分离失败: {separation_result['error']}，"
                        f"耗时: {separation_duration:.2f}s，降级使用原始音频"
                    )
            else:
                self.logger.info(f"[{task_id}] 音频分离功能未启用，使用原始音频")
            
            # 如果分离失败或未启用，使用原始音频作为"人声"
            if not vocals_path:
                vocals_path = str(original_audio_path)
            if not instrumental_path:
                instrumental_path = None
            
            # 返回二元组：(人声路径, 背景音路径)
            # 注意：音频切分功能已由 audio-segment-worker 服务实现
            return vocals_path, instrumental_path
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 音频处理链异常: {e}")
            # 在异常情况下返回None
            return None, None
    
    async def _download_video_file(self, task_id: str, video_path_r2: str, 
                                   path_manager: PathManager) -> Optional[str]:
        """
        异步优化的视频文件下载
        
        Args:
            task_id: 任务ID
            video_path_r2: R2中的视频文件路径
            path_manager: 路径管理器
            
        Returns:
            Optional[str]: 本地视频文件路径
        """
        try:
            download_start_time = time.time()
            
            # 异步下载视频数据
            self.logger.info(f"[{task_id}] 开始下载视频文件: {video_path_r2}")
            video_data = await self.r2_client.download_video(video_path_r2)
            
            if not video_data:
                self.logger.error(f"[{task_id}] 下载视频文件失败: {video_path_r2}")
                return None
            
            download_duration = time.time() - download_start_time
            self.logger.info(f"[{task_id}] 视频下载完成，耗时: {download_duration:.2f}s, 大小: {len(video_data)} bytes")
            
            # 异步保存到本地
            save_start_time = time.time()
            video_filename = Path(video_path_r2).name
            local_video_path = path_manager.temp.media_dir / f"silent_{video_filename}"
            
            async with aiofiles.open(local_video_path, 'wb') as f:
                await f.write(video_data)
            
            save_duration = time.time() - save_start_time
            self.logger.info(f"[{task_id}] 视频文件保存完成，耗时: {save_duration:.2f}s, 路径: {local_video_path}")
            
            return str(local_video_path)
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 异步视频下载异常: {e}")
            return None
    
    
    
    async def get_sentences_only(self, task_id: str) -> List[Sentence]:
        """仅获取句子数据，不下载媒体文件"""
        try:
            transcriptions = await self.d1_client.get_transcriptions(task_id)
            if not transcriptions:
                self.logger.warning(f"[{task_id}] 未找到转录数据")
                return []
            
            sentences = await self.d1_client.to_sentence_objects(transcriptions, task_id)
            self.logger.info(f"[{task_id}] 获取到 {len(sentences)} 个句子")
            return sentences
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 获取句子数据失败: {e}")
            return []
    
    
    async def await_video_completion(self, task_id: str, video_download_task) -> str:
        """
        等待视频下载完成的统一接口
        
        Args:
            task_id: 任务ID
            video_download_task: 视频下载任务引用
            
        Returns:
            str: 视频文件路径
        """
        if not video_download_task:
            self.logger.warning(f"[{task_id}] 没有视频下载任务，跳过视频处理")
            return None
        
        try:
            self.logger.info(f"[{task_id}] 等待视频下载完成...")
            video_wait_start = time.time()
            
            video_file_path = await video_download_task
            
            video_wait_duration = time.time() - video_wait_start
            
            if video_file_path:
                self.logger.info(
                    f"[{task_id}] 视频下载完成，路径: {video_file_path}, "
                    f"等待耗时: {video_wait_duration:.2f}s"
                )
                return video_file_path
            else:
                self.logger.error(f"[{task_id}] 视频下载失败，耗时: {video_wait_duration:.2f}s")
                return None
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 视频下载异常: {e}")
            return None
    
    async def close(self):
        """关闭客户端连接"""
        await self.d1_client.close()
        if self.vocal_separator:
            await self.vocal_separator.cleanup()