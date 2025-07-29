#!/usr/bin/env python3
"""
降噪服务器 Alpine优化版 - 基于成功的音频处理服务器
渐进式添加降噪功能
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
import gc
from typing import Optional

# 延迟导入torch和onnxruntime，避免启动时崩溃
torch = None
onnxruntime = None
StreamingZipEnhancer = None

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

print(f"[STARTUP] Loading denoise server (Alpine optimized)...")
print(f"[STARTUP] Python {sys.version}")

# 创建FastAPI应用
app = FastAPI(
    title="ZipEnhancer Denoise Service (Alpine)", 
    version="3.0.0",
    description="音频降噪服务 - Alpine优化版"
)

# 全局降噪器实例（懒加载）
global_enhancer = None
model_loading = False
dependencies_loaded = False

def load_dependencies():
    """懒加载Python依赖"""
    global torch, onnxruntime, StreamingZipEnhancer, dependencies_loaded
    
    if dependencies_loaded:
        return True
    
    try:
        logger.info("🔄 加载深度学习依赖...")
        import torch as torch_module
        torch = torch_module
        torch.set_num_threads(2)  # 限制线程数
        
        import onnxruntime as ort_module
        onnxruntime = ort_module
        
        from zipenhancer_streaming import StreamingZipEnhancer as enhancer_class
        StreamingZipEnhancer = enhancer_class
        
        dependencies_loaded = True
        logger.info("✅ 依赖加载成功")
        return True
    except Exception as e:
        logger.error(f"❌ 依赖加载失败: {e}")
        return False

def get_enhancer():
    """懒加载降噪器实例"""
    global global_enhancer, model_loading
    
    if global_enhancer is not None:
        return global_enhancer
    
    if model_loading:
        return None
    
    # 确保依赖已加载
    if not load_dependencies():
        return None
    
    model_loading = True
    try:
        model_path = './speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx'
        if not os.path.exists(model_path):
            raise RuntimeError(f"模型文件不存在: {model_path}")
        
        logger.info(f"🔄 加载降噪模型: {model_path}")
        start_time = time.time()
        
        global_enhancer = StreamingZipEnhancer(
            onnx_model_path=model_path,
            chunk_duration=3.0,  # 🚀 增大chunk以减少推理次数 (1.0 → 3.0秒)
            overlap_duration=0.5  # 保持适当重叠确保质量
        )
        
        load_time = time.time() - start_time
        logger.info(f"✅ 降噪模型加载完成，耗时: {load_time:.2f}s")
        
        return global_enhancer
        
    except Exception as e:
        logger.error(f"❌ 模型加载失败: {e}")
        global_enhancer = None
        return None
    finally:
        model_loading = False

@app.get("/")
async def root():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "denoise-alpine",
        "version": "3.0.0",
        "features": ["streaming", "lazy-loading", "alpine-optimized"],
        "model_loaded": global_enhancer is not None,
        "dependencies_loaded": dependencies_loaded,
        "ready": True
    }

@app.get("/health")
async def health():
    """详细健康检查"""
    return {
        "status": "healthy",
        "service_ready": True,
        "model_loaded": global_enhancer is not None,
        "model_loading": model_loading,
        "dependencies": {
            "torch": dependencies_loaded,
            "onnxruntime": dependencies_loaded,
            "model": global_enhancer is not None
        },
        "timestamp": time.time()
    }

@app.post("/")
async def denoise_audio(
    request: Request,
    x_segment_id: Optional[str] = Header(None),
    x_speaker: Optional[str] = Header(None),
    x_enable_streaming: Optional[str] = Header("true")
):
    """处理音频降噪请求"""
    start_time = time.time()
    segment_id = x_segment_id or "unknown"
    speaker = x_speaker or "unknown"
    enable_streaming = x_enable_streaming.lower() == "true"
    
    # 🔧 修复：从请求体中读取原始二进制数据
    audio_data = await request.body()
    
    logger.info(f"🎵 处理降噪请求: segment={segment_id}, speaker={speaker}, size={len(audio_data)} bytes")
    
    # 🔧 修复：在try外初始化变量，避免作用域错误
    audio = None
    enhanced_audio = None
    
    try:
        # 1. 读取音频
        audio, sr = sf.read(io.BytesIO(audio_data))
        logger.info(f"音频加载成功: shape={audio.shape}, sr={sr}")
        
        # 2. 验证采样率
        if sr != 16000:
            logger.error(f"❌ 采样率错误: {sr}Hz, 预期16kHz")
            # 不降噪，直接返回原音频
            output_buffer = io.BytesIO()
            sf.write(output_buffer, audio, sr, format='WAV', subtype='PCM_16')
            output_buffer.seek(0)
            return Response(
                content=output_buffer.read(),
                media_type="audio/wav",
                headers={
                    "X-Processing-Success": "true",
                    "X-Segment-Id": segment_id,
                    "X-Denoise-Applied": "false",
                    "X-Reason": "sample-rate-mismatch"
                }
            )
        
        # 3. 尝试降噪
        try:
            enhancer = get_enhancer()
            if enhancer is None:
                logger.warning("⚠️ 降噪模型未加载，返回原始音频")
                enhanced_audio = audio
                denoise_applied = False
            else:
                # 执行降噪
                if enable_streaming:
                    enhanced_chunks = []
                    for chunk in enhancer.stream_process(audio):
                        enhanced_chunks.append(chunk)
                    enhanced_audio = np.concatenate(enhanced_chunks)
                    logger.info(f"流式降噪完成: {len(enhanced_chunks)} chunks")
                else:
                    enhanced_audio = enhancer.process(audio)
                    logger.info("单次降噪完成")
                denoise_applied = True
                
        except Exception as denoise_error:
            logger.error(f"❌ 降噪处理失败: {denoise_error}")
            enhanced_audio = audio
            denoise_applied = False
        
        # 4. 确保输出范围正确
        enhanced_audio = np.clip(enhanced_audio, -1.0, 1.0)
        
        # 5. 转换回WAV
        output_buffer = io.BytesIO()
        sf.write(output_buffer, enhanced_audio, sr, format='WAV', subtype='PCM_16')
        output_buffer.seek(0)
        
        # 6. 准备响应
        output_data = output_buffer.read()
        process_time = time.time() - start_time
        
        logger.info(f"✅ 处理完成: segment={segment_id}, "
                   f"降噪={'是' if denoise_applied else '否'}, "
                   f"耗时={process_time:.2f}s")
        
        # 7. 清理内存
        try:
            if 'audio' in locals() and audio is not None:
                del audio
        except:
            pass
        try:
            if 'enhanced_audio' in locals() and enhanced_audio is not None:
                del enhanced_audio
        except:
            pass
        gc.collect()
        
        return Response(
            content=output_data,
            media_type="audio/wav",
            headers={
                "X-Processing-Success": "true",
                "X-Segment-Id": segment_id,
                "X-Processing-Time": f"{process_time:.3f}",
                "X-Denoise-Applied": str(denoise_applied).lower(),
                "X-Model-Loaded": str(global_enhancer is not None).lower()
            }
        )
        
    except Exception as e:
        logger.error(f"❌ 请求处理失败: segment={segment_id}, error={e}")
        
        # 🔧 异常情况下也清理内存
        try:
            if 'audio' in locals() and audio is not None:
                del audio
        except:
            pass
        try:
            if 'enhanced_audio' in locals() and enhanced_audio is not None:
                del enhanced_audio
        except:
            pass
        gc.collect()
        
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
    print("[STARTUP] Starting denoise server (Alpine optimized)...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )