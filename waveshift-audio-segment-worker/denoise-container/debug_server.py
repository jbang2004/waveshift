#!/usr/bin/env python3
"""
调试服务器 - 最简化版本，用于验证容器基础配置
逐步添加依赖以定位崩溃问题
"""

from fastapi import FastAPI, Response
import json
import time
import os
import sys

print("🔍 调试服务器启动...")
print(f"Python版本: {sys.version}")
print(f"工作目录: {os.getcwd()}")
print(f"环境变量: {dict(os.environ)}")

# 创建最简化的FastAPI应用
app = FastAPI(title="Debug Server", version="0.1.0")

@app.get("/")
async def root():
    """超简化健康检查"""
    return {
        "status": "healthy",
        "service": "debug-denoise-container", 
        "version": "0.1.0",
        "timestamp": time.time(),
        "python_version": sys.version,
        "working_dir": os.getcwd()
    }

@app.get("/debug")
async def debug_info():
    """调试信息端点"""
    try:
        import platform
        return {
            "platform": platform.platform(),
            "architecture": platform.architecture(),
            "python_executable": sys.executable,
            "python_path": sys.path[:3],  # 只显示前3个路径
            "env_vars": {
                "PATH": os.environ.get("PATH", ""),
                "PYTHONPATH": os.environ.get("PYTHONPATH", ""),
                "LD_LIBRARY_PATH": os.environ.get("LD_LIBRARY_PATH", "")
            }
        }
    except Exception as e:
        return {"error": str(e)}

@app.post("/")
async def simple_echo():
    """简单回显测试"""
    return Response(
        content="OK - 容器基础功能正常",
        media_type="text/plain",
        headers={"X-Debug": "basic-functionality-ok"}
    )

if __name__ == "__main__":
    import uvicorn
    print("🚀 启动调试服务器...")
    uvicorn.run(
        app,
        host="0.0.0.0", 
        port=8080,
        log_level="debug"
    )