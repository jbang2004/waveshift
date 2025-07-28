# 🚀 生产版本 - 基于成功的Alpine配置添加FastAPI
FROM python:3.11-alpine

WORKDIR /app

# 安装Alpine系统依赖
RUN apk add --no-cache \
    wget \
    ca-certificates \
    gcc \
    g++ \
    musl-dev \
    libffi-dev \
    libsndfile-dev

# 复制依赖文件
COPY requirements_alpine.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements_alpine.txt

# 复制所有服务器代码
COPY minimal_server.py .
COPY fastapi_server.py .
COPY audio_server.py .
COPY denoise_server.py .
COPY zipenhancer_streaming.py .

# 复制模型文件
COPY speech_zipenhancer_ans_multiloss_16k_base/ ./speech_zipenhancer_ans_multiloss_16k_base/

# 设置环境变量
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 8080

# 健康检查（使用wget）
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

# 🎯 渐进式启动：使用音频处理版本（有音频输出）
CMD ["python", "audio_server.py"]