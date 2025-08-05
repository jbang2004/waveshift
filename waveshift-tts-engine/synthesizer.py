"""
WaveShift TTS 语音合成引擎 - 核心API
专注于批量语音合成，移除所有外部依赖
"""
import logging
import asyncio
import tempfile
import os
from typing import List, Dict, Any
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.voice_synthesizer import VoiceSynthesizer
from core.sentence_tools import Sentence
from config_simplified import get_config

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ================================
# 请求/响应模型
# ================================

class SentenceRequest(BaseModel):
    """单句合成请求"""
    sequence: int
    text: str
    audioSample: str  # R2 key for voice cloning
    speaker: str
    startMs: int
    endMs: int

class SynthesisRequest(BaseModel):
    """批量合成请求"""
    sentences: List[SentenceRequest]
    settings: Dict[str, Any] = {}

class SynthesisResult(BaseModel):
    """单句合成结果"""
    sequence: int
    audioKey: str = ""
    durationMs: int = 0
    success: bool = False
    error: str = ""

class SynthesisResponse(BaseModel):
    """批量合成响应"""
    success: bool
    results: List[SynthesisResult] = []
    error: str = ""

# ================================
# FastAPI应用配置
# ================================

app = FastAPI(
    title="WaveShift TTS Synthesis Engine",
    description="专注批量语音合成的精简TTS引擎",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量
config = get_config()
voice_synthesizer = None

# ================================
# 核心API接口
# ================================

@app.on_event("startup")
async def startup_event():
    """应用启动初始化"""
    global voice_synthesizer
    try:
        voice_synthesizer = VoiceSynthesizer(config.tts.batch_size)
        logger.info(f"语音合成引擎初始化完成，batch_size={config.tts.batch_size}")
    except Exception as e:
        logger.error(f"语音合成引擎初始化失败: {e}")
        raise

@app.post("/synthesize", response_model=SynthesisResponse)
async def synthesize_voices(request: SynthesisRequest):
    """
    批量语音合成 - 核心接口
    
    接收一批句子，返回对应的TTS音频结果
    """
    if not voice_synthesizer:
        raise HTTPException(status_code=500, detail="语音合成引擎未初始化")
    
    if not request.sentences:
        return SynthesisResponse(success=True, results=[])
    
    logger.info(f"开始批量合成 {len(request.sentences)} 个句子")
    
    try:
        # 转换为内部Sentence对象
        sentences = []
        for req in request.sentences:
            sentence = create_sentence_from_request(req)
            sentences.append(sentence)
        
        # 批量合成
        results = []
        async for batch in voice_synthesizer.generateVoices(sentences):
            for sentence in batch:
                result = SynthesisResult(sequence=sentence.sequence)
                
                if sentence.generated_audio is not None:
                    try:
                        # 保存音频到临时文件
                        audio_key = await save_generated_audio(sentence)
                        result.audioKey = audio_key
                        result.durationMs = int(sentence.duration)
                        result.success = True
                        
                        logger.info(f"句子 {sentence.sequence} 合成成功，时长: {result.durationMs}ms")
                        
                    except Exception as e:
                        result.success = False
                        result.error = f"保存音频失败: {e}"
                        logger.error(f"句子 {sentence.sequence} 保存失败: {e}")
                else:
                    result.success = False
                    result.error = "语音合成失败"
                    logger.error(f"句子 {sentence.sequence} 合成失败")
                
                results.append(result)
        
        success_count = sum(1 for r in results if r.success)
        logger.info(f"批量合成完成: {success_count}/{len(results)} 成功")
        
        return SynthesisResponse(
            success=True,
            results=results
        )
        
    except Exception as e:
        logger.error(f"批量合成失败: {e}")
        return SynthesisResponse(
            success=False,
            error=str(e)
        )

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "tts-synthesis-engine",
        "version": "2.0.0",
        "batch_size": config.tts.batch_size if config else 3
    }

# ================================
# 辅助函数
# ================================

def create_sentence_from_request(req: SentenceRequest) -> Sentence:
    """从请求创建Sentence对象"""
    return Sentence(
        original_text=req.text,  # 添加缺失的original_text
        translated_text=req.text,
        sequence=req.sequence,
        audio=req.audioSample,  # 用作语音克隆样本
        speaker=req.speaker,
        start_ms=req.startMs,
        end_ms=req.endMs,
        target_duration=req.endMs - req.startMs  # 简化计算
    )

async def save_generated_audio(sentence: Sentence) -> str:
    """保存生成的音频并返回文件路径"""
    try:
        # 创建临时文件
        with tempfile.NamedTemporaryFile(
            suffix=f"_seq_{sentence.sequence:04d}.wav",
            delete=False,
            dir=str(config.paths.temp_dir) if config else "/tmp"
        ) as tmp_file:
            
            # 写入音频数据
            import soundfile as sf
            import numpy as np
            
            # 确保音频数据格式正确
            audio_data = sentence.generated_audio
            if isinstance(audio_data, np.ndarray):
                sf.write(tmp_file.name, audio_data, config.tts.target_sample_rate)
            else:
                tmp_file.write(audio_data)
            
            # 记录路径到sentence对象
            sentence.tts_audio_path = tmp_file.name
            
            logger.info(f"音频已保存: {tmp_file.name}")
            return tmp_file.name
            
    except Exception as e:
        logger.error(f"保存音频失败: {e}")
        raise

# ================================
# 应用入口
# ================================

if __name__ == "__main__":
    import uvicorn
    
    host = config.server.host if config else "0.0.0.0"
    port = config.server.port if config else 8000
    
    logger.info(f"启动TTS合成引擎: {host}:{port}")
    
    uvicorn.run(
        "synthesizer:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )