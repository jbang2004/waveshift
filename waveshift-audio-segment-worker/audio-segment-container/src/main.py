#!/usr/bin/env python3
"""
音频切分容器服务 - 极简版
专注于纯 FFmpeg 音频处理，作为 Worker 的计算引擎
"""
import os
import asyncio
import logging
import tempfile
import subprocess
import json
from typing import List
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.responses import Response

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI应用
app = FastAPI(title="Audio Segment Container - Minimal")


@app.get("/")
@app.get("/health")
async def health_check():
    """健康检查 - 支持根路径和/health"""
    return {
        "status": "healthy",
        "service": "audio-segment-container-minimal",
        "version": "3.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "note": "Pure FFmpeg processing engine for Worker"
    }


@app.post("/")
async def process_audio(request: Request):
    """
    🎯 核心处理接口：纯 FFmpeg 音频切分
    输入：音频二进制数据 + 时间范围 + 参数（通过请求头）
    输出：处理后的音频二进制数据
    """
    try:
        # 从请求头获取参数
        time_ranges_str = request.headers.get('X-Time-Ranges')
        segment_id = request.headers.get('X-Segment-Id', 'unknown')
        speaker = request.headers.get('X-Speaker', 'unknown')
        gap_duration_ms = int(request.headers.get('X-Gap-Duration', '500'))
        
        if not time_ranges_str:
            return Response(
                content=json.dumps({"success": False, "error": "Missing X-Time-Ranges header"}),
                media_type="application/json",
                status_code=400
            )
        
        time_ranges = json.loads(time_ranges_str)
        
        logger.info(f"🎵 处理音频片段: {segment_id}, speaker={speaker}, 时间范围={len(time_ranges)}段, gap={gap_duration_ms}ms")
        
        # 获取音频数据
        audio_data = await request.body()
        if not audio_data:
            return Response(
                content=json.dumps({"success": False, "error": "No audio data received"}),
                media_type="application/json",
                status_code=400
            )
        
        logger.info(f"📥 接收音频数据: {len(audio_data)} bytes")
        
        # 执行 FFmpeg 处理
        output_data = await execute_ffmpeg_for_ranges(
            audio_data, time_ranges, gap_duration_ms
        )
        
        if not output_data:
            return Response(
                content=json.dumps({"success": False, "error": "FFmpeg processing failed"}),
                media_type="application/json",
                status_code=500
            )
        
        logger.info(f"✅ FFmpeg处理完成: 输出 {len(output_data)} bytes")
        
        # 直接返回音频二进制数据
        return Response(
            content=output_data,
            media_type="audio/wav",
            headers={
                "X-Segment-Id": segment_id,
                "X-Speaker": speaker,
                "X-Processing-Success": "true"
            }
        )
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON解析错误: {e}")
        return Response(
            content=json.dumps({"success": False, "error": f"Invalid time ranges format: {e}"}),
            media_type="application/json",
            status_code=400
        )
    except Exception as e:
        logger.error(f"处理音频失败: {e}", exc_info=True)
        return Response(
            content=json.dumps({"success": False, "error": f"Processing failed: {e}"}),
            media_type="application/json",
            status_code=500
        )


async def execute_ffmpeg_for_ranges(
    audio_data: bytes, 
    time_ranges: List[List[int]], 
    gap_duration_ms: int
) -> bytes:
    """
    🎯 核心 FFmpeg 处理函数：专注纯计算，无 I/O 操作
    使用 FFmpeg 处理指定时间范围的音频
    """
    # 创建临时输入文件
    with tempfile.NamedTemporaryFile(suffix='.aac', delete=False) as tmp_input:
        tmp_input.write(audio_data)
        input_path = tmp_input.name
    
    # 创建临时输出文件
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp_output:
        output_path = tmp_output.name
    
    try:
        if len(time_ranges) == 1:
            # 🎯 单段处理 - 高性能流复制
            start_ms, end_ms = time_ranges[0]
            start_sec = start_ms / 1000.0
            duration_sec = (end_ms - start_ms) / 1000.0
            
            ffmpeg_cmd = [
                'ffmpeg', '-y',
                '-ss', f'{start_sec:.3f}',
                '-i', input_path,
                '-t', f'{duration_sec:.3f}',
                '-c:a', 'copy',
                '-avoid_negative_ts', 'make_zero',
                output_path
            ]
            
            logger.info(f"📝 单段FFmpeg: {start_sec:.3f}s-{start_sec + duration_sec:.3f}s ({duration_sec:.3f}s)")
            
        else:
            # 🎵 多段处理 - Gap静音插入
            input_specs = []
            
            # 为每个音频段添加输入
            for i, (start_ms, end_ms) in enumerate(time_ranges):
                start_sec = start_ms / 1000.0
                duration_sec = (end_ms - start_ms) / 1000.0
                
                input_specs.extend([
                    '-ss', f'{start_sec:.3f}', 
                    '-t', f'{duration_sec:.3f}', 
                    '-i', input_path
                ])
                
                logger.info(f"  段{i+1}: {start_sec:.3f}s-{start_sec + duration_sec:.3f}s ({duration_sec:.3f}s)")
            
            # 构建filter_complex - Gap静音插入
            gap_sec = gap_duration_ms / 1000.0
            gap_filter = f'anullsrc=channel_layout=mono:sample_rate=44100:duration={gap_sec:.3f}'
            
            # 构建拼接序列：音频1 + gap + 音频2 + gap + 音频3...
            concat_parts = []
            for i in range(len(time_ranges)):
                concat_parts.append(f'[{i}:a]')
                if i < len(time_ranges) - 1:
                    concat_parts.append('[gap]')
            
            filter_complex = f'{gap_filter}[gap];{"".join(concat_parts)}concat=n={len(concat_parts)}:v=0:a=1[out]'
            
            ffmpeg_cmd = ['ffmpeg', '-y'] + input_specs + [
                '-filter_complex', filter_complex,
                '-map', '[out]',
                output_path
            ]
            
            logger.info(f"🎵 多段处理: {len(time_ranges)}段 + {len(time_ranges)-1}个Gap({gap_sec:.3f}s)")
        
        # 执行ffmpeg命令
        result = await asyncio.to_thread(
            subprocess.run, ffmpeg_cmd,
            capture_output=True, text=True
        )
        
        if result.returncode != 0:
            logger.error(f"FFmpeg处理失败: {result.stderr}")
            return None
        
        # 验证输出文件
        if not os.path.exists(output_path) or os.path.getsize(output_path) == 0:
            logger.error(f"FFmpeg未生成有效输出文件")
            return None
        
        # 读取处理后的音频数据
        with open(output_path, 'rb') as f:
            result_data = f.read()
        
        logger.info(f"🎉 FFmpeg处理成功: 生成 {len(result_data)} bytes")
        return result_data
        
    except Exception as e:
        logger.error(f"处理音频异常: {e}")
        return None
    finally:
        # 清理临时文件
        if os.path.exists(input_path):
            os.unlink(input_path)
        if os.path.exists(output_path):
            os.unlink(output_path)


if __name__ == "__main__":
    import uvicorn
    
    logger.info("🚀 启动 FastAPI 音频切分服务 (极简版)...")
    logger.info(f"📡 监听地址: 0.0.0.0:8080")
    logger.info(f"🎵 支持端点: / (GET健康检查, POST音频处理)")
    
    try:
        uvicorn.run(
            app, 
            host="0.0.0.0", 
            port=8080,
            log_level="info",
            access_log=True
        )
    except Exception as e:
        logger.error(f"❌ FastAPI 启动失败: {e}")
        raise