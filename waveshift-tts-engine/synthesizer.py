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
from core.audio_sample_manager import get_audio_sample_manager
from core.task_context_manager import get_task_context_manager, TaskMediaContext
from utils.path_manager import PathManager
from config import get_config

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ================================
# 请求/响应模型
# ================================

# 新增：任务初始化请求模型
class TaskInitRequest(BaseModel):
    """任务初始化请求"""
    user_id: str
    audio_url: str
    video_url: str
    enable_audio_separation: bool = True
    processing_options: Dict[str, Any] = {}

class TaskInitResponse(BaseModel):
    """任务初始化响应"""
    success: bool
    message: str
    task_id: str
    local_audio_path: Optional[str] = None
    local_video_path: Optional[str] = None
    has_separated_audio: bool = False
    error: Optional[str] = None

class SentenceRequest(BaseModel):
    """单句合成请求"""
    sequence: int
    text: str
    audioSample: Optional[str] = None  # R2 key for voice cloning (可选)
    speaker: str
    startMs: int
    endMs: int

class SynthesisRequest(BaseModel):
    """批量合成请求 - 支持双模式"""
    sentences: List[SentenceRequest]
    settings: Dict[str, Any] = {}

    # 处理模式选择（必填）
    mode: str  # simple | full

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
    title="WaveShift TTS Synthesis Engine v4.0",
    description="智能任务上下文管理的TTS引擎：支持任务级媒体资源管理",
    version="4.0.0"
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
task_context_manager = get_task_context_manager()

# ================================
# 任务管理API接口 (新增)
# ================================

@app.post("/tasks/{task_id}/initialize", response_model=TaskInitResponse)
async def initialize_task(task_id: str, request: TaskInitRequest):
    """
    初始化任务上下文 - 下载和准备媒体资源
    这是任务开始时的一次性操作
    """
    logger.info(f"[{task_id}] 收到任务初始化请求")
    logger.info(f"  - 用户ID: {request.user_id}")
    logger.info(f"  - 音频URL: {request.audio_url}")
    logger.info(f"  - 视频URL: {request.video_url}")
    
    try:
        # 调用任务上下文管理器初始化
        result = await task_context_manager.initialize_task(
            task_id=task_id,
            user_id=request.user_id,
            audio_url=request.audio_url,
            video_url=request.video_url
        )
        
        if result["success"]:
            return TaskInitResponse(
                success=True,
                message=result["message"],
                task_id=task_id,
                local_audio_path=result.get("local_audio_path"),
                local_video_path=result.get("local_video_path"),
                has_separated_audio=result.get("has_separated_audio", False)
            )
        else:
            raise HTTPException(
                status_code=500,
                detail=f"任务初始化失败: {result.get('error', '未知错误')}"
            )
            
    except Exception as e:
        logger.error(f"[{task_id}] 任务初始化异常: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"任务初始化异常: {str(e)}"
        )

@app.post("/tasks/{task_id}/synthesize")
async def synthesize_task_batch(task_id: str, request: SynthesisRequest):
    """
    任务级批次合成 - 使用已初始化的媒体上下文
    这是流式处理中的高频调用接口
    """
    logger.info(f"[{task_id}] 收到批次合成请求: {len(request.sentences)} 个句子")
    
    try:
        # 获取任务上下文
        context = task_context_manager.get_context(task_id)
        path_manager = task_context_manager.get_path_manager(task_id)
        
        if not context or not context.initialized:
            raise HTTPException(
                status_code=404,
                detail=f"任务 {task_id} 未初始化或不存在，请先调用初始化接口"
            )
        
        # 设置请求参数以使用任务上下文
        enhanced_request = request.copy()
        enhanced_request.task_id = task_id
        
        # 如果任务有媒体上下文，自动启用完整处理模式
        if context.local_audio_path and context.local_video_path:
            enhanced_request.mode = "full"
            enhanced_request.enable_media_mix = True
            enhanced_request.audio_path = context.local_audio_path
            enhanced_request.video_path = context.local_video_path
            logger.info(f"[{task_id}] 使用完整处理模式，包含媒体混合")
        else:
            enhanced_request.mode = "simple"
            logger.info(f"[{task_id}] 使用简单处理模式")
        
        # 调用现有的合成处理逻辑
        if enhanced_request.mode == "simple":
            return await simple_tts_pipeline(enhanced_request)
        else:
            return await full_processing_pipeline_with_context(enhanced_request, path_manager)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[{task_id}] 批次合成异常: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"批次合成失败: {str(e)}"
        )

@app.delete("/tasks/{task_id}")
async def cleanup_task(task_id: str):
    """
    清理任务资源 - 任务完成后的资源清理
    """
    logger.info(f"[{task_id}] 收到任务清理请求")
    
    try:
        result = await task_context_manager.cleanup_task(task_id)
        return result
    except Exception as e:
        logger.error(f"[{task_id}] 任务清理异常: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"任务清理失败: {str(e)}"
        )

@app.get("/tasks/{task_id}/status")
async def get_task_status(task_id: str):
    """获取任务状态"""
    context = task_context_manager.get_context(task_id)
    
    if not context:
        raise HTTPException(
            status_code=404,
            detail=f"任务 {task_id} 不存在"
        )
    
    return {
        "task_id": task_id,
        "user_id": context.user_id,
        "initialized": context.initialized,
        "created_at": context.created_at,
        "has_local_audio": bool(context.local_audio_path),
        "has_local_video": bool(context.local_video_path),
        "has_separated_audio": bool(context.vocals_path),
        "error": context.error
    }

# ================================
# 核心API接口 (现有，保持兼容)
# ================================

@app.on_event("startup")
async def startup_event():
    """应用启动初始化"""
    global voice_synthesizer
    try:
        voice_synthesizer = VoiceSynthesizer(config)
        logger.info(f"语音合成引擎初始化完成，batch_size={config.tts.batch_size}")
        logger.info("任务上下文管理架构就绪：支持任务级媒体资源管理")
    except Exception as e:
        logger.error(f"语音合成引擎初始化失败: {e}")
        raise

@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭清理"""
    try:
        # 清理任务上下文管理器
        await task_context_manager.cleanup_all()
        logger.info("应用关闭清理完成")
    except Exception as e:
        logger.error(f"应用关闭清理异常: {e}")

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
        # 转换为内部Sentence对象（异步下载音频样本）
        sentences = []
        for req in request.sentences:
            sentence = await create_sentence_from_request(req)
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
        
        # 转换为内部Sentence对象（异步下载音频样本）
        sentences = []
        for req in request.sentences:
            sentence = await create_sentence_from_request(req)
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

async def full_processing_pipeline_with_context(request: SynthesisRequest, path_manager: PathManager) -> SynthesisResponse:
    """
    完整处理管道 - 使用任务上下文
    这是新的优化版本，使用预初始化的媒体资源
    """
    try:
        logger.info(f"任务上下文完整模式 - 开始处理 {len(request.sentences)} 个句子")
        
        # 转换请求为内部句子对象
        tts_sentences = []
        for req_sentence in request.sentences:
            sentence = await create_sentence_from_request(req_sentence)
            tts_sentences.append(sentence)
        
        # 延迟加载扩展服务
        services = await load_required_services(request)
        
        # 阶段1: TTS合成
        if voice_synthesizer:
            # 使用 VoiceSynthesizer 的正确方法名（camelCase）
            tts_sentences = await voice_synthesizer.synthesizeBatch(tts_sentences)
        else:
            raise RuntimeError("语音合成器未初始化")
        
        processing_stages = ["tts_synthesis"]
        
        # 阶段2: 时长对齐（如需要）
        if request.enable_duration_align and 'duration_aligner' in services:
            logger.info("任务上下文完整模式 - 阶段2: 时长对齐")
            tts_sentences = await services['duration_aligner'].align_batch(tts_sentences)
            processing_stages.append("duration_alignment")
        
        # 阶段3: 时间戳调整（如需要）
        if request.enable_timestamp_adjust and 'timestamp_adjuster' in services:
            logger.info("任务上下文完整模式 - 阶段3: 时间戳调整")
            tts_sentences = await services['timestamp_adjuster'].adjust_batch(tts_sentences)
            processing_stages.append("timestamp_adjustment")
        
        # 阶段4: 媒体合成（使用预初始化的路径管理器）
        media_output = None
        if request.enable_media_mix and 'media_mixer' in services:
            logger.info("任务上下文完整模式 - 阶段4: 媒体合成")
            media_output = await services['media_mixer'].mix_media(
                tts_sentences, 
                path_manager,  # 使用任务上下文的路径管理器
                0,  # batch_counter
                request.task_id or "default"
            )
            processing_stages.append("media_mix")
        
        # 阶段5: HLS生成（如需要）
        hls_url = None
        if request.enable_hls and media_output and 'hls_manager' in services:
            logger.info("任务上下文完整模式 - 阶段5: HLS生成")
            hls_url = await services['hls_manager'].generate_hls(
                media_output,
                request.task_id or "default"
            )
            processing_stages.append("hls_generation")
        
        # 构建结果
        results = []
        for sentence in tts_sentences:
            result = SynthesisResult(
                sequence=sentence.sequence,
                audioKey=getattr(sentence, 'tts_audio_path', ''),
                durationMs=int(getattr(sentence, 'duration', 0) * 1000),
                success=True
            )
            results.append(result)
        
        logger.info(f"任务上下文完整模式完成，处理阶段: {processing_stages}")
        
        return SynthesisResponse(
            success=True,
            results=results,
            processing_stages=processing_stages,
            output_url=hls_url,
            task_id=request.task_id
        )
        
    except Exception as e:
        logger.error(f"任务上下文完整模式处理失败: {e}")
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
            # 传入共享的voice_synthesizer实例，避免循环依赖
            extended_services['duration_aligner'] = DurationAligner(
                voice_synthesizer=voice_synthesizer
            )
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

async def create_sentence_from_request(req: SentenceRequest) -> Sentence:
    """
    从请求创建Sentence对象
    自动处理音频样本的下载（从URL到本地路径）
    """
    # 下载音频样本到本地（如果是URL）
    local_audio_path = req.audioSample
    if req.audioSample and req.audioSample.strip():
        try:
            audio_manager = get_audio_sample_manager()
            local_audio_path = await audio_manager.get_local_path(req.audioSample)
            logger.info(f"音频样本下载成功: {req.audioSample} -> {local_audio_path}")
        except Exception as e:
            logger.error(f"下载音频样本失败: {req.audioSample}, 错误: {e}")
            # 继续处理，但没有音频样本（将使用默认语音）
            local_audio_path = None
    
    return Sentence(
        original_text=req.text,
        translated_text=req.text,
        sequence=req.sequence,
        audio=local_audio_path,  # 使用本地路径
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