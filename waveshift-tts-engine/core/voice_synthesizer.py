# core/voice_synthesizer.py
import os
import sys
import logging
import asyncio
import gc
from typing import List, AsyncGenerator

import torch
import numpy as np
import soundfile as sf
from pathlib import Path

# 全局 logger
logger = logging.getLogger(__name__)

class VoiceSynthesizer:
    """
    优雅的语音合成器 - 专注批量TTS处理
    基于IndexTTS v0.1.4模型的高性能语音合成引擎
    """
    def __init__(self, config=None):
        # 确保在新进程中可以正确导入indextts模块
        project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        indextts_dir = os.path.join(project_dir, 'models', 'IndexTTS')
        if indextts_dir not in sys.path:
            sys.path.insert(0, indextts_dir)
            logger.info(f"添加IndexTTS模块路径: {indextts_dir}")
        
        # 初始化配置和设备
        if config is None:
            from config import get_config
            self.config = get_config()
        else:
            self.config = config
        
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        
        # 从配置获取参数 - 统一方式
        self.sampling_rate = self.config.tts.target_sample_rate
        self.batch_size = self.config.tts.batch_size
        
        self._lock = asyncio.Lock()
        
        # 定义模型路径
        checkpoints_dir = os.path.join(project_dir, 'models', 'IndexTTS', 'checkpoints')
        cfg_path = os.path.join(checkpoints_dir, 'config.yaml')
        model_dir = checkpoints_dir
        
        try:
            # 导入并初始化IndexTTS模型
            from models.IndexTTS.indextts.infer import IndexTTS
            logger.info(f"初始化IndexTTS模型: {cfg_path}")
            
            self.tts_model = IndexTTS(
                cfg_path=cfg_path,
                model_dir=model_dir,
                is_fp16=True,
                device=self.device
            )
            logger.info(f"IndexTTS模型加载成功，batch_size={self.batch_size}")
            
        except Exception as e:
            logger.exception(f"IndexTTS初始化失败: {e}")
            raise

    def _cleanupMemory(self):
        """清理GPU内存"""
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    async def synthesizeSingle(self, sentence) -> dict:
        """
        合成单个句子的语音
        
        Args:
            sentence: Sentence对象，包含translated_text和audio(声音样本路径)
            
        Returns:
            dict: {
                "success": bool,
                "audio_data": bytes,
                "duration_ms": int,
                "error": str (if failed)
            }
        """
        try:
            if not sentence or not sentence.translated_text:
                return {
                    "success": False,
                    "error": "句子或翻译文本为空"
                }
            
            logger.info(f"TTS: 开始合成单句 - {sentence.translated_text[:50]}...")
            
            # 调用批量合成处理单个句子
            sentences_list = [sentence]
            
            # 生成音频
            async for batch in self.generateVoices(sentences_list):
                if batch and len(batch) > 0:
                    processed_sentence = batch[0]  # 取第一个（也是唯一一个）句子
                    
                    # 读取生成的音频文件
                    if hasattr(processed_sentence, 'tts_audio_path') and processed_sentence.tts_audio_path:
                        try:
                            with open(processed_sentence.tts_audio_path, 'rb') as f:
                                audio_data = f.read()
                            
                            # 估算音频时长
                            audio_duration_ms = len(audio_data) / (16000 * 2) * 1000
                            
                            return {
                                "success": True,
                                "audio_data": audio_data,
                                "duration_ms": int(audio_duration_ms)
                            }
                        except Exception as e:
                            logger.error(f"TTS: 读取音频文件失败: {e}")
                            return {
                                "success": False,
                                "error": f"读取音频文件失败: {e}"
                            }
                    else:
                        return {
                            "success": False,
                            "error": "未生成音频文件"
                        }
            
            return {
                "success": False,
                "error": "音频生成流为空"
            }
            
        except Exception as e:
            logger.error(f"TTS: 单句生成失败: {e}")
            return {
                "success": False,
                "error": str(e)
            }

    async def generateVoices(self, sentences: List, path_manager=None) -> AsyncGenerator[List, None]:
        """
        批量生成语音 - 核心合成接口
        
        Args:
            sentences: 句子列表
            path_manager: 路径管理器（可选）
        """
        if not sentences:
            logger.warning("TTS: 没有可处理的句子，跳过生成")
            return

        task_id = getattr(sentences[0], 'task_id', 'unknown') if sentences else 'unknown'
        logger.info(f"TTS: 开始批量合成 {len(sentences)} 个句子 (任务: {task_id})")
        
        # 创建输出目录
        tts_output_dir = None
        if hasattr(sentences[0], 'task_id') and sentences[0].task_id:
            tts_output_dir = Path(f"/tmp/tts_{task_id}/tts_output")
            tts_output_dir.mkdir(parents=True, exist_ok=True)
            logger.info(f"TTS音频将保存到: {tts_output_dir}")

        # 批量生成音频
        batch = []
        for sentence in sentences:
            try:
                # 验证音频文件路径
                if not sentence.audio or sentence.audio == "." or not os.path.exists(sentence.audio):
                    if sentence.audio and sentence.audio != ".":
                        logger.warning(f"TTS 警告：句子 {sentence.sequence}，音频样本无效: '{sentence.audio}'，将使用默认语音")
                    else:
                        logger.info(f"TTS：句子 {sentence.sequence} 未提供音频样本，使用默认语音合成")
                    
                    # 使用默认语音合成（不使用语音克隆）
                    async with self._lock:
                        tts_result = await asyncio.to_thread(
                            self.tts_model.infer,
                            None,  # 不提供参考音频，使用默认语音
                            sentence.translated_text,
                            None,
                            False
                        )
                else:
                    logger.debug(f"TTS 处理句子 {sentence.sequence}，使用音频样本: {sentence.audio}")
                    async with self._lock:
                        tts_result = await asyncio.to_thread(
                            self.tts_model.infer,
                            sentence.audio,
                            sentence.translated_text,
                            None,
                            False
                        )
            except Exception as e:
                logger.error(f"TTS 错误：句子 {sentence.sequence}，{e}")
                tts_result = None
            
            if tts_result is None:
                sentence.generated_audio = None
                sentence.duration = 0.0
            else:
                sr, wav_np = tts_result
                wav_flat = wav_np.flatten().astype(np.float32) / 32767.0
                sentence.generated_audio = wav_flat
                sentence.duration = len(wav_flat) / sr * 1000
                
                # 保存TTS生成的音频
                if tts_output_dir:
                    try:
                        # 生成文件名
                        speaker_name = sentence.speaker.replace(' ', '_').replace('/', '_')
                        filename = f"sentence_{sentence.sequence:04d}_{speaker_name}.wav"
                        audio_path = tts_output_dir / filename
                        
                        # 异步保存音频文件
                        await asyncio.to_thread(
                            sf.write, 
                            str(audio_path), 
                            wav_flat, 
                            sr, 
                            subtype='FLOAT'
                        )
                        
                        # 在句子对象中记录保存路径
                        sentence.tts_audio_path = str(audio_path)
                        
                        logger.info(f"TTS音频已保存: {filename} (时长: {sentence.duration:.1f}ms)")
                    except Exception as save_error:
                        logger.error(f"保存TTS音频失败: {save_error}")
            
            batch.append(sentence)
            if len(batch) >= self.batch_size:
                yield batch
                batch = []
        
        if batch:
            yield batch
        
        # 清理内存
        self._cleanupMemory()

    async def synthesizeBatch(self, sentences: List) -> List:
        """
        批量合成接口的便捷包装
        
        Args:
            sentences: 句子列表
            
        Returns:
            List: 处理后的句子列表
        """
        results = []
        async for batch in self.generateVoices(sentences):
            results.extend(batch)
        return results

