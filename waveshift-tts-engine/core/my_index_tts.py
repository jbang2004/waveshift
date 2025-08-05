# core/my_index_tts.py
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

class MyIndexTTSDeployment:
    """
    提供流式 TTS 服务
    """
    def __init__(self, config=None):
        # 确保在新进程中可以正确导入indextts模块
        project_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        indextts_dir = os.path.join(project_dir, 'models', 'IndexTTS')
        if indextts_dir not in sys.path:
            sys.path.insert(0, indextts_dir)
            logger.info(f"添加indextts模块路径: {indextts_dir}")
        
        # 记录当前sys.path用于调试
        logger.info(f"当前sys.path: {sys.path}")
        
        # 初始化配置和设备
        from config import Config
        self.config = config or Config()
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'

        # 定义模型和配置路径
        checkpoints_dir = os.path.join(project_dir, 'models', 'IndexTTS', 'checkpoints')
        cfg_path = os.path.join(checkpoints_dir, 'config.yaml')
        model_dir = checkpoints_dir
        
        try:
            # 在确保路径设置后导入模型
            from models.IndexTTS.indextts.infer import IndexTTS
            logger.info(f"导入IndexTTS成功，加载模型路径：{cfg_path}")
            self.tts_model = IndexTTS(
                cfg_path=cfg_path,
                model_dir=model_dir,
                is_fp16=True,
                device=self.device
            )
            logger.info("IndexTTS模型加载成功")
        except Exception as e:
            logger.exception(f"IndexTTS初始化失败: {e}")
            raise
            
        # 配置样本率和批次大小
        self.sampling_rate = self.config.TARGET_SR
        self.batch_size = self.config.TTS_BATCH_SIZE
        self._lock = asyncio.Lock()
        # Note: 句子数据现在通过参数传递，不再需要数据库客户端

    def _clean_memory(self):
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    async def generate_single_sentence(self, sentence, voice_settings: dict = None) -> dict:
        """
        为单个句子生成TTS音频（用于流式TTS处理）
        
        Args:
            sentence: Sentence对象，包含translated_text和audio(声音样本路径)
            voice_settings: 语音设置参数
            
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
            
            logger.info(f"TTS: 开始处理单句 - {sentence.translated_text[:50]}...")
            
            # 使用现有的generate_audio_stream方法处理单个句子
            sentences_list = [sentence]
            
            # 生成音频
            async for batch in self.generate_audio_stream(sentences_list):
                if batch and len(batch) > 0:
                    processed_sentence = batch[0]  # 取第一个（也是唯一一个）句子
                    
                    # 读取生成的音频文件
                    if hasattr(processed_sentence, 'tts_audio_path') and processed_sentence.tts_audio_path:
                        try:
                            with open(processed_sentence.tts_audio_path, 'rb') as f:
                                audio_data = f.read()
                            
                            # 估算音频时长（假设16kHz采样率，16位）
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

    async def generate_audio_stream(self, sentences: List, path_manager=None) -> AsyncGenerator[List, None]:
        """
        为句子列表生成音频流
        
        Args:
            sentences: 句子列表
            path_manager: 共享的路径管理器（可选）
        """
        if not sentences:
            logger.warning("TTS: 没有可处理的句子，跳过生成。")
            return

        task_id = getattr(sentences[0], 'task_id', 'unknown') if sentences else 'unknown'
        logger.info(f"TTS: 开始为 {len(sentences)} 个句子生成音频 (任务: {task_id})")
        
        # 使用传入的path_manager，如果没有则创建新的（向后兼容）
        if path_manager is None:
            from utils.path_manager import PathManager
            path_manager = PathManager(task_id)
            logger.warning(f"TTS: 未传入path_manager，创建新的临时目录")
        
        tts_output_dir = None
        
        # 如果启用保存，创建输出目录
        if self.config.SAVE_TTS_AUDIO:
            tts_output_dir = path_manager.temp.tts_output_dir
            logger.info(f"TTS音频将保存到: {tts_output_dir}")

        # 批量生成音频
        batch = []
        for sentence in sentences:
            try:
                # 验证音频文件路径
                if not sentence.audio or sentence.audio == "." or not os.path.exists(sentence.audio):
                    logger.error(f"TTS 错误：句子 {sentence.sequence}，音频文件路径无效: '{sentence.audio}'")
                    logger.error(f"句子详情：text='{sentence.translated_text[:50]}...', speaker='{sentence.speaker}'")
                    res = None
                else:
                    logger.debug(f"TTS 处理句子 {sentence.sequence}，音频路径: {sentence.audio}")
                    async with self._lock:
                        res = await asyncio.to_thread(
                            self.tts_model.infer,
                            sentence.audio,
                            sentence.translated_text,
                            None,
                            False
                        )
            except Exception as e:
                logger.error(f"TTS 错误：句子 {sentence.sequence}，{e}")
                res = None
            
            if res is None:
                sentence.generated_audio = None
                sentence.duration = 0.0
            else:
                sr, wav_np = res
                wav_flat = wav_np.flatten().astype(np.float32) / 32767.0
                sentence.generated_audio = wav_flat
                sentence.duration = len(wav_flat) / sr * 1000
                
                # 保存TTS生成的音频（如果启用）
                if self.config.SAVE_TTS_AUDIO and tts_output_dir:
                    try:
                        # 生成文件名（包含序号和说话人信息）
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
        self._clean_memory()
