# 🚀 Ubuntu版本 - 支持完整onnxruntime和深度学习库
# 基于Cloudflare Containers推荐：linux/amd64 + 完整库支持
FROM python:3.10-slim-bullseye

WORKDIR /app

# 安装Ubuntu/Debian系统依赖
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    libsndfile1 \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 复制Ubuntu依赖文件
COPY requirements_ubuntu.txt .

# 安装Python依赖（Ubuntu下onnxruntime可用）
RUN pip install --no-cache-dir -r requirements_ubuntu.txt

# 复制核心服务代码
COPY denoise_alpine.py .
COPY zipenhancer_streaming.py .

# 复制模型文件
COPY speech_zipenhancer_ans_multiloss_16k_base/ ./speech_zipenhancer_ans_multiloss_16k_base/

# 设置环境变量
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=2
ENV MKL_NUM_THREADS=2

# 暴露端口
EXPOSE 8080

# 健康检查（使用wget）
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:8080/health || exit 1

# 🎯 使用完整降噪版本（Ubuntu支持onnxruntime）
CMD ["python", "denoise_alpine.py"]