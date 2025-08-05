"""
优化后的任务编排器 - 使用简化的流水线模式
保持与原版完全兼容的API，只是内部实现更清晰
"""
import logging
import asyncio
import time
import gc
import torch
from typing import Dict, List, Tuple

from config import get_config
from utils.path_manager import PathManager
from utils.async_utils import BackgroundTaskManager, async_retry

logger = logging.getLogger(__name__)


class MainOrchestrator:
    """优化后的主编排器 - 使用流水线模式简化代码"""
    
    def __init__(self, services: Dict = None):
        self.logger = logger
        self.config = get_config()
        
        # 使用传入的服务实例
        self.services = services or {}
        
        # 从服务字典获取D1客户端
        self.d1_client = self.services.get('d1_client')
        if not self.d1_client:
            raise RuntimeError("D1客户端未找到，请确保services字典中包含'd1_client'")
        
        # 直接使用服务实例（移除流水线框架）
        
        # 创建后台任务管理器
        self.task_manager = BackgroundTaskManager()
        
        self.logger.info("MainOrchestrator初始化完成，所有服务实例已就绪")
    
    @async_retry(max_attempts=3, delay=1.0, backoff=2.0)
    async def _update_task_status(self, task_id: str, status: str, error_message: str = None):
        """
        安全的任务状态更新方法 - 带重试机制
        
        Args:
            task_id: 任务ID
            status: 任务状态
            error_message: 错误消息（可选）
        """
        try:
            result = await self.d1_client.update_task_status(task_id, status, error_message)
            if result:
                self.logger.info(f"任务状态更新成功 [任务ID: {task_id}] [状态: {status}]")
            else:
                self.logger.warning(f"任务状态更新失败 [任务ID: {task_id}] [状态: {status}]")
            return result
        except Exception as e:
            self.logger.error(f"任务状态更新异常 [任务ID: {task_id}] [状态: {status}]: {e}")
            raise
    
    def _create_status_update_task(self, task_id: str, status: str, error_message: str = None):
        """
        创建状态更新后台任务
        
        Args:
            task_id: 任务ID
            status: 任务状态
            error_message: 错误消息（可选）
        """
        def error_handler(e: Exception):
            self.logger.error(f"后台状态更新任务失败 [任务ID: {task_id}] [状态: {status}]: {e}")
        
        self.task_manager.create_task(
            self._update_task_status(task_id, status, error_message),
            name=f"status_update_{task_id}_{status}",
            error_handler=error_handler
        )
    
    async def run_complete_tts_pipeline(self, task_id: str) -> Dict:
        """
        执行完整的TTS流水线 - 直接集成所有步骤，移除流水线框架
        
        Args:
            task_id: 任务ID
            
        Returns:
            Dict: 处理结果，与原版API兼容
        """
        start_time = time.time()
        self.logger.info(f"[{task_id}] 开始完整TTS流程")
        
        # 在任务开始时创建统一的PathManager
        path_manager = PathManager(task_id)
        self.logger.info(f"[{task_id}] 创建统一的PathManager: {path_manager.temp.temp_dir}")
        
        try:
            # 更新任务状态
            await self._update_task_status(task_id, 'processing')
            
            # 步骤1: 获取任务数据（包含音频分离）
            self.logger.info(f"[{task_id}] 步骤1: 获取任务数据和音频分离")
            task_data = await self._fetch_task_data(task_id, path_manager)
            
            # 步骤2: 音频切分 - 已在音频处理链中完成，真正并行！
            self.logger.info(f"[{task_id}] 步骤2: 音频切分 - 已在音频处理链中完成，真正并行！")
            segmented_sentences = task_data['sentences']  # 已在DataFetcher中完成切分处理
            
            # 验证切分结果
            if not segmented_sentences:
                raise ValueError("音频切分失败：未获得切分后的句子")
            
            self.logger.info(f"[{task_id}] 音频切分完成，处理了 {len(segmented_sentences)} 个句子")
            
            # 获取视频下载任务引用和DataFetcher服务
            video_download_task = task_data.get('video_download_task')
            data_fetcher = self.services.get('data_fetcher')
            if not data_fetcher:
                raise ValueError("data_fetcher服务未找到")
            
            self.logger.info(f"[{task_id}] 视频下载任务状态: {'running' if video_download_task else 'not_started'}")
            
            # 步骤3: TTS并行处理 - TTS生成与视频下载重叠执行
            self.logger.info(f"[{task_id}] 步骤3: TTS并行处理")
            result = await self._process_tts_stream(
                task_id, segmented_sentences, task_data['audio_file_path'], 
                video_download_task, data_fetcher, path_manager
            )
            
            # 处理结果
            elapsed_time = time.time() - start_time
            
            if result.get("status") == "success":
                await self._update_task_status(task_id, 'completed')
                self.logger.info(f"[{task_id}] 完整TTS流程成功完成（真正并行优化版），总耗时: {elapsed_time:.2f}s")
                return result
            else:
                await self._update_task_status(task_id, 'error', result.get('message'))
                self.logger.error(f"[{task_id}] 完整TTS流程失败，总耗时: {elapsed_time:.2f}s")
                return result
                
        except Exception as e:
            error_msg = f"TTS流程异常: {e}"
            self.logger.exception(f"[{task_id}] {error_msg}")
            await self._update_task_status(task_id, 'error', error_msg)
            return {"status": "error", "message": error_msg}
            
        finally:
            # 清理资源
            if path_manager:
                path_manager.cleanup()
            self._clean_memory()
    
    def _clean_memory(self):
        """清理内存和GPU缓存 - 与原版保持一致"""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    
    async def cleanup(self):
        """清理编排器资源"""
        try:
            if self.task_manager:
                self.logger.info("正在清理后台任务...")
                await self.task_manager.close()
                self.logger.info("后台任务管理器已关闭")
        except Exception as e:
            self.logger.error(f"编排器清理失败: {e}")
    
    async def get_task_status(self, task_id: str) -> Dict:
        """获取任务状态 - 与原版保持完全一致"""
        try:
            task_info = await self.d1_client.get_task_info(task_id)
            if not task_info:
                return {"status": "error", "message": "任务不存在"}
            
            return {
                "status": "success",
                "task_id": task_id,
                "task_status": task_info.get('status'),
                "hls_playlist_url": task_info.get('hls_playlist_url'),
                "error_message": task_info.get('error_message')
            }
        except Exception as e:
            self.logger.error(f"[{task_id}] 获取任务状态失败: {e}")
            return {"status": "error", "message": f"获取任务状态失败: {e}"}
    
    async def _fetch_task_data(self, task_id: str, path_manager: PathManager) -> Dict:
        """获取任务数据 - 使用并行化优化版本"""
        try:
            data_fetcher = self.services.get('data_fetcher')
            if not data_fetcher:
                raise ValueError("data_fetcher服务未找到")
            
            # 使用并行化版本，大幅提升数据获取性能
            task_data = await data_fetcher.fetch_task_data(task_id, path_manager)
            
            if task_data.get("status") != "success":
                raise ValueError(f"获取任务数据失败: {task_data.get('message', 'Unknown error')}")
            
            # 验证必需数据
            sentences = task_data.get("sentences", [])
            audio_file_path = task_data.get("audio_file_path")
            video_file_path = task_data.get("video_file_path")
            vocals_file_path = task_data.get("vocals_file_path")
            instrumental_file_path = task_data.get("instrumental_file_path")
            
            if not sentences:
                raise ValueError("没有找到句子数据")
            
            # 音频文件路径可以为None（如果音频处理链失败），但句子数据必须存在
            if not audio_file_path:
                # 尝试使用vocals_file_path作为备用
                if vocals_file_path:
                    audio_file_path = vocals_file_path
                    self.logger.info(f"[{task_id}] 使用vocals_file_path作为音频文件路径: {audio_file_path}")
                else:
                    self.logger.warning(f"[{task_id}] 音频文件路径为None，可能音频处理链失败，但仍然有{len(sentences)}个句子数据")
            
            # 记录性能提升信息
            if task_data.get("performance"):
                perf = task_data["performance"]
                self.logger.info(
                    f"[{task_id}] 并行数据获取性能报告: "
                    f"总耗时: {perf.get('total_duration', 0):.2f}s, "
                    f"D1查询: {perf.get('d1_duration', 0):.2f}s, "
                    f"下载处理: {perf.get('download_duration', 0):.2f}s, "
                    f"效率提升: {perf.get('efficiency_gain', 'N/A')}"
                )
            
            # 如果有分离音频信息，记录到日志
            if vocals_file_path and instrumental_file_path:
                self.logger.info(f"[{task_id}] 音频分离成功: vocals={vocals_file_path}, instrumental={instrumental_file_path}")
            elif vocals_file_path:
                self.logger.info(f"[{task_id}] 使用原始音频作为人声: {vocals_file_path}")
            
            self.logger.info(f"[{task_id}] 并行获取到 {len(sentences)} 个句子，音频文件: {audio_file_path or 'None'}")
            return {
                "sentences": sentences,
                "audio_file_path": audio_file_path or vocals_file_path,  # 兼容性：返回人声路径，如果为None则使用vocals_file_path
                "video_file_path": video_file_path,
                "vocals_file_path": vocals_file_path,
                "instrumental_file_path": instrumental_file_path,
                "video_download_task": task_data.get('video_download_task')  # 视频下载任务引用
            }
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 获取任务数据异常: {e}")
            raise
    
    
    async def _init_hls_manager(self, task_id: str, audio_file_path: str, video_file_path: str, path_manager: PathManager) -> None:
        """初始化HLS管理器 - 替代InitHLSStep
        
        Args:
            task_id: 任务ID
            audio_file_path: 音频文件路径
            video_file_path: 视频文件路径
            path_manager: 共享的路径管理器
        """
        try:
            hls_manager = self.services.get('hls_manager')
            if not hls_manager:
                raise ValueError("hls_manager服务未找到")
            
            # 设置媒体文件路径
            if audio_file_path and video_file_path:
                path_manager.set_media_paths(audio_file_path, video_file_path)
            
            # 初始化HLS管理器
            response = await hls_manager.create_manager(task_id, path_manager)
            
            if not (isinstance(response, dict) and response.get("status") == "success"):
                raise ValueError(f"HLS管理器初始化失败: {response}")
            
            self.logger.info(f"[{task_id}] HLS管理器初始化完成")
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 初始化HLS管理器异常: {e}")
            raise
    

    async def _process_tts_stream(self, task_id: str, sentences: list, audio_file_path: str, 
                                video_download_task, data_fetcher, path_manager: PathManager) -> Dict:
        """流式TTS处理 - 三阶段流水线架构"""
        try:
            # 获取服务实例
            tts = self.services.get('tts')
            duration_aligner = self.services.get('duration_aligner')
            timestamp_adjuster = self.services.get('timestamp_adjuster')
            media_mixer = self.services.get('media_mixer')
            hls_manager = self.services.get('hls_manager')
            
            if not all([tts, duration_aligner, timestamp_adjuster, media_mixer, hls_manager]):
                raise ValueError("TTS服务实例未完整找到")
            
            self.logger.info(f"[{task_id}] 启动流式TTS处理，句子数: {len(sentences)}")
            
            # 创建双队列架构
            tts_queue = asyncio.Queue(maxsize=self.config.TTS_QUEUE_SIZE)
            aligned_queue = asyncio.Queue(maxsize=self.config.ALIGNED_QUEUE_SIZE)
            
            # 阶段1：启动TTS生产者和预处理流水线（立即开始）
            tts_task = asyncio.create_task(
                self._tts_producer(task_id, tts, sentences, path_manager, tts_queue),
                name=f"tts_producer_{task_id}"
            )
            
            preprocess_task = asyncio.create_task(
                self._align_and_adjust_stream(task_id, tts_queue, aligned_queue, 
                                            duration_aligner, timestamp_adjuster, path_manager),
                name=f"preprocess_stream_{task_id}"
            )
            
            # 阶段2：视频准备（并行进行）
            video_task = asyncio.create_task(
                self._prepare_video_for_processing(task_id, video_download_task, 
                                                 data_fetcher, audio_file_path, path_manager),
                name=f"video_preparation_{task_id}"
            )
            
            # 阶段3：等待视频准备完成后启动媒体合成
            video_file_path = await video_task
            
            compose_task = asyncio.create_task(
                self._compose_media_stream(task_id, aligned_queue, video_file_path, 
                                         media_mixer, hls_manager, path_manager),
                name=f"compose_stream_{task_id}"
            )
            
            # 等待所有任务完成
            self.logger.info(f"[{task_id}] 流式处理三阶段启动完成")
            concurrent_start_time = time.time()
            
            tts_result, preprocess_result, compose_result = await asyncio.gather(
                tts_task, preprocess_task, compose_task, return_exceptions=True
            )
            
            concurrent_duration = time.time() - concurrent_start_time
            self.logger.info(f"[{task_id}] 流式处理完成，耗时: {concurrent_duration:.2f}s")
            
            # 处理结果和错误
            if isinstance(tts_result, Exception):
                self.logger.error(f"[{task_id}] TTS生产者异常: {tts_result}")
                return {"status": "error", "message": f"TTS生产失败: {tts_result}"}
            
            if isinstance(preprocess_result, Exception):
                self.logger.error(f"[{task_id}] 预处理流水线异常: {preprocess_result}")
                return {"status": "error", "message": f"预处理失败: {preprocess_result}"}
            
            if isinstance(compose_result, Exception):
                self.logger.error(f"[{task_id}] 媒体合成流水线异常: {compose_result}")
                return {"status": "error", "message": f"媒体合成失败: {compose_result}"}
            
            # 返回合成结果
            if compose_result and compose_result.get("status") == "success":
                self.logger.info(f"[{task_id}] 流式处理成功完成")
                return compose_result
            else:
                err_msg = compose_result.get('message') if compose_result else '无效的合成结果'
                self.logger.error(f"[{task_id}] 流式处理失败: {err_msg}")
                return {"status": "error", "message": err_msg}
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 流式TTS处理异常: {e}")
            return {"status": "error", "message": f"流式处理失败: {e}"}


    async def _prepare_video_for_processing(self, task_id: str, video_download_task, data_fetcher,
                                          audio_file_path: str, path_manager: PathManager) -> str:
        """
        专门负责视频准备的协程 - 与TTS生产并行执行
        
        Args:
            task_id: 任务ID
            video_download_task: 视频下载任务引用
            data_fetcher: DataFetcher服务实例  
            audio_file_path: 音频文件路径
            path_manager: 路径管理器
            
        Returns:
            str: 视频文件路径
        """
        try:
            self.logger.info(f"[{task_id}] 视频准备任务启动 - 与TTS生产并行执行")
            start_time = time.time()
            
            # 等待视频下载完成
            video_file_path = await data_fetcher.await_video_completion(task_id, video_download_task)
            
            if not video_file_path:
                raise ValueError("视频下载失败或视频文件路径为空")
            
            # 更新path_manager的媒体路径
            if audio_file_path and video_file_path:
                path_manager.set_media_paths(audio_file_path, video_file_path)
                self.logger.info(f"[{task_id}] 媒体路径已更新: audio={audio_file_path}, video={video_file_path}")
            
            duration = time.time() - start_time
            self.logger.info(f"[{task_id}] 视频准备完成，路径: {video_file_path}，耗时: {duration:.2f}s")
            
            return video_file_path
            
        except Exception as e:
            self.logger.error(f"[{task_id}] 视频准备异常: {e}")
            raise

    async def _align_and_adjust_stream(self, task_id: str, tts_queue: asyncio.Queue, 
                                     aligned_queue: asyncio.Queue, duration_aligner, 
                                     timestamp_adjuster, path_manager: PathManager):
        """预处理流水线：时长对齐和时间戳调整"""
        current_time_ms = 0.0
        processed_batches = 0
        
        self.logger.info(f"[{task_id}] 预处理流水线启动")
        
        try:
            while True:
                # 获取TTS批次
                queue_item = await tts_queue.get()
                
                if queue_item['type'] == 'complete':
                    # TTS生产完成，发送完成信号
                    await aligned_queue.put({'type': 'complete'})
                    self.logger.info(f"[{task_id}] 预处理流水线完成，处理批次: {processed_batches}")
                    break
                elif queue_item['type'] == 'error':
                    # TTS生产错误，传递错误信号
                    await aligned_queue.put({'type': 'error', 'message': queue_item['message']})
                    break
                elif queue_item['type'] == 'batch':
                    tts_batch = queue_item['data']
                    batch_counter = queue_item['batch_counter']
                    
                    # 立即进行时长对齐
                    aligned_batch = await self._align_batch(tts_batch, duration_aligner, 
                                                          path_manager, task_id, batch_counter)
                    if not aligned_batch:
                        continue
                    
                    # 立即进行时间戳调整
                    adjusted_batch = await self._adjust_timestamps(aligned_batch, timestamp_adjuster, 
                                                                 current_time_ms, task_id, batch_counter)
                    if not adjusted_batch:
                        continue
                    
                    # 更新时间位置
                    last_sentence = adjusted_batch[-1]
                    current_time_ms = last_sentence.adjusted_start + last_sentence.adjusted_duration
                    
                    # 发送到下一个阶段
                    await aligned_queue.put({
                        'type': 'aligned_batch',
                        'data': adjusted_batch,
                        'batch_counter': batch_counter
                    })
                    
                    processed_batches += 1
                    self.logger.debug(f"[{task_id}] 预处理完成批次 {batch_counter}")
                    
        except Exception as e:
            self.logger.error(f"[{task_id}] 预处理流水线异常: {e}")
            await aligned_queue.put({'type': 'error', 'message': str(e)})

    async def _compose_media_stream(self, task_id: str, aligned_queue: asyncio.Queue, 
                                  video_file_path: str, media_mixer, hls_manager, 
                                  path_manager: PathManager) -> Dict:
        """媒体合成流水线：视频准备完成后立即处理预处理结果"""
        
        # 初始化HLS管理器
        await self._init_hls_manager(task_id, path_manager.audio_file_path, 
                                   video_file_path, path_manager)
        
        processed_segments = []
        added_hls_segments = 0
        
        self.logger.info(f"[{task_id}] 媒体合成流水线启动")
        
        try:
            while True:
                # 获取预处理结果
                queue_item = await aligned_queue.get()
                
                if queue_item['type'] == 'complete':
                    self.logger.info(f"[{task_id}] 媒体合成流水线完成，处理段数: {added_hls_segments}")
                    break
                elif queue_item['type'] == 'error':
                    return {"status": "error", "message": queue_item['message']}
                elif queue_item['type'] == 'aligned_batch':
                    adjusted_batch = queue_item['data']
                    batch_counter = queue_item['batch_counter']
                    
                    # 立即进行媒体混合
                    segment_path = await self._compose_segment(adjusted_batch, batch_counter, 
                                                             media_mixer, task_id, path_manager)
                    if not segment_path:
                        continue
                    
                    # 立即添加HLS段
                    hls_success = await self._add_hls_segment(segment_path, batch_counter + 1, 
                                                            hls_manager, task_id)
                    if hls_success:
                        processed_segments.append(segment_path)
                        added_hls_segments += 1
                        self.logger.debug(f"[{task_id}] 媒体合成完成批次 {batch_counter}")
            
            # HLS最终化
            result = await hls_manager.finalize_merge(task_id, processed_segments, path_manager)
            if result and result.get("status") == "success":
                self.logger.info(f"[{task_id}] 流式处理完成，共生成 {added_hls_segments} 个HLS段")
                return result
            else:
                return {"status": "error", "message": "HLS最终化失败"}
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 媒体合成流水线异常: {e}")
            return {"status": "error", "message": f"媒体合成失败: {e}"}

    async def _align_batch(self, tts_batch: list, duration_aligner, path_manager: PathManager, 
                          task_id: str, batch_counter: int) -> list:
        """时长对齐单个批次"""
        try:
            aligned_batch = await duration_aligner(tts_batch, max_speed=1.2, path_manager=path_manager)
            if not aligned_batch:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 时长对齐失败")
                return None
            return aligned_batch
        except Exception as e:
            self.logger.error(f"[{task_id}] 批次 {batch_counter} 时长对齐异常: {e}")
            return None

    async def _adjust_timestamps(self, aligned_batch: list, timestamp_adjuster, 
                               current_time_ms: float, task_id: str, batch_counter: int) -> list:
        """时间戳调整单个批次"""
        try:
            adjusted_batch = await timestamp_adjuster(aligned_batch, self.config.TARGET_SR, current_time_ms)
            if not adjusted_batch:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 时间戳调整失败")
                return None
            return adjusted_batch
        except Exception as e:
            self.logger.error(f"[{task_id}] 批次 {batch_counter} 时间戳调整异常: {e}")
            return None

    async def _compose_segment(self, adjusted_batch: list, batch_counter: int, 
                              media_mixer, task_id: str, path_manager: PathManager) -> str:
        """媒体混合单个批次"""
        try:
            segment_path = await media_mixer.mix_media(
                sentences_batch=adjusted_batch,
                path_manager=path_manager,
                batch_counter=batch_counter,
                task_id=task_id
            )
            if not segment_path:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 媒体混合失败")
                return None
            return segment_path
        except Exception as e:
            self.logger.error(f"[{task_id}] 批次 {batch_counter} 媒体混合异常: {e}")
            return None

    async def _add_hls_segment(self, segment_path: str, segment_number: int, 
                             hls_manager, task_id: str) -> bool:
        """添加HLS段"""
        try:
            hls_result = await hls_manager.add_segment(task_id, segment_path, segment_number)
            if not (isinstance(hls_result, dict) and hls_result.get("status") == "success"):
                self.logger.warning(f"[{task_id}] HLS段 {segment_number} 添加失败")
                return False
            return True
        except Exception as e:
            self.logger.error(f"[{task_id}] HLS段 {segment_number} 添加异常: {e}")
            return False

    async def _tts_consumer(self, task_id: str, tts_queue: asyncio.Queue, video_task,
                          path_manager: PathManager, duration_aligner, timestamp_adjuster, 
                          media_mixer, hls_manager) -> Tuple[bool, List[str], int]:
        """TTS消费者 - 缓存TTS批次，等待视频准备完成后批量处理"""
        start_time = time.time()
        processed_segment_paths = []
        added_hls_segments = 0
        current_audio_time_ms = 0.0
        failed_batches = 0
        video_file_path = None
        hls_initialized = False
        
        # 缓存TTS批次，等视频准备好后批量处理
        cached_batches = []
        
        try:
            self.logger.info(f"[{task_id}] TTS消费者启动")
            
            # 阶段1: 缓存TTS批次阶段
            tts_complete = False
            video_ready = False
            cache_start_time = time.time()
            cache_timeout = 300  # 5分钟超时
            
            while True:
                try:
                    # 检查视频是否准备好
                    if not video_ready and video_task.done():
                        try:
                            video_file_path = await video_task
                            video_ready = True
                            self.logger.info(f"[{task_id}] 视频准备完成: {video_file_path}")
                        except Exception as e:
                            self.logger.error(f"[{task_id}] 视频准备失败: {e}")
                            return False, processed_segment_paths, added_hls_segments
                    
                    # 只有当TTS完成且视频准备好时才退出
                    if tts_complete and video_ready:
                        self.logger.info(f"[{task_id}] TTS和视频都已完成，退出缓存阶段")
                        break
                    
                    # 超时检查
                    if time.time() - cache_start_time > cache_timeout:
                        self.logger.warning(f"[{task_id}] 缓存阶段超时，强制退出。TTS完成:{tts_complete}, 视频准备:{video_ready}")
                        if not video_ready and video_task.done():
                            try:
                                video_file_path = await video_task
                                video_ready = True
                            except Exception:
                                pass
                        break
                    
                    # 从队列获取TTS批次（非阻塞）
                    try:
                        queue_item = await asyncio.wait_for(tts_queue.get(), timeout=1.0)
                    except asyncio.TimeoutError:
                        # 队列暂时为空，继续等待
                        continue
                    
                    # 处理队列项
                    if queue_item['type'] == 'complete':
                        tts_complete = True
                        self.logger.info(f"[{task_id}] 智能消费者收到TTS完成信号，当前缓存批次: {len(cached_batches)}")
                        # 不立即break，继续检查是否视频也准备好了
                    elif queue_item['type'] == 'error':
                        error_msg = queue_item.get('message', '未知TTS错误')
                        self.logger.error(f"[{task_id}] 智能消费者收到TTS错误信号: {error_msg}")
                        return False, processed_segment_paths, added_hls_segments
                    elif queue_item['type'] == 'batch':
                        # 缓存TTS批次
                        tts_batch = queue_item['data']
                        batch_counter = queue_item['batch_counter']
                        cached_batches.append(queue_item)
                        self.logger.info(
                            f"[{task_id}] 智能消费者缓存批次 {batch_counter}，"
                            f"包含 {len(tts_batch)} 个句子，总缓存: {len(cached_batches)} 批次"
                        )
                        
                except Exception as e:
                    self.logger.error(f"[{task_id}] 智能消费者缓存阶段异常: {e}")
                    continue
            
            # 阶段2: 批量处理阶段
            if not video_file_path:
                self.logger.error(f"[{task_id}] 视频文件路径为空，无法进行批量处理")
                return False, processed_segment_paths, added_hls_segments
            
            # 检查是否有缓存的批次
            if not cached_batches:
                if not tts_complete:
                    self.logger.warning(f"[{task_id}] TTS未完成且无缓存批次，可能TTS生产失败或太慢")
                    return False, processed_segment_paths, added_hls_segments
                else:
                    self.logger.warning(f"[{task_id}] TTS已完成但无缓存批次，可能没有句子需要处理")
                    # 继续处理剩余队列项
            
            self.logger.info(
                f"[{task_id}] 智能消费者开始批量处理 - "
                f"视频已准备: {video_file_path}，缓存批次数: {len(cached_batches)}"
            )
            
            # 初始化HLS管理器（只有在有批次需要处理时才初始化）
            if cached_batches:
                audio_file_path = path_manager.audio_file_path
                try:
                    await self._init_hls_manager(task_id, audio_file_path, video_file_path, path_manager)
                    hls_initialized = True
                    self.logger.info(f"[{task_id}] HLS管理器初始化完成")
                except Exception as e:
                    self.logger.error(f"[{task_id}] HLS管理器初始化失败: {e}")
                    return False, processed_segment_paths, added_hls_segments
            
            # 批量处理所有缓存的TTS批次
            for queue_item in cached_batches:
                try:
                    tts_batch = queue_item['data']
                    batch_counter = queue_item['batch_counter']
                    batch_start_time = time.time()
                    
                    self.logger.info(
                        f"[{task_id}] 智能消费者处理批次 {batch_counter}，"
                        f"包含 {len(tts_batch)} 个句子"
                    )
                    
                    # 无阻塞处理（视频已准备好）
                    batch_result = await self._process_batch(
                        task_id, tts_batch, batch_counter, current_audio_time_ms,
                        video_file_path, path_manager, duration_aligner, timestamp_adjuster, 
                        media_mixer, hls_manager
                    )
                    
                    batch_duration = time.time() - batch_start_time
                    
                    if batch_result and batch_result.get("success"):
                        added_hls_segments += 1
                        processed_segment_paths.append(batch_result["segment_path"])
                        current_audio_time_ms = batch_result["new_time_ms"]
                        self.logger.info(
                            f"[{task_id}] 智能消费者成功完成批次 {batch_counter}，"
                            f"耗时: {batch_duration:.2f}s，总段数: {added_hls_segments}"
                        )
                    else:
                        failed_batches += 1
                        self.logger.warning(
                            f"[{task_id}] 智能消费者批次 {batch_counter} 处理失败，"
                            f"失败批次数: {failed_batches}"
                        )
                        
                    # 清理内存
                    self._clean_memory()
                    
                except Exception as e:
                    failed_batches += 1
                    self.logger.error(f"[{task_id}] 智能消费者处理批次异常: {e}")
                    continue
            
            # 处理剩余的队列项（如果有）
            # 如果没有缓存批次但需要初始化HLS，在这里初始化
            if not hls_initialized and (not tts_complete):
                audio_file_path = path_manager.audio_file_path
                try:
                    await self._init_hls_manager(task_id, audio_file_path, video_file_path, path_manager)
                    hls_initialized = True
                    self.logger.info(f"[{task_id}] HLS管理器延迟初始化完成")
                except Exception as e:
                    self.logger.error(f"[{task_id}] HLS管理器延迟初始化失败: {e}")
                    return False, processed_segment_paths, added_hls_segments
            
            # 处理队列中剩余的TTS批次
            while not tts_complete:
                try:
                    queue_item = await asyncio.wait_for(tts_queue.get(), timeout=10.0)
                    
                    if queue_item['type'] == 'complete':
                        tts_complete = True
                        self.logger.info(f"[{task_id}] 智能消费者处理完所有批次")
                        break
                    elif queue_item['type'] == 'error':
                        error_msg = queue_item.get('message', '未知TTS错误')
                        self.logger.error(f"[{task_id}] 智能消费者后续处理收到错误: {error_msg}")
                        return False, processed_segment_paths, added_hls_segments
                    elif queue_item['type'] == 'batch':
                        # 确保HLS管理器已初始化
                        if not hls_initialized:
                            audio_file_path = path_manager.audio_file_path
                            try:
                                await self._init_hls_manager(task_id, audio_file_path, video_file_path, path_manager)
                                hls_initialized = True
                                self.logger.info(f"[{task_id}] HLS管理器动态初始化完成")
                            except Exception as e:
                                self.logger.error(f"[{task_id}] HLS管理器动态初始化失败: {e}")
                                return False, processed_segment_paths, added_hls_segments
                        
                        # 立即处理新批次
                        tts_batch = queue_item['data']
                        batch_counter = queue_item['batch_counter']
                        
                        batch_result = await self._process_batch(
                            task_id, tts_batch, batch_counter, current_audio_time_ms,
                            video_file_path, path_manager, duration_aligner, timestamp_adjuster, 
                            media_mixer, hls_manager
                        )
                        
                        if batch_result and batch_result.get("success"):
                            added_hls_segments += 1
                            processed_segment_paths.append(batch_result["segment_path"])
                            current_audio_time_ms = batch_result["new_time_ms"]
                            self.logger.info(f"[{task_id}] 智能消费者动态处理批次 {batch_counter} 成功")
                        else:
                            failed_batches += 1
                            self.logger.warning(f"[{task_id}] 智能消费者动态处理批次 {batch_counter} 失败")
                            
                except asyncio.TimeoutError:
                    self.logger.warning(f"[{task_id}] 智能消费者等待新批次超时，可能TTS生产已完成")
                    break
                except Exception as e:
                    self.logger.error(f"[{task_id}] 智能消费者后续处理异常: {e}")
                    break
            
            # 计算性能指标
            total_duration = time.time() - start_time
            success_rate = ((added_hls_segments) / (added_hls_segments + failed_batches) * 100) if (added_hls_segments + failed_batches) > 0 else 0
            
            self.logger.info(f"[{task_id}] TTS消费完成 - 成功: {added_hls_segments}, 失败: {failed_batches}, 耗时: {total_duration:.1f}s")
            
            return True, processed_segment_paths, added_hls_segments
            
        except Exception as e:
            self.logger.error(f"[{task_id}] TTS消费者异常: {e}")
            return False, processed_segment_paths, added_hls_segments

    async def _process_batch(self, task_id: str, batch: list, batch_counter: int,
                           current_time_ms: float, video_file_path: str, path_manager: PathManager,
                           duration_aligner, timestamp_adjuster, media_mixer, hls_manager) -> Dict:
        """处理TTS批次 - 无阻塞执行"""
        try:
            self.logger.debug(f"[{task_id}] 处理批次 {batch_counter}")
            
            # 阶段1: 时长对齐
            align_start_time = time.time()
            aligned_batch = await duration_aligner(batch, max_speed=1.2, path_manager=path_manager)
            if not aligned_batch:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 时长对齐失败")
                return {"success": False}
            align_duration = time.time() - align_start_time
            self.logger.debug(f"[{task_id}] 批次 {batch_counter} 时长对齐完成，耗时: {align_duration:.2f}s")
                
            # 阶段2: 时间戳调整
            adjust_start_time = time.time()
            adjusted_batch = await timestamp_adjuster(
                aligned_batch, self.config.TARGET_SR, current_time_ms
            )
            if not adjusted_batch:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 时间戳调整失败")
                return {"success": False}
            adjust_duration = time.time() - adjust_start_time
            self.logger.debug(f"[{task_id}] 批次 {batch_counter} 时间戳调整完成，耗时: {adjust_duration:.2f}s")
                
            # 计算新的时间位置
            last_sentence = adjusted_batch[-1]
            new_time_ms = last_sentence.adjusted_start + last_sentence.adjusted_duration
            
            # 阶段3: 媒体混合 - 视频已准备好，直接执行
            mixer_start_time = time.time()
            segment_path = await media_mixer.mix_media(
                sentences_batch=adjusted_batch,
                path_manager=path_manager,
                batch_counter=batch_counter,
                task_id=task_id
            )
            
            if not segment_path:
                self.logger.warning(f"[{task_id}] 批次 {batch_counter} 媒体混合失败")
                return {"success": False}
            
            mixer_duration = time.time() - mixer_start_time
            self.logger.debug(f"[{task_id}] 批次 {batch_counter} 媒体混合完成，耗时: {mixer_duration:.2f}s")
                
            # 阶段4: 添加HLS段
            hls_start_time = time.time()
            hls_result = await hls_manager.add_segment(
                task_id, segment_path, batch_counter + 1
            )
            
            if hls_result and hls_result.get("status") == "success":
                hls_duration = time.time() - hls_start_time
                self.logger.debug(f"[{task_id}] 批次 {batch_counter} HLS段添加完成，耗时: {hls_duration:.2f}s")
                
                return {
                    "success": True,
                    "segment_path": segment_path, 
                    "new_time_ms": new_time_ms
                }
            else:
                self.logger.error(f"[{task_id}] 批次 {batch_counter} HLS段添加失败")
                return {"success": False}
                
        except Exception as e:
            self.logger.error(f"[{task_id}] 处理批次 {batch_counter} 异常: {e}")
            return {"success": False}


    async def _tts_producer(self, task_id: str, tts_service, sentences: List, path_manager: PathManager, 
                           tts_queue: asyncio.Queue) -> None:
        """TTS生产者 - 生成音频并放入队列"""
        start_time = time.time()
        batch_counter = 0
        failed_batches = 0
        
        try:
            self.logger.info(f"[{task_id}] TTS生产者启动，句子数: {len(sentences)}")
            
            # 使用TTS生成器逐批次生成音频
            async for tts_batch in tts_service.generate_audio_stream(sentences, path_manager):
                if not tts_batch:
                    continue
                
                batch_start_time = time.time()
                try:
                    # 验证TTS批次质量
                    valid_sentences = [s for s in tts_batch if s.generated_audio is not None]
                    if len(valid_sentences) != len(tts_batch):
                        self.logger.warning(
                            f"[{task_id}] TTS批次 {batch_counter} 质量检查: "
                            f"{len(valid_sentences)}/{len(tts_batch)} 个句子生成成功"
                        )
                    
                    self.logger.debug(f"[{task_id}] TTS批次 {batch_counter} 完成，句子: {len(tts_batch)}")
                    
                    # 将完成的TTS批次放入队列
                    await tts_queue.put({
                        'type': 'batch',
                        'data': tts_batch,
                        'batch_counter': batch_counter
                    })
                    
                    batch_duration = time.time() - batch_start_time
                    batch_counter += 1
                    
                    
                except Exception as e:
                    failed_batches += 1
                    self.logger.error(f"[{task_id}] TTS生产者批次 {batch_counter} 处理失败: {e}")
                    continue
                
                # 清理内存
                self._clean_memory()
            
            # 发送完成信号
            await tts_queue.put({'type': 'complete'})
            
            # 计算性能指标
            total_duration = time.time() - start_time
            success_rate = (batch_counter / (batch_counter + failed_batches) * 100) if (batch_counter + failed_batches) > 0 else 0
            
            self.logger.info(f"[{task_id}] TTS生产完成 - 成功: {batch_counter}, 失败: {failed_batches}, 耗时: {total_duration:.1f}s")
            
        except Exception as e:
            self.logger.error(f"[{task_id}] TTS生产异常: {e}")
            # 发送错误信号
            try:
                await tts_queue.put({'type': 'error', 'message': str(e)})
            except Exception:
                self.logger.error(f"[{task_id}] 无法发送错误信号到队列")
            raise


