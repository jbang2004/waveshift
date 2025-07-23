# 使用官方Python基础镜像
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装ffmpeg和必需的音频编解码器
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libavcodec-extra \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 验证ffmpeg和ffprobe可用性
RUN ffmpeg -version && ffprobe -version
RUN ffmpeg -codecs | grep aac && echo "✅ AAC codec available"

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

# 启动前诊断
RUN echo "🔍 启动前诊断信息:" && \
    python --version && \
    ls -la /app/src/ && \
    python -c "import fastapi, uvicorn; print('✅ 基础依赖导入成功')" && \
    echo "📂 当前工作目录: $(pwd)" && \
    echo "🐍 Python路径: $PYTHONPATH"

# 启动命令 - 使用绝对路径和详细错误输出
CMD ["python", "-u", "/app/src/main.py"]