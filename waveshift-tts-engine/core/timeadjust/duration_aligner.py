import logging
import asyncio
from config import get_config
from core.sentence_tools import Sentence
from typing import List
from utils.duration_utils import apply_speed_and_silence, align_batch

logger = logging.getLogger(__name__)

class DurationAligner:
    def __init__(self, simplifier=None, index_tts=None):
        self.config = get_config()
        self.sample_rate = self.config.TARGET_SR
        
        # 接受服务实例作为参数
        self.simplifier = simplifier
        self.index_tts = index_tts
        
        logger.info("时长对齐器初始化完成")

    async def __call__(self, sentences: List[Sentence], max_speed: float = 1.1, path_manager=None) -> List[Sentence]:
        """执行句子时长对齐
        
        Args:
            sentences: 句子列表
            max_speed: 最大速度
            path_manager: 共享的路径管理器（可选）
        """
        if not sentences:
            logger.warning("时长对齐：收到空句子列表")
            return sentences

        task_id = sentences[0].task_id if sentences else "unknown"
        logger.info(f"[{task_id}] 开始时长对齐，句子数: {len(sentences)}")

        try:
            # 初始对齐
            aligned_sentences = await asyncio.to_thread(align_batch, sentences)
            if not aligned_sentences:
                logger.error(f"[{task_id}] 初始对齐失败")
                return sentences

            # 检查超速句子
            fast_indices = [i for i, s in enumerate(aligned_sentences) if s.speed > max_speed]
            
            if fast_indices:
                logger.info(f"[{task_id}] 发现 {len(fast_indices)} 个超速句子，进行简化处理")
                return await self._process_fast_sentences(task_id, aligned_sentences, fast_indices, max_speed, path_manager)
            else:
                logger.info(f"[{task_id}] 所有句子速度正常，应用速度调整")
                await apply_speed_and_silence(aligned_sentences, self.sample_rate)
                return aligned_sentences

        except Exception as e:
            logger.exception(f"[{task_id}] 时长对齐失败: {e}")
            # 尝试应用基本的速度调整作为后备方案
            try:
                if 'aligned_sentences' in locals() and aligned_sentences:
                    await apply_speed_and_silence(aligned_sentences, self.sample_rate)
                    return aligned_sentences
            except Exception:
                pass
            return sentences

    async def _process_fast_sentences(self, task_id: str, aligned_sentences: List[Sentence], 
                                    fast_indices: List[int], max_speed: float, path_manager=None) -> List[Sentence]:
        """处理超速句子
        
        Args:
            task_id: 任务ID
            aligned_sentences: 对齐后的句子列表
            fast_indices: 超速句子的索引
            max_speed: 最大速度
            path_manager: 共享的路径管理器（可选）
        """
        try:
            # 提取超速句子
            fast_sentences = [aligned_sentences[idx] for idx in fast_indices]
            
            # 简化文本
            simplified_results = await self._simplify_sentences(task_id, fast_sentences, max_speed)
            if not simplified_results:
                logger.warning(f"[{task_id}] 简化失败，使用原始对齐结果")
                await apply_speed_and_silence(aligned_sentences, self.sample_rate)
                return aligned_sentences
            
            # 重新生成音频 - 传递path_manager
            refined_sentences = await self._regenerate_audio(task_id, simplified_results, path_manager)
            if not refined_sentences or len(refined_sentences) != len(fast_indices):
                logger.warning(f"[{task_id}] 音频重新生成失败，使用原始对齐结果")
                await apply_speed_and_silence(aligned_sentences, self.sample_rate)
                return aligned_sentences
            
            # 替换简化后的句子
            result_sentences = aligned_sentences.copy()
            for i, orig_idx in enumerate(fast_indices):
                if i < len(refined_sentences) and refined_sentences[i].generated_audio is not None:
                    result_sentences[orig_idx] = refined_sentences[i]
                    logger.info(f"[{task_id}] 句子 {refined_sentences[i].sequence} 简化成功")
            
            # 最终对齐
            final_aligned = await asyncio.to_thread(align_batch, result_sentences)
            await apply_speed_and_silence(final_aligned, self.sample_rate)
            
            logger.info(f"[{task_id}] 超速句子处理完成")
            return final_aligned
            
        except Exception as e:
            logger.exception(f"[{task_id}] 处理超速句子失败: {e}")
            await apply_speed_and_silence(aligned_sentences, self.sample_rate)
            return aligned_sentences

    async def _simplify_sentences(self, task_id: str, fast_sentences: List[Sentence], max_speed: float) -> List[Sentence]:
        """简化句子文本"""
        try:
            logger.info(f"[{task_id}] 开始简化 {len(fast_sentences)} 个句子")
            simplified_results = await self.simplifier.simplify_sentences(
                fast_sentences, 
                target_speed=max_speed
            )
            logger.info(f"[{task_id}] 简化完成，获得 {len(simplified_results)} 个句子")
            return simplified_results
        except Exception as e:
            logger.error(f"[{task_id}] 简化失败: {e}")
            return []

    async def _regenerate_audio(self, task_id: str, simplified_results: List[Sentence], path_manager=None) -> List[Sentence]:
        """重新生成音频
        
        Args:
            task_id: 任务ID
            simplified_results: 简化后的句子列表
            path_manager: 共享的路径管理器（可选）
        """
        refined_sentences = []
        try:
            logger.info(f"[{task_id}] 开始重新生成 {len(simplified_results)} 个句子的音频")
            async for tts_batch in self.index_tts.generate_audio_stream(simplified_results, path_manager):
                if tts_batch:
                    refined_sentences.extend(tts_batch)
            logger.info(f"[{task_id}] 音频重新生成完成，获得 {len(refined_sentences)} 个句子")
            return refined_sentences
        except Exception as e:
            logger.error(f"[{task_id}] 音频重新生成失败: {e}")
            return []