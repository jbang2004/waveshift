import logging
import asyncio
import os
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Body
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_config
from utils.async_utils import BackgroundTaskManager
from core.tts_streaming_watcher import StreamingSentenceRequest, StreamingSentenceResponse

# API模型定义
class ProcessSentenceRequest(BaseModel):
    """处理单句TTS请求模型"""
    transcription_id: str
    sequence: int
    translation_text: str
    speaker_audio_key: str
    output_prefix: str
    voice_settings: Optional[Dict[str, Any]] = None

class WatchTTSRequest(BaseModel):
    """监听TTS处理请求模型"""
    transcription_id: str
    output_prefix: str
    voice_settings: Optional[Dict[str, Any]] = None

# 获取配置
config = get_config()
logger = logging.getLogger(__name__)

app = FastAPI(
    debug=True, 
    title="WaveShift TTS Engine API", 
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局服务字典 - 简化的服务访问
services = {}
task_manager = None
initialized = False


def set_services(services_dict: Dict[str, Any]):
    """设置全局服务字典 - 消除复杂的依赖注入"""
    global services, task_manager, initialized
    services = services_dict
    task_manager = BackgroundTaskManager()
    initialized = True
    logger.info("API全局服务已设置")


def get_service(name: str):
    """简单的服务获取函数"""
    if not initialized:
        raise HTTPException(status_code=500, detail="服务未初始化")
    
    service = services.get(name)
    if service is None:
        raise HTTPException(status_code=500, detail=f"服务 {name} 未找到")
    
    return service


# 应用生命周期事件
@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    logger.info("WaveShift TTS Engine API 启动中...")


@app.on_event("shutdown")
async def shutdown_event():
    """应用关闭事件"""
    logger.info("WaveShift TTS Engine API 关闭中...")
    if task_manager:
        await task_manager.close()
        logger.info("任务管理器已关闭")


@app.post("/api/start_tts")
async def start_tts(task_id: str = Body(..., embed=True)):
    """
    启动TTS合成流程 - 简化版本，直接访问服务
    """
    try:
        # 直接获取服务，无需复杂的依赖注入
        orchestrator = get_service('orchestrator')
        d1_client = get_service('d1_client')
        
        # TTS任务错误处理器 - 统一状态更新由orchestrator负责
        async def tts_error_handler(e: Exception):
            logger.error(f"TTS流水线执行失败 [任务ID: {task_id}]: {e}", exc_info=True)
        
        # 创建后台任务
        task_manager.create_task(
            orchestrator.run_complete_tts_pipeline(task_id),
            name=f"tts_pipeline_{task_id}",
            error_handler=tts_error_handler
        )
        
        return JSONResponse(content={
            'status': 'processing', 
            'task_id': task_id, 
            'message': 'TTS合成流程已开始'
        })
        
    except Exception as e:
        logger.error(f"启动TTS失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"启动TTS失败: {e}")


@app.get("/api/task/{task_id}/status")
async def get_task_status(task_id: str):
    """获取任务状态和HLS播放列表URL"""
    try:
        orchestrator = get_service('orchestrator')
        
        # 通过编排器获取任务状态
        status_result = await orchestrator.get_task_status(task_id)
        
        if status_result["status"] != "success":
            raise HTTPException(status_code=404, detail=status_result.get("message", "任务不存在"))
        
        return JSONResponse(content={
            'task_id': task_id,
            'status': status_result.get('task_status'),
            'hls_playlist_url': status_result.get('hls_playlist_url'),
            'error_message': status_result.get('error_message')
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取任务状态失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取任务状态失败: {e}")


@app.post("/api/task")
async def create_task(request: Dict[str, Any] = Body(...)):
    """
    创建新任务（可选接口，用于外部系统集成）
    """
    try:
        required_fields = ['video_id', 'audio_path_r2', 'video_path_r2']
        for field in required_fields:
            if field not in request:
                raise HTTPException(status_code=400, detail=f"缺少必需字段: {field}")
        
        return JSONResponse(content={
            'status': 'created',
            'message': '任务创建成功，请使用/api/start_tts启动TTS处理'
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建任务失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"创建任务失败: {e}")


@app.post("/api/process_streaming_sentence")
async def process_streaming_sentence(request: ProcessSentenceRequest):
    """
    处理单个句子的流式TTS生成
    与audio-segment-worker流式协作的核心接口
    """
    try:
        tts_watcher = get_service('tts_streaming_watcher')
        
        # 转换为内部请求格式
        streaming_request = StreamingSentenceRequest(
            transcription_id=request.transcription_id,
            sequence=request.sequence,
            translation_text=request.translation_text,
            speaker_audio_key=request.speaker_audio_key,
            output_prefix=request.output_prefix,
            voice_settings=request.voice_settings
        )
        
        # 处理单句TTS
        result = await tts_watcher.process_streaming_sentence(streaming_request)
        
        return JSONResponse(content={
            'success': result.success,
            'tts_audio_key': result.tts_audio_key,
            'duration_ms': result.duration_ms,
            'processing_time_ms': result.processing_time_ms,
            'error_message': result.error_message,
            'transcription_id': request.transcription_id,
            'sequence': request.sequence
        })
        
    except Exception as e:
        logger.error(f"流式句子TTS处理失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"流式句子TTS处理失败: {e}")


@app.post("/api/watch_and_process_tts")
async def watch_and_process_tts(request: WatchTTSRequest):
    """
    流式监听音频切分完成并处理TTS生成
    这是与audio-segment-worker协作的主要接口
    """
    try:
        tts_watcher = get_service('tts_streaming_watcher')
        
        # 创建后台任务进行流式监听
        async def tts_streaming_handler():
            return await tts_watcher.watch_and_process_tts(
                transcription_id=request.transcription_id,
                output_prefix=request.output_prefix,
                voice_settings=request.voice_settings
            )
        
        # 启动后台任务
        task_manager.create_task(
            tts_streaming_handler(),
            name=f"tts_streaming_{request.transcription_id}",
            error_handler=lambda e: logger.error(f"TTS流式处理异常: {e}")
        )
        
        return JSONResponse(content={
            'status': 'streaming',
            'message': 'TTS流式监听已启动',
            'transcription_id': request.transcription_id,
            'output_prefix': request.output_prefix
        })
        
    except Exception as e:
        logger.error(f"启动TTS流式监听失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"启动TTS流式监听失败: {e}")


@app.get("/api/health")
async def health_check():
    """健康检查接口 - 简化版本"""
    try:
        # 简单检查服务状态
        services_status = {}
        if services:
            for name, service in services.items():
                services_status[name] = service is not None
        
        return JSONResponse(content={
            'status': 'healthy',
            'services': services_status,
            'timestamp': asyncio.get_event_loop().time(),
            'version': '2.0.0'
        })
        
    except Exception as e:
        logger.error(f"健康检查失败: {e}")
        raise HTTPException(status_code=503, detail=f"服务不健康: {e}")


@app.get("/")
async def root():
    """根路径"""
    return JSONResponse(content={
        'name': 'WaveShift TTS Engine',
        'version': '2.0.0',
        'description': '基于IndexTTS的语音合成引擎',
        'endpoints': {
            'start_tts': 'POST /api/start_tts',
            'task_status': 'GET /api/task/{task_id}/status', 
            'create_task': 'POST /api/task',
            'process_streaming_sentence': 'POST /api/process_streaming_sentence',
            'watch_and_process_tts': 'POST /api/watch_and_process_tts',
            'health': 'GET /api/health',
            'debug': 'GET /api/debug/{task_id}'
        }
    })


@app.get("/api/debug/{task_id}")
async def debug_task_data(task_id: str):
    """调试接口：查看任务数据"""
    try:
        d1_client = get_service('d1_client')
        
        sentences = await d1_client.get_transcription_segments_from_worker(task_id)
        media_paths = await d1_client.get_worker_media_paths(task_id)
        
        return JSONResponse(content={
            'task_id': task_id,
            'segments_count': len(sentences),
            'media_paths': media_paths,
            'first_segment': {
                'sequence': sentences[0].sequence if sentences else None,
                'speaker': sentences[0].speaker if sentences else None,
                'start_ms': sentences[0].start_ms if sentences else None,
                'end_ms': sentences[0].end_ms if sentences else None,
                'original_text': sentences[0].original_text[:50] if sentences else None,
                'translated_text': sentences[0].translated_text[:50] if sentences else None,
            } if sentences else None
        })
        
    except Exception as e:
        return JSONResponse(content={
            'error': str(e)
        }, status_code=500)


def run_server():
    """运行标准的FastAPI服务器"""
    uvicorn.run(
        app, 
        host=config.SERVER_HOST, 
        port=config.SERVER_PORT,
        log_level="info"
    )


if __name__ == "__main__":
    run_server()