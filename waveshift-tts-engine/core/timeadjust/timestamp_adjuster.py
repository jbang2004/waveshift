import logging
from typing import List

logger = logging.getLogger(__name__)

class TimestampAdjuster:
    async def __call__(self, sentences: List, sample_rate: int, start_time: float = None) -> List:
        if not sentences:
            logger.warning("adjust_timestamps: 收到空的句子列表")
            return sentences
        
        logger.info(f"开始处理 {len(sentences)} 个句子的时间戳调整")
        current_time = start_time if start_time is not None else sentences[0].start_ms
        
        for sentence in sentences:
            if sentence.generated_audio is not None:
                actual_duration = (len(sentence.generated_audio) / sample_rate) * 1000
            else:
                actual_duration = 0
                logger.warning(f"句子 {sentence.sequence} 没有生成音频")
            
            sentence.adjusted_start = current_time
            sentence.adjusted_duration = actual_duration
            sentence.diff = sentence.duration - actual_duration
            current_time += actual_duration
        
        validation_issues = 0
        for i in range(len(sentences) - 1):
            current = sentences[i]
            next_sentence = sentences[i + 1]
            expected_next_start = current.adjusted_start + current.adjusted_duration
            if abs(next_sentence.adjusted_start - expected_next_start) > 1:
                logger.error(f"时间戳不连续 - 句子 {current.sequence} 结束时间: {expected_next_start:.2f}ms, 句子 {next_sentence.sequence} 开始时间: {next_sentence.adjusted_start:.2f}ms")
                validation_issues += 1
            if current.adjusted_duration <= 0:
                logger.error(f"句子 {current.sequence} 的时长无效: {current.adjusted_duration:.2f}ms")
                validation_issues += 1
        
        if validation_issues > 0:
            logger.warning(f"时间戳调整完成，处理了 {len(sentences)} 个句子，结束时间: {current_time:.2f}ms，发现 {validation_issues} 个问题")
        else:
            logger.info(f"时间戳调整完成，处理了 {len(sentences)} 个句子，结束时间: {current_time:.2f}ms，验证通过")
        
        return sentences