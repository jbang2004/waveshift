# ZipEnhancer

基于深度学习的音频降噪工具，使用 ONNX Runtime 进行高性能推理，采用优化的 NumPy 实现实现极简部署。

## 特点

- 🚀 **高性能**: GPU加速，7倍以上实时处理速度
- 🎯 **精简实现**: 仅需5个Python包，无需PyTorch
- 📦 **轻量部署**: Docker镜像仅1.5GB（相比传统方案减少60%）
- 🔧 **生产就绪**: 稳定可靠，适合大规模部署

## 安装

```bash
pip install -r requirements.txt
```

## 使用

### 命令行

```bash
# 基础使用
python zipenhancer.py input.wav output.wav

# 使用默认示例
python zipenhancer.py

# 详细输出
python zipenhancer.py input.wav output.wav --verbose
```

### Python API

```python
from zipenhancer import denoise_audio

# 基础使用
denoise_audio('noisy.wav', 'clean.wav')

# 详细输出
denoise_audio('noisy.wav', 'clean.wav', verbose=True)
```

## 技术架构

### 核心设计决策

本项目采用 **NumPy/SciPy 替代 PyTorch** 进行 STFT 处理，经过详细评估后确认：

- **精度无损**: 信号重建 SNR > 130dB，音频质量几乎相同
- **性能充足**: STFT 仅占总处理时间 4.1%，主要计算在 ONNX 推理
- **部署简化**: 避免 PyTorch 与 ONNX Runtime 的版本冲突
- **镜像精简**: Docker 镜像从 3-5GB 降至 1.5GB

### 性能指标

基于 7.91 秒测试音频的实测数据：

| 指标 | 数值 | 说明 |
|------|------|------|
| 总处理时间 | 1.1秒 | 包含所有处理步骤 |
| 实时处理倍率 | 7.17x | 远超实时要求 |
| GPU推理时间 | ~335ms/块 | 2秒音频块 |
| STFT处理时间 | ~11ms/块 | 仅占4.1% |
| 降噪效果 | 86.7% | 能量保留率 |
| 信号相关性 | 0.9256 | 优秀的保真度 |

### 降噪特性

- **频率响应**: 高频噪声抑制为主
  - 低频(<1kHz)保留: 86.5%
  - 高频(>3kHz)保留: 73.6%
- **动态范围**: 提升 0.6dB
- **应用场景**: 特别适合语音降噪

## Docker 部署

```dockerfile
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y \
    python3-pip python3-dev libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip3 install --no-cache-dir \
    onnxruntime-gpu==1.19.2 \
    soundfile==0.12.1 \
    numpy==1.24.3 \
    scipy==1.11.4 \
    librosa==0.10.1

COPY . .
ENTRYPOINT ["python3", "zipenhancer.py"]
```

### 运行容器

```bash
docker build -t zipenhancer:latest .
docker run --gpus all -v $(pwd)/audio:/audio \
    zipenhancer:latest /audio/input.wav /audio/output.wav
```

## 系统要求

### 最低配置
- Python 3.8+
- 4GB RAM（CPU模式）
- 2GB GPU 内存（GPU模式）

### 推荐配置
- NVIDIA GPU with CUDA 12.x
- 4GB+ GPU 内存
- Ubuntu 22.04 / Windows 10

## 依赖说明

仅需5个核心包：
- `onnxruntime-gpu`: ONNX 模型推理引擎
- `soundfile`: 音频文件读写
- `numpy`: 数值计算基础
- `scipy`: STFT 信号处理
- `librosa`: 音频预处理工具

## 输出示例

```
处理: input.wav [7.9s, 16000Hz]
  设备: GPU
  模式: 分块处理 (2.0s块/0.2s重叠)
  进度: ████████████████████
✓ 完成: output.wav [1.1s, 7.2x实时]
```

## 技术规格

- **模型**: 阿里达摩院 ZipEnhancer (ONNX格式)
- **输入格式**: MP3, WAV, M4A, FLAC, AAC, OGG 等
- **输出格式**: 16kHz 单声道 WAV
- **处理精度**: 32-bit 浮点
- **GPU支持**: CUDA 12.x, cuDNN 9.x

## 许可证

MIT License. 模型版权归阿里达摩院所有。