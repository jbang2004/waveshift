# FC降噪服务Dockerfile
# 基于ModelScope ZipEnhancer模型，30行代码实现

FROM python:3.10-slim

WORKDIR /app

# 复制必需文件
COPY requirements.txt .
COPY src/ ./src/
COPY models/ ./models/

# 安装系统依赖（使用默认源，GitHub Actions网络稳定）
RUN apt-get update && apt-get install -y --no-install-recommends \
       libsndfile1 \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# 安装Python依赖（使用默认PyPI源）
RUN pip install --no-cache-dir -r requirements.txt

# FC运行时优化
ENV PYTHONUNBUFFERED=1
ENV OMP_NUM_THREADS=1

# 暴露端口
EXPOSE 9000

# FC容器入口 - 启动HTTP服务器
CMD ["python", "-m", "src.server"]