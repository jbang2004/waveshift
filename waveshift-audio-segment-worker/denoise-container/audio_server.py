#!/usr/bin/env python3
"""
音频处理服务器 - 带音频处理功能的中间版本
先验证音频读写功能，再添加降噪
"""

from fastapi import FastAPI, Response, Header, HTTPException, Request
from fastapi.responses import JSONResponse
import io
import numpy as np
import soundfile as sf
import time
import logging
import sys
import os
from typing import Optional

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print(f"[STARTUP] Loading audio processing server...")
print(f"[STARTUP] Python {sys.version}")

# 创建FastAPI应用
app = FastAPI(
    title="Audio Processing Service", 
    version="2.0.0",
    description="音频处理服务 - Alpine优化版（无降噪）"
)

@app.get("/")
async def root():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "audio-processing-alpine",
        "version": "2.0.0",
        "features": ["audio-passthrough", "wav-processing"],
        "dependencies": {
            "fastapi": "loaded",
            "numpy": "loaded",
            "soundfile": "loaded"
        },
        "timestamp": time.time()
    }

@app.get("/health")
async def health():
    """详细健康检查"""
    return {
        "status": "healthy",
        "ready": True,
        "audio_processing": "ready",
        "denoise": "disabled"  # 暂时禁用降噪
    }

@app.post("/")
async def process_audio(
    request: Request,
    x_segment_id: Optional[str] = Header(None),
    x_speaker: Optional[str] = Header(None)
):
    """
    音频处理端点 - 当前只做音频传递，验证读写功能
    """
    start_time = time.time()
    segment_id = x_segment_id or "unknown"
    speaker = x_speaker or "unknown"
    
    # 🔧 修复：从请求体中读取原始二进制数据
    audio_data = await request.body()
    
    logger.info(f"🎵 处理音频请求: segment={segment_id}, speaker={speaker}, size={len(audio_data)} bytes")
    
    try:
        # 1. 从二进制数据读取音频
        audio, sr = sf.read(io.BytesIO(audio_data))
        logger.info(f"✅ 音频加载成功: shape={audio.shape}, sr={sr}Hz")
        
        # 2. 验证采样率
        if sr != 16000:
            logger.warning(f"⚠️ 采样率不是16kHz: {sr}Hz")
        
        # 3. 当前只做音频传递（不做降噪）
        processed_audio = audio
        logger.info(f"📊 音频传递: 输入{len(audio)}样本 → 输出{len(processed_audio)}样本")
        
        # 4. 确保输出范围正确
        processed_audio = np.clip(processed_audio, -1.0, 1.0)
        
        # 5. 转换回WAV二进制
        output_buffer = io.BytesIO()
        sf.write(output_buffer, processed_audio, sr, format='WAV', subtype='PCM_16')
        output_buffer.seek(0)
        
        # 6. 准备响应
        output_data = output_buffer.read()
        process_time = time.time() - start_time
        
        logger.info(f"✅ 音频处理完成: segment={segment_id}, "
                   f"输入={len(audio_data)} bytes, "
                   f"输出={len(output_data)} bytes, "
                   f"耗时={process_time:.2f}s")
        
        return Response(
            content=output_data,
            media_type="audio/wav",
            headers={
                "X-Processing-Success": "true",
                "X-Segment-Id": segment_id,
                "X-Processing-Time": f"{process_time:.3f}",
                "X-Denoise-Applied": "false",  # 明确标记未降噪
                "X-Audio-Duration": f"{len(audio)/sr:.3f}"
            }
        )
        
    except Exception as e:
        logger.error(f"❌ 音频处理失败: segment={segment_id}, error={e}")
        
        return Response(
            content=str(e),
            status_code=500,
            headers={
                "X-Processing-Success": "false",
                "X-Segment-Id": segment_id,
                "X-Error": str(e)
            }
        )

if __name__ == "__main__":
    import uvicorn
    print("[STARTUP] Starting audio processing server on Alpine Linux...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )