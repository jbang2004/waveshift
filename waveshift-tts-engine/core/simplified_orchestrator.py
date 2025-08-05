"""
简化的任务编排器 - 专注TTS核心功能
移除所有外部依赖，只保留必要的TTS处理逻辑
"""
import logging
import asyncio
import time
from typing import List

from core.voice_synthesizer import VoiceSynthesizer
from core.sentence_tools import Sentence
from config_simplified import get_config

logger = logging.getLogger(__name__)

class SimplifiedOrchestrator:
    """简化的TTS编排器 - 专注核心TTS功能"""
    
    def __init__(self):
        self.config = get_config()
        self.voice_synthesizer = VoiceSynthesizer(self.config.tts.batch_size)
        logger.info("简化编排器初始化完成")
    
    async def synthesize_batch(self, sentences: List[Sentence]) -> List[Sentence]:
        """
        批量合成句子
        
        Args:
            sentences: 待合成的句子列表
            
        Returns:
            List[Sentence]: 完成合成的句子列表
        """
        if not sentences:
            return []
        
        start_time = time.time()
        logger.info(f"开始批量合成 {len(sentences)} 个句子")
        
        try:
            # 使用语音合成器进行批量处理
            processed_sentences = await self.voice_synthesizer.synthesizeBatch(sentences)
            
            # 统计结果
            success_count = sum(1 for s in processed_sentences if s.generated_audio is not None)
            process_time = time.time() - start_time
            
            logger.info(f"批量合成完成: {success_count}/{len(processed_sentences)} 成功, 耗时: {process_time:.2f}s")
            
            return processed_sentences
            
        except Exception as e:
            logger.error(f"批量合成失败: {e}")
            # 返回原句子列表，标记失败
            for sentence in sentences:
                sentence.generated_audio = None
            return sentences
    
    async def get_synthesis_status(self) -> dict:
        """获取合成器状态"""
        return {
            "status": "ready",
            "batch_size": self.config.tts.batch_size,
            "target_sample_rate": self.config.tts.target_sample_rate,
            "device": self.voice_synthesizer.device if hasattr(self.voice_synthesizer, 'device') else 'unknown'
        }
    
    async def cleanup(self):
        """清理资源"""
        if hasattr(self.voice_synthesizer, '_cleanupMemory'):
            self.voice_synthesizer._cleanupMemory()
        logger.info("编排器资源清理完成")

# 全局实例
_orchestrator = None

def get_orchestrator() -> SimplifiedOrchestrator:
    """获取全局编排器实例"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = SimplifiedOrchestrator()
    return _orchestrator

if __name__ == "__main__":
    # 测试简化编排器
    import asyncio
    
    async def test_orchestrator():
        orchestrator = get_orchestrator()
        status = await orchestrator.get_synthesis_status()
        print(f"编排器状态: {status}")
    
    asyncio.run(test_orchestrator())