"""
WaveShift TTS 语音合成引擎 - 核心API v3.0
智能双模式架构：简单TTS和完整媒体处理
"""
import logging
import asyncio
import tempfile
import os
from typing import List, Dict, Any, Optional
from dataclasses import dataclass

from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from core.voice_synthesizer import VoiceSynthesizer
from core.sentence_tools import Sentence
from config import get_config

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
    """批量合成请求 - 支持双模式"""
    sentences: List[SentenceRequest]
    settings: Dict[str, Any] = {}
    
    # 处理模式选择
    mode: str = "simple"  # simple|full
    
    # 完整模式参数
    enable_duration_align: bool = False
    enable_timestamp_adjust: bool = False
    enable_media_mix: bool = False
    enable_hls: bool = False
    
    # 媒体文件路径（完整模式）
    video_path: Optional[str] = None
    audio_path: Optional[str] = None
    task_id: Optional[str] = None

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
    # 扩展字段（完整模式）
    processing_stages: List[str] = []
    output_url: Optional[str] = None
    task_id: Optional[str] = None

# ================================
# FastAPI应用配置
# ================================

app = FastAPI(
    title="WaveShift TTS Synthesis Engine v3.0",
    description="智能双模式TTS引擎：简单批量合成和完整媒体处理",
    version="3.0.0"
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
extended_services = {}  # 延迟加载的扩展服务

# ================================
# 核心API接口
# ================================

@app.on_event("startup")
async def startup_event():
    """应用启动初始化"""
    global voice_synthesizer
    try:
        voice_synthesizer = VoiceSynthesizer(config)
        logger.info(f"语音合成引擎初始化完成，batch_size={config.tts.batch_size}")
        logger.info("双模式架构就绪：支持simple和full两种处理模式")
    except Exception as e:
        logger.error(f"语音合成引擎初始化失败: {e}")
        raise

@app.post("/synthesize")
async def synthesize_voices(request: SynthesisRequest):
    """
    统一的语音合成接口 - 支持双模式
    
    模式说明：
    - simple: 仅TTS合成（默认，兼容TTS-Worker）
    - full: 完整处理（TTS + 时间对齐 + 媒体合成 + HLS）
    """
    if not voice_synthesizer:
        raise HTTPException(status_code=500, detail="语音合成引擎未初始化")
    
    if not request.sentences:
        return SynthesisResponse(success=True, results=[])
    
    logger.info(f"开始处理 {len(request.sentences)} 个句子，模式: {request.mode}")
    
    try:
        if request.mode == "simple":
            # 简单模式：仅TTS合成
            return await simple_tts_pipeline(request)
        else:
            # 完整模式：包含所有处理阶段
            return await full_processing_pipeline(request)
            
    except Exception as e:
        logger.error(f"处理失败: {e}")
        return SynthesisResponse(
            success=False,
            error=str(e)
        )

async def simple_tts_pipeline(request: SynthesisRequest) -> SynthesisResponse:
    """
    简单TTS管线 - 兼容TTS-Worker
    """
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
        logger.info(f"简单模式完成: {success_count}/{len(results)} 成功")
        
        return SynthesisResponse(
            success=True,
            results=results,
            processing_stages=["tts"]
        )
        
    except Exception as e:
        logger.error(f"简单模式处理失败: {e}")
        raise

async def full_processing_pipeline(request: SynthesisRequest) -> SynthesisResponse:
    """
    完整处理管线 - 包含所有处理阶段
    """
    processing_stages = ["tts"]
    
    try:
        # 按需加载服务
        services = await load_required_services(request)
        
        # 转换为内部Sentence对象
        sentences = []
        for req in request.sentences:
            sentence = create_sentence_from_request(req)
            if request.task_id:
                sentence.task_id = request.task_id
            sentences.append(sentence)
        
        # 阶段1: TTS生成
        logger.info("完整模式 - 阶段1: TTS生成")
        tts_sentences = []
        async for batch in voice_synthesizer.generateVoices(sentences):
            tts_sentences.extend(batch)
        
        # 阶段2: 时长对齐（如需要）
        if request.enable_duration_align and 'duration_aligner' in services:
            logger.info("完整模式 - 阶段2: 时长对齐")
            tts_sentences = await services['duration_aligner'](tts_sentences)
            processing_stages.append("duration_align")
        
        # 阶段3: 时间戳校准（如需要）
        if request.enable_timestamp_adjust and 'timestamp_adjuster' in services:
            logger.info("完整模式 - 阶段3: 时间戳校准")
            tts_sentences = await services['timestamp_adjuster'](tts_sentences, config.tts.target_sample_rate)
            processing_stages.append("timestamp_adjust")
        
        # 阶段4: 媒体合成（如需要）
        media_output = None
        if request.enable_media_mix and request.video_path and 'media_mixer' in services:
            logger.info("完整模式 - 阶段4: 媒体合成")
            media_output = await services['media_mixer'].mix_media(
                tts_sentences, 
                request.video_path,
                request.audio_path
            )
            processing_stages.append("media_mix")
        
        # 阶段5: HLS生成（如需要）
        hls_url = None
        if request.enable_hls and media_output and 'hls_manager' in services:
            logger.info("完整模式 - 阶段5: HLS生成")
            hls_url = await services['hls_manager'].generate_hls(
                media_output,
                request.task_id
            )
            processing_stages.append("hls_generation")
        
        # 构建结果
        results = []
        for sentence in tts_sentences:
            result = SynthesisResult(
                sequence=sentence.sequence,
                audioKey=getattr(sentence, 'tts_audio_path', ''),
                durationMs=int(getattr(sentence, 'duration', 0)),
                success=True
            )
            results.append(result)
        
        logger.info(f"完整模式完成，处理阶段: {processing_stages}")
        
        return SynthesisResponse(
            success=True,
            results=results,
            processing_stages=processing_stages,
            output_url=hls_url,
            task_id=request.task_id
        )
        
    except Exception as e:
        logger.error(f"完整模式处理失败: {e}")
        raise

async def load_required_services(request: SynthesisRequest) -> Dict:
    """
    按需加载服务 - 延迟初始化
    """
    global extended_services
    services = {}
    
    if request.enable_duration_align:
        if 'duration_aligner' not in extended_services:
            logger.info("加载时长对齐服务...")
            from core.timeadjust.duration_aligner import DurationAligner
            extended_services['duration_aligner'] = DurationAligner()
        services['duration_aligner'] = extended_services['duration_aligner']
    
    if request.enable_timestamp_adjust:
        if 'timestamp_adjuster' not in extended_services:
            logger.info("加载时间戳调整服务...")
            from core.timeadjust.timestamp_adjuster import TimestampAdjuster
            extended_services['timestamp_adjuster'] = TimestampAdjuster()
        services['timestamp_adjuster'] = extended_services['timestamp_adjuster']
    
    if request.enable_media_mix:
        if 'media_mixer' not in extended_services:
            logger.info("加载媒体混合服务...")
            from core.media_mixer import MediaMixer
            extended_services['media_mixer'] = MediaMixer()
        services['media_mixer'] = extended_services['media_mixer']
    
    if request.enable_hls:
        if 'hls_manager' not in extended_services:
            logger.info("加载HLS生成服务...")
            from core.hls_manager import HLSManager
            extended_services['hls_manager'] = HLSManager()
        services['hls_manager'] = extended_services['hls_manager']
    
    return services

@app.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "tts-synthesis-engine",
        "version": "3.0.0",
        "mode": "dual",  # 双模式
        "batch_size": config.tts.batch_size if config else 3,
        "loaded_services": list(extended_services.keys())  # 已加载的扩展服务
    }

@app.get("/task/{task_id}/status")
async def get_task_status(task_id: str):
    """
    获取任务状态（用于完整模式）
    """
    # 这里可以集成任务状态查询逻辑
    return {
        "task_id": task_id,
        "status": "processing",
        "message": "任务状态查询功能待实现"
    }

# ================================
# 辅助函数
# ================================

def create_sentence_from_request(req: SentenceRequest) -> Sentence:
    """从请求创建Sentence对象"""
    return Sentence(
        original_text=req.text,
        translated_text=req.text,
        sequence=req.sequence,
        audio=req.audioSample,  # 用作语音克隆样本
        speaker=req.speaker,
        start_ms=req.startMs,
        end_ms=req.endMs,
        target_duration=req.endMs - req.startMs
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
    
    logger.info(f"启动TTS合成引擎v3.0: {host}:{port}")
    logger.info("双模式架构：simple（默认）| full（完整处理）")
    
    uvicorn.run(
        "synthesizer:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )