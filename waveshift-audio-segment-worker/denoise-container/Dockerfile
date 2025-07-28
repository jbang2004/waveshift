# 多阶段构建 - 第一阶段：构建环境（优化版）
FROM python:3.11-slim as builder

WORKDIR /app

# 安装构建依赖（最小化）
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    libsndfile1-dev \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 复制依赖文件
COPY requirements.txt .
COPY requirements_debug.txt .

# 🔍 调试模式：使用简化依赖避免大型包导致的崩溃
RUN pip install --no-cache-dir --target=/app/deps -r requirements_debug.txt \
    && find /app/deps -type d -name "__pycache__" -exec rm -rf {} + \
    && find /app/deps -type f -name "*.pyc" -delete \
    && find /app/deps -type f -name "*.pyo" -delete \
    && find /app/deps -type f -name "*.pyd" -delete \
    && find /app/deps -name "tests" -type d -exec rm -rf {} + \
    && find /app/deps -name "test" -type d -exec rm -rf {} + \
    && find /app/deps -name "*.so" -exec strip {} \;

# 多阶段构建 - 第二阶段：运行环境
FROM python:3.11-slim

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    libgomp1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制依赖
COPY --from=builder /app/deps /usr/local/lib/python3.11/site-packages

# 复制应用代码
COPY denoise_server.py .
COPY zipenhancer_streaming.py .
COPY debug_server.py .

# 复制模型文件
COPY speech_zipenhancer_ans_multiloss_16k_base/ ./speech_zipenhancer_ans_multiloss_16k_base/

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=4
ENV MKL_NUM_THREADS=4
ENV TORCH_NUM_THREADS=4

# 暴露端口
EXPOSE 8080

# 健康检查（优化版 - 快速启动）
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/')" || exit 1

# 🔍 调试模式：使用最简化服务器定位问题
CMD ["uvicorn", "debug_server:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1", "--timeout-keep-alive", "60", "--log-level", "debug"]