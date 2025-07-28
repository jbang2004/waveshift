#!/usr/bin/env python3
"""
FastAPI版本 - 基于成功的minimal_server逐步添加功能
"""

from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
import time
import sys
import os

print(f"[STARTUP] Loading FastAPI server...")
print(f"[STARTUP] Python {sys.version}")

# 创建FastAPI应用
app = FastAPI(
    title="Denoise Service (Alpine)", 
    version="1.0.0",
    description="音频降噪服务 - Alpine优化版"
)

@app.get("/")
async def root():
    """健康检查端点"""
    return {
        "status": "healthy",
        "service": "denoise-container-alpine",
        "version": "1.0.0",
        "framework": "FastAPI",
        "python": sys.version.split()[0],
        "timestamp": time.time()
    }

@app.get("/health")
async def health():
    """详细健康检查"""
    return {
        "status": "healthy",
        "ready": True,
        "dependencies": {
            "fastapi": "loaded",
            "numpy": "pending",
            "soundfile": "pending"
        }
    }

@app.post("/")
async def process_audio():
    """音频处理端点（占位符）"""
    return Response(
        content="OK - FastAPI server working on Alpine",
        media_type="text/plain",
        headers={"X-Server": "fastapi-alpine"}
    )

if __name__ == "__main__":
    import uvicorn
    print("[STARTUP] Starting FastAPI server on Alpine Linux...")
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )