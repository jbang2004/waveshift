#!/usr/bin/env python3
"""
降噪服务器 - 处理音频降噪请求
基于 ZipEnhancer 模型的流式音频降噪服务
🔧 优化版：懒加载模型，快速启动，避免容器超时
"""

from fastapi import FastAPI, Response, Header, HTTPException
from fastapi.responses import JSONResponse
import io
import numpy as np
import soundfile as sf
import torch
import gc
import os
import time
from typing import Optional
from zipenhancer_streaming import StreamingZipEnhancer, streaming_denoise
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 设置PyTorch线程数限制（容器环境优化）
torch.set_num_threads(2)  # 减少线程数以节省内存

# 创建FastAPI应用
app = FastAPI(
    title="ZipEnhancer Denoise Service", 
    version="2.0.0",
    description="快速启动的音频降噪服务 - 懒加载模型"
)

# 全局降噪器实例（懒加载）
global_enhancer = None
model_loading = False

def get_enhancer():
    """懒加载：获取或创建降噪器实例"""
    global global_enhancer, model_loading
    
    if global_enhancer is None and not model_loading:
        model_loading = True
        try:
            model_path = './speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx'
            if not os.path.exists(model_path):
                raise RuntimeError(f"模型文件不存在: {model_path}")
            
            logger.info(f"🔄 懒加载降噪模型: {model_path}")
            start_time = time.time()
            
            global_enhancer = StreamingZipEnhancer(
                onnx_model_path=model_path,
                chunk_duration=1.0,  # 1秒块处理
                overlap_duration=0.5  # 0.5秒重叠
            )
            
            load_time = time.time() - start_time
            logger.info(f"✅ 降噪模型加载完成，耗时: {load_time:.2f}s")
            
        except Exception as e:
            logger.error(f"❌ 模型加载失败: {e}")
            global_enhancer = None
            raise
        finally:
            model_loading = False
    
    return global_enhancer

@app.get("/")
async def root():
    """快速健康检查端点（无模型加载）"""
    return {
        "status": "healthy",
        "service": "denoise-container",
        "version": "2.0.0",
        "model": "zipenhancer_16k_base",
        "features": ["streaming", "real-time", "memory-efficient", "lazy-loading"],
        "model_loaded": global_enhancer is not None,
        "ready_for_processing": True
    }

@app.get("/health")
async def health_check():
    """详细健康检查（可选加载模型）"""
    global model_loading
    
    return {
        "status": "healthy",
        "service_ready": True,
        "model_loaded": global_enhancer is not None,
        "model_loading": model_loading,
        "memory_usage_mb": 0,  # 简化内存检查避免GPU依赖
        "timestamp": time.time(),
        "torch_threads": torch.get_num_threads()
    }

@app.post("/")
async def denoise_audio(
    audio_data: bytes,
    x_segment_id: Optional[str] = Header(None),
    x_speaker: Optional[str] = Header(None),
    x_enable_streaming: Optional[str] = Header("true")
):
    """
    处理音频降噪请求
    
    Args:
        audio_data: WAV格式的音频二进制数据
        x_segment_id: 音频片段ID（用于日志）
        x_speaker: 说话人标识（用于日志）
        x_enable_streaming: 是否启用流式处理
    
    Returns:
        降噪后的WAV音频数据
    """
    start_time = time.time()
    segment_id = x_segment_id or "unknown"
    speaker = x_speaker or "unknown"
    enable_streaming = x_enable_streaming.lower() == "true"
    
    logger.info(f"🎵 处理降噪请求: segment={segment_id}, speaker={speaker}, size={len(audio_data)} bytes")
    
    try:
        # 1. 从二进制数据读取音频
        audio, sr = sf.read(io.BytesIO(audio_data))
        logger.info(f"音频加载成功: shape={audio.shape}, sr={sr}")
        
        # 2. 验证采样率 (audio-segment-container已确保16kHz输出)
        if sr != 16000:
            logger.error(f"❌ 采样率错误: {sr}Hz, 预期16kHz")
            raise ValueError(f"音频采样率必须为16kHz，实际为{sr}Hz。请检查audio-segment-container配置。")
        
        logger.info(f"✅ 采样率验证通过: {sr}Hz")
        
        # 3. 获取降噪器并处理
        try:
            enhancer = get_enhancer()
            if enhancer is None:
                raise RuntimeError("降噪模型未能成功加载")
                
        except Exception as model_error:
            logger.error(f"❌ 模型加载失败: {model_error}")
            return Response(
                content=f"模型加载失败: {model_error}",
                status_code=503,
                headers={
                    "X-Processing-Success": "false",
                    "X-Segment-Id": segment_id,
                    "X-Error": f"Model loading failed: {model_error}"
                }
            )
        
        # 4. 执行降噪处理
        try:
            if enable_streaming:
                # 流式处理（内存效率高）
                enhanced_chunks = []
                for chunk in enhancer.stream_process(audio):
                    enhanced_chunks.append(chunk)
                enhanced_audio = np.concatenate(enhanced_chunks)
                logger.info(f"流式降噪完成: {len(enhanced_chunks)} chunks")
            else:
                # 一次性处理（适合短音频）
                enhanced_audio = enhancer.process(audio)
                logger.info("单次降噪完成")
                
        except Exception as processing_error:
            logger.error(f"❌ 音频处理失败: {processing_error}")
            return Response(
                content=f"音频处理失败: {processing_error}",
                status_code=500,
                headers={
                    "X-Processing-Success": "false",
                    "X-Segment-Id": segment_id,
                    "X-Error": f"Audio processing failed: {processing_error}"
                }
            )
        
        # 5. 确保输出范围正确
        enhanced_audio = np.clip(enhanced_audio, -1.0, 1.0)
        
        # 6. 转换回WAV二进制
        output_buffer = io.BytesIO()
        sf.write(output_buffer, enhanced_audio, sr, format='WAV', subtype='PCM_16')
        output_buffer.seek(0)
        
        # 7. 准备响应
        output_data = output_buffer.read()
        process_time = time.time() - start_time
        
        logger.info(f"✅ 降噪完成: segment={segment_id}, "
                   f"输入={len(audio_data)} bytes, "
                   f"输出={len(output_data)} bytes, "
                   f"耗时={process_time:.2f}s")
        
        # 8. 清理内存
        del audio
        del enhanced_audio
        gc.collect()
        
        return Response(
            content=output_data,
            media_type="audio/wav",
            headers={
                "X-Processing-Success": "true",
                "X-Segment-Id": segment_id,
                "X-Processing-Time": f"{process_time:.3f}",
                "X-Input-Size": str(len(audio_data)),
                "X-Output-Size": str(len(output_data)),
                "X-Model-Loaded": "true"
            }
        )
        
    except Exception as e:
        logger.error(f"❌ 降噪失败: segment={segment_id}, error={e}")
        
        # 返回错误响应
        return Response(
            content=str(e),
            status_code=500,
            headers={
                "X-Processing-Success": "false",
                "X-Segment-Id": segment_id,
                "X-Error": str(e)
            }
        )

@app.post("/batch")
async def batch_denoise(
    # 预留批量处理接口，未来可能需要
):
    """批量降噪接口（预留）"""
    return {"error": "Batch processing not implemented yet"}

if __name__ == "__main__":
    import uvicorn
    # 启动服务器
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info",
        access_log=True
    )