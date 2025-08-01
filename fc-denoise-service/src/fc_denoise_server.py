#!/usr/bin/env python3
"""
FC降噪服务器 - 阿里云函数计算适配版 (简化版)
基于成功的Alpine优化降噪服务器，适配阿里云FC环境

🚀 FC 3.0优化特性:
- 懒加载模式: 避免启动超时问题
- 动态线程配置: 适配4vCPU环境变量
- 增强内存管理: 适配AI模型的内存清理
- FC生命周期管理: PreStop回调资源清理
- 性能监控: 冷热启动、模型复用统计

🔧 可配置环境变量:
- ORT_INTRA_OP_NUM_THREADS=3: ONNX内部并行线程数
- ORT_INTER_OP_NUM_THREADS=2: ONNX操作间并行线程数

📊 性能预期:
- 首次请求: ~15秒 (懒加载模式)
- 后续请求: 7-10秒 (模型复用)
- 实例复用率: >90% (在audio-segment流式场景中)
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
import base64
from typing import Optional

# 延迟导入torch和onnxruntime，避免启动时崩溃
torch = None
onnxruntime = None
StreamingZipEnhancer = None

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FC性能监控指标 (简化版)
fc_metrics = {
    'instance_start_time': time.time(),
    'cold_starts': 0,
    'warm_starts': 0,
    'model_reuse_count': 0,
    'total_requests': 0
}

print(f"[FC-STARTUP] Loading FC denoise server...")
print(f"[FC-STARTUP] Python {sys.version}")

# 创建FastAPI应用 - FC适配
app = FastAPI(
    title="FC ZipEnhancer Denoise Service", 
    version="1.0.0",
    description="阿里云FC降噪服务 - 基于ZipEnhancer的音频降噪"
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
        # ✅ 动态适配环境变量，消除线程配置冲突
        thread_count = int(os.getenv('ORT_INTRA_OP_NUM_THREADS', '3'))
        torch.set_num_threads(thread_count)
        logger.info(f"🔧 Torch线程配置: {thread_count} (动态适配环境变量)")
        
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
        model_path = './models/speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx'
        if not os.path.exists(model_path):
            raise RuntimeError(f"模型文件不存在: {model_path}")
        
        logger.info(f"🔄 加载降噪模型: {model_path}")
        start_time = time.time()
        
        global_enhancer = StreamingZipEnhancer(
            onnx_model_path=model_path,
            chunk_duration=0.5,  # 🔧 FC优化：0.5秒chunk
            overlap_duration=0.1  # 减少重叠降低计算量
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
    """根路径 - FC环境检查"""
    instance_uptime = time.time() - fc_metrics['instance_start_time']
    return {
        "status": "healthy",
        "service": "fc-denoise-service",
        "version": "1.0.0",
        "runtime": "aliyun-fc-3.0",
        "features": ["streaming", "lazy-loading", "fc-optimized"],
        "model_loaded": global_enhancer is not None,
        "dependencies_loaded": dependencies_loaded,
        "ready": True,
        "fc_metrics": {
            "instance_uptime_seconds": f"{instance_uptime:.1f}",
            "cold_starts": fc_metrics['cold_starts'],
            "warm_starts": fc_metrics['warm_starts'],
            "model_reuse_rate": f"{fc_metrics['model_reuse_count']}/{fc_metrics['total_requests']}",
            "performance_optimization": "懒加载 + 模型复用 (简化版)"
        }
    }

@app.get("/health")
async def health():
    """健康检查端点 - FC标准"""
    current_time = time.time()
    instance_uptime = current_time - fc_metrics['instance_start_time']
    
    # 预期首次请求延迟 (简化版)
    expected_first_request_latency = "~15秒 (懒加载模式)"
    
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
        "fc_optimization": {
            "expected_first_request_latency": expected_first_request_latency,
            "optimization_level": "Lazy Loading (简化版)"
        },
        "instance_info": {
            "uptime_seconds": f"{instance_uptime:.1f}",
            "total_requests": fc_metrics['total_requests'],
            "performance_stats": f"Cold: {fc_metrics['cold_starts']}, Warm: {fc_metrics['warm_starts']}"
        },
        "timestamp": current_time,
        "fc_environment": True
    }

@app.post("/")
async def denoise_audio(
    request: Request,
    x_segment_id: Optional[str] = Header(None),
    x_speaker: Optional[str] = Header(None),
    x_enable_streaming: Optional[str] = Header("true"),
    x_input_format: Optional[str] = Header("binary")  # 🆕 FC: 支持binary/base64
):
    """处理音频降噪请求 - FC适配版本"""
    start_time = time.time()
    segment_id = x_segment_id or f"fc_segment_{int(time.time())}"
    speaker = x_speaker or "unknown"
    enable_streaming = x_enable_streaming.lower() == "true"
    input_format = x_input_format or "binary"
    
    # FC监控：跟踪请求类型
    fc_metrics['total_requests'] += 1
    is_cold_start = global_enhancer is None
    if is_cold_start:
        fc_metrics['cold_starts'] += 1
        logger.info(f"❄️ FC冷启动请求: segment={segment_id}")
    else:
        fc_metrics['warm_starts'] += 1
        fc_metrics['model_reuse_count'] += 1
        logger.info(f"🔥 FC热启动请求: segment={segment_id} (模型复用第{fc_metrics['model_reuse_count']}次)")
    
    # 获取音频数据
    raw_data = await request.body()
    
    logger.info(f"🎵 FC降噪请求: segment={segment_id}, speaker={speaker}, size={len(raw_data)} bytes, format={input_format}")
    
    # 🆕 FC适配：支持Base64编码输入
    try:
        if input_format.lower() == "base64":
            audio_data = base64.b64decode(raw_data)
            logger.info(f"📥 Base64解码完成: {len(raw_data)} -> {len(audio_data)} bytes")
        else:
            audio_data = raw_data
            
    except Exception as e:
        logger.error(f"❌ 数据格式解析失败: {e}")
        return Response(
            content=f"数据格式错误: {e}",
            status_code=400,
            headers={
                "X-Processing-Success": "false",
                "X-Segment-Id": segment_id,
                "X-Error": "data_format_error"
            }
        )
    
    # 初始化变量
    audio = None
    enhanced_audio = None
    
    try:
        # 1. 读取音频
        audio, sr = sf.read(io.BytesIO(audio_data))
        logger.info(f"音频加载成功: shape={audio.shape}, sr={sr}")
        
        # 2. 验证采样率
        if sr != 16000:
            logger.warning(f"⚠️ 采样率不匹配: {sr}Hz, 预期16kHz，将直接返回原音频")
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
                    "X-Reason": "sample-rate-mismatch",
                    "X-FC-Environment": "true"
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
        
        logger.info(f"✅ FC处理完成: segment={segment_id}, "
                   f"降噪={'是' if denoise_applied else '否'}, "
                   f"耗时={process_time:.2f}s")
        
        # 7. 清理内存 - 使用增强版本
        enhanced_cleanup_memory(audio, enhanced_audio, 
                               force_gc=True,  # FC环境中强制GC
                               clear_torch_cache=False)  # 保留模型缓存供后续请求使用
        
        return Response(
            content=output_data,
            media_type="audio/wav",
            headers={
                "X-Processing-Success": "true",
                "X-Segment-Id": segment_id,
                "X-Processing-Time": f"{process_time:.3f}",
                "X-Denoise-Applied": str(denoise_applied).lower(),
                "X-Model-Loaded": str(global_enhancer is not None).lower(),
                "X-FC-Environment": "true",
                # FC特有监控头
                "X-FC-Instance-Type": "cold" if is_cold_start else "warm",
                "X-FC-Model-Reuse-Count": str(fc_metrics['model_reuse_count']),
                "X-FC-Instance-Uptime": f"{time.time() - fc_metrics['instance_start_time']:.1f}"
            }
        )
        
    except Exception as e:
        logger.error(f"❌ FC请求处理失败: segment={segment_id}, error={e}")
        
        # 异常情况下也清理内存
        enhanced_cleanup_memory(audio, enhanced_audio, 
                               force_gc=True,  # 异常时强制清理
                               clear_torch_cache=False)  # 保留模型供后续使用
        
        return Response(
            content=str(e),
            status_code=500,
            headers={
                "X-Processing-Success": "false",
                "X-Segment-Id": segment_id,
                "X-Error": str(e),
                "X-FC-Environment": "true"
            }
        )

def enhanced_cleanup_memory(*variables, force_gc=True, clear_torch_cache=False):
    """
    增强的内存清理，适配FC环境和深度学习模型
    
    Args:
        *variables: 要清理的变量
        force_gc: 是否强制执行垃圾回收
        clear_torch_cache: 是否清理Torch缓存
    """
    cleanup_start_time = time.time()
    cleanup_count = 0
    
    try:
        # 1. 清理普通变量
        for var in variables:
            if var is not None:
                try:
                    # 如果是Torch tensor，先detach
                    if hasattr(var, 'detach'):
                        var = var.detach()
                    # 如果是NumPy数组，显式释放
                    elif hasattr(var, 'dtype') and hasattr(var, 'shape'):
                        pass  # NumPy数组，直接删除
                    del var
                    cleanup_count += 1
                except Exception as e:
                    logger.debug(f"清理变量异常: {e}")
        
        # 2. 清理Torch缓存（可选）
        if clear_torch_cache and torch is not None:
            try:
                if hasattr(torch, 'cuda') and torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.debug("清理Torch GPU缓存")
                # 清理CPU缓存（如果有）
                if hasattr(torch, '_C') and hasattr(torch._C, '_cuda_emptyCache'):
                    pass  # 已经在上面处理
            except Exception as e:
                logger.debug(f"清理Torch缓存异常: {e}")
        
        # 3. 强制垃圾回收（可选）
        if force_gc:
            collected = gc.collect()
            logger.debug(f"垃圾回收对象数: {collected}")
        
        cleanup_time = time.time() - cleanup_start_time
        if cleanup_count > 0:
            logger.debug(f"内存清理完成: {cleanup_count}个变量, 耗时: {cleanup_time*1000:.1f}ms")
            
    except Exception as e:
        logger.warning(f"内存清理异常: {e}")

# 保持向后兼容，同时使用增强版本
def cleanup_memory(*variables):
    """向后兼容的内存清理函数"""
    enhanced_cleanup_memory(*variables, force_gc=True, clear_torch_cache=False)

# FC环境启动检查（简化版，无预热）
@app.on_event("startup")
async def startup_event():
    """FC环境启动检查 - 简化版，避免预热超时"""
    logger.info("🚀 FC降噪服务启动")
    logger.info(f"📊 环境信息:")
    logger.info(f"  - 运行时: 阿里云函数计算 3.0")
    logger.info(f"  - 监听端口: 9000")
    logger.info(f"  - 模型路径: ./models/speech_zipenhancer_ans_multiloss_16k_base/")
    logger.info(f"  - 特性: 懒加载 + 流式处理 + FC优化")
    logger.info(f"  - 首次请求预期延迟: ~15秒 (懒加载模式)")
    
    # 基础监控指标初始化 (简化版)
    logger.info("✅ FC降噪服务就绪，等待首次请求")

# 🗑️ FC PreStop回调 - 实例销毁前清理
@app.on_event("shutdown")
async def fc_prestop():
    """FC PreStop回调 - 实例销毁前清理，确保资源正常释放"""
    logger.info("🗑️ FC实例即将销毁，执行资源清理...")
    
    prestop_start_time = time.time()
    instance_lifetime = prestop_start_time - fc_metrics['instance_start_time']
    
    # 记录实例生命周期统计
    logger.info(f"📊 实例生命周期统计:")
    logger.info(f"  - 总运行时间: {instance_lifetime:.1f}秒")
    logger.info(f"  - 处理请求数: {fc_metrics['total_requests']}个")
    logger.info(f"  - 冷启动/热启动: {fc_metrics['cold_starts']}/{fc_metrics['warm_starts']}")
    logger.info(f"  - 模型复用次数: {fc_metrics['model_reuse_count']}次")
    
    # 清理全局资源
    global global_enhancer, torch, onnxruntime
    cleanup_count = 0
    
    try:
        if global_enhancer:
            logger.info("🗑️ 清理模型实例...")
            del global_enhancer
            global_enhancer = None
            cleanup_count += 1
            
        # 清理torch缓存
        if torch is not None:
            try:
                if hasattr(torch, 'cuda') and torch.cuda.is_available():
                    torch.cuda.empty_cache()
                    logger.info("🗑️ 清理Torch GPU缓存")
            except:
                pass
                
        # 强制垃圾回收
        import gc
        collected = gc.collect()
        logger.info(f"🗑️ 垃圾回收对象数: {collected}")
        
        prestop_time = time.time() - prestop_start_time
        logger.info(f"✅ FC资源清理完成，耗时: {prestop_time:.2f}s")
        
    except Exception as e:
        logger.error(f"❌ FC资源清理异常: {e}")
    
    logger.info("👋 FC实例正常关闭")

if __name__ == "__main__":
    import uvicorn
    print("[FC-STARTUP] Starting FC denoise server...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=9000,  # ✅ FC健康检查端口
        log_level="info"
    )