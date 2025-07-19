# 使用官方Python基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖和完整的音频编解码器
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    libavcodec-extra \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 验证ffmpeg支持的编解码器
RUN ffmpeg -codecs | grep aac || echo "AAC codec check"

# 复制requirements文件
COPY audio-segment-container/requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制源代码
COPY audio-segment-container/src/ ./src/

# 设置环境变量
ENV PYTHONPATH="/app"
ENV PYTHONUNBUFFERED=1

# 暴露端口
EXPOSE 8080

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# 启动命令
CMD ["python", "src/main.py"]