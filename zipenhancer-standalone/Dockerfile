FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# 使用中国镜像源解决网络连接问题
RUN sed -i 's@//.*archive.ubuntu.com@//mirrors.ustc.edu.cn@g' /etc/apt/sources.list && \
    sed -i 's@//.*security.ubuntu.com@//mirrors.ustc.edu.cn@g' /etc/apt/sources.list && \
    apt-get update && apt-get install -y --no-install-recommends \
    python3-pip python3-dev \
    libsndfile1 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# 复制requirements文件并安装依赖（使用阿里云镜像源）
COPY requirements.txt .
RUN pip3 install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com -r requirements.txt

# 复制应用文件
COPY speech_zipenhancer_ans_multiloss_16k_base/ ./speech_zipenhancer_ans_multiloss_16k_base/
COPY zipenhancer.py ./

# 设置环境变量
ENV CUDA_VISIBLE_DEVICES=0
ENV OMP_NUM_THREADS=1

ENTRYPOINT ["python3", "zipenhancer.py"]