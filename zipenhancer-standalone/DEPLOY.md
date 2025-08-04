# 部署指南

## 环境要求

- Python 3.8+
- CUDA 11.x（可选，用于GPU加速）
- 4GB+ RAM（CPU模式）或 4GB+ GPU内存（GPU模式）

## 快速部署

1. 克隆代码：
```bash
git clone <repository>
cd zipenhancer-standalone
```

2. 安装依赖：
```bash
pip install -r requirements.txt
```

3. 验证安装：
```bash
python zipenhancer.py
```

## Docker 部署

### GPU版本（推荐）

```dockerfile
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y \
    python3-pip python3-dev libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

COPY . .
ENTRYPOINT ["python3", "zipenhancer.py"]
```

构建和运行：
```bash
docker build -t zipenhancer:gpu .
docker run --gpus all -v $(pwd)/audio:/audio \
    zipenhancer:gpu /audio/input.wav /audio/output.wav
```

### CPU版本

```dockerfile
FROM python:3.10-slim

WORKDIR /app
COPY requirements.txt .
# 安装CPU版本的ONNX Runtime
RUN sed -i 's/onnxruntime-gpu/onnxruntime/g' requirements.txt && \
    pip install --no-cache-dir -r requirements.txt

COPY . .
ENTRYPOINT ["python", "zipenhancer.py"]
```

## API 集成

```python
from zipenhancer import denoise_audio

# 在您的应用中使用
def process_audio(input_file, output_file):
    return denoise_audio(input_file, output_file)
```

## 性能优化

- **GPU加速**：默认使用 `onnxruntime-gpu` 进行推理加速
- **精简依赖**：使用 NumPy/SciPy 替代 PyTorch，减少60%镜像大小
- **批处理**：对多个文件使用并行处理
- **内存管理**：长音频自动分块处理，避免GPU内存溢出
- **实测性能**：7倍以上实时处理速度

## 监控

建议监控以下指标：
- 处理时间和实时倍率
- GPU/CPU使用率
- 内存使用情况