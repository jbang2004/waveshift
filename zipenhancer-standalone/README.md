# ZipEnhancer

🚀 基于深度学习的音频降噪工具，使用 ONNX Runtime 进行高性能推理，提供完全自包含的 Docker GPU 加速方案。

## ✨ 特点

- 🎯 **极简部署**: 单个自包含 Docker 镜像，无需复杂配置
- 🚀 **GPU 加速**: 内置 cuDNN 9，2x+ 实时处理速度
- 📦 **生产就绪**: 完全可移植，适合大规模部署  
- 🔧 **智能回退**: GPU 不可用时自动切换 CPU 模式

## 🚀 快速开始

### 部署方式

#### 1. 本地Docker部署（推荐）

```bash
# 安装 NVIDIA Container Toolkit
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo -E apt update && sudo -E apt install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker && sudo systemctl restart docker

# 代理环境构建（推荐）
docker build --network=host \
  --build-arg http_proxy=$http_proxy \
  --build-arg https_proxy=$https_proxy \
  -t zipenhancer:self-contained .

# 运行 GPU 加速降噪
docker run --gpus all -v $(pwd):/audio \
  zipenhancer:self-contained /audio/input.wav /audio/output.wav --verbose
```

#### 2. 阿里云函数计算部署

```bash
# 构建FC镜像
docker build --network=host \
  --build-arg http_proxy=$http_proxy \
  --build-arg https_proxy=$https_proxy \
  -f Dockerfile.fc -t zipenhancer-gpu:latest .

# 登录ACR并推送
docker login --username=aliyun0518007542 --password=13318251863jbang \
  crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com
docker tag zipenhancer-gpu:latest \
  crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/zipenhancer-gpu:latest
docker push crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/zipenhancer-gpu:latest

# 部署到FC
s deploy -y

# 测试API
curl -X POST https://your-function-url/ \
  -H "Content-Type: audio/wav" \
  --data-binary @test/test_audio.wav \
  --output denoised.wav
```

配置：Tesla T4 GPU，4GB显存，4.5x实时处理速度

#### 3. 本地安装

```bash
pip install -r requirements.txt
python zipenhancer.py input.wav output.wav --verbose
```

## 📊 性能指标

基于 7.9 秒测试音频的实测数据：

| 部署方案 | 镜像大小 | 设备 | 处理时间 | 实时倍率 | 可移植性 |
|----------|----------|------|----------|----------|----------|
| **自包含镜像** | 3.89GB | GPU | 3.9s | **2.0x** | ✅ 完全可移植 |
| 本地环境 | - | GPU | 1.8s | 4.4x | ❌ 环境依赖 |
| CPU 模式 | 3.02GB | CPU | 22.4s | 0.4x | ✅ 兼容性好 |

> **能量保留率**: 87% （所有方案一致）

## 🔧 高级选项

### 使用便捷脚本

```bash
./run-gpu.sh test/test_audio.wav output.wav --verbose
```

### Python API

```python
from zipenhancer import denoise_audio

# 基础使用
denoise_audio('noisy.wav', 'clean.wav')

# 详细输出
denoise_audio('noisy.wav', 'clean.wav', verbose=True)
```

## 🛠️ 技术架构

### 核心优势
- **NumPy/SciPy** 替代 PyTorch，避免版本冲突
- **ONNX Runtime GPU** 高性能推理引擎  
- **cuDNN 9.11.0** 完全内置，无需主机映射
- **智能分块处理** 2 秒块 + 0.2 秒重叠

### 网络代理突破
成功解决 Docker 构建网络问题的关键技术：
- `--network=host` 让容器直接访问主机网络
- `--build-arg` 传递代理环境变量  
- 使用原始 Ubuntu 仓库避免镜像源冲突

## 📋 系统要求

- **GPU 推荐**: NVIDIA GPU + CUDA 12.x
- **内存**: 4GB RAM + 2GB GPU 内存
- **系统**: Ubuntu 22.04 / Windows 10+
- **容器**: Docker + NVIDIA Container Toolkit

## 🔍 故障排除

### 常见问题
1. **GPU 不工作**: 确保安装 NVIDIA Container Toolkit 并重启 Docker  
2. **网络代理**: 使用 `sudo -E` 传递环境变量  
3. **构建失败**: 使用 `--network=host` 参数

### 代理环境构建
```bash
# 方法1：传递代理参数（推荐）
docker build --network=host --build-arg http_proxy=$http_proxy -t zipenhancer .

# 方法2：临时禁用代理
unset https_proxy && docker build -t zipenhancer .
```

## 🎯 输出示例

```
处理: /audio/input.wav [7.9s, 16000Hz]
  设备: GPU
  模式: 分块处理 (2.0s块/0.2s重叠)
  进度: ████████████████████
✓ 完成: /audio/output.wav [3.9s, 2.0x实时]

📊 详细统计:
  处理时间: 1.02s
  实时倍率: 2.0x
  能量比值: 0.87
```

## 📄 技术规格

- **模型**: 阿里达摩院 ZipEnhancer (ONNX)
- **支持格式**: MP3, WAV, M4A, FLAC, AAC, OGG
- **输出**: 16kHz 单声道 WAV, 32-bit 浮点
- **依赖**: 仅 5 个核心包 (onnxruntime-gpu, soundfile, numpy, scipy, librosa)

---

**🎊 完全自包含的生产级 Docker GPU 加速方案！**

MIT License. 模型版权归阿里达摩院所有。