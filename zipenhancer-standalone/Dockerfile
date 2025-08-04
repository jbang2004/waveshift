# 使用确认存在的NVIDIA CUDA 12.2.0基础镜像
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# 直接使用原始Ubuntu仓库（配合--network=host使用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-dev \
    libsndfile1 \
    ca-certificates \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# 直接安装cuDNN 9（使用基础镜像已配置的NVIDIA仓库）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcudnn9-cuda-12 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# 复制requirements文件并安装依赖（使用官方pip仓库）
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# 复制应用文件
COPY speech_zipenhancer_ans_multiloss_16k_base/ ./speech_zipenhancer_ans_multiloss_16k_base/
COPY zipenhancer.py ./

# 设置环境变量
ENV CUDA_VISIBLE_DEVICES=0
ENV OMP_NUM_THREADS=1
ENV LD_LIBRARY_PATH=/usr/local/cuda/lib64:/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH}

ENTRYPOINT ["python3", "zipenhancer.py"]