# WaveShift TTS引擎模型目录

## 📁 目录结构

本目录包含TTS引擎所需的AI模型文件。由于文件较大（总计约3.5GB），未纳入Git版本控制。

### IndexTTS模型 (`IndexTTS/checkpoints/`)
- `bigvgan_discriminator.pth` (1.65GB) - BigVGAN判别器模型
- `bigvgan_generator.pth` (536MB) - BigVGAN生成器模型  
- `gpt.pth` (1.17GB) - GPT语言模型
- `dvae.pth` (243MB) - DVAE编码器模型
- `config.yaml` - 模型配置文件
- `bpe.model` - BPE分词模型
- `unigram_12000.vocab` - 词汇表文件

### 音频分离模型 (`audio-separator-models/`)
- `Kim_Vocal_2.onnx` - 音频分离ONNX模型

## 🚀 模型获取方式

### IndexTTS v0.1.4模型
1. 从官方GitHub仓库下载：[IndexTTS官方仓库](https://github.com/IndexTeam/IndexTTS)
2. 或从Hugging Face模型库获取预训练模型
3. 确保模型版本为v0.1.4，以保证兼容性

### 音频分离模型
1. 从[audio-separator项目](https://github.com/karaokenerds/python-audio-separator)获取
2. 下载Kim_Vocal_2.onnx模型文件

## ⚙️ 安装指南

### 1. 创建模型目录结构
```bash
mkdir -p waveshift-tts-engine/models/IndexTTS/checkpoints
mkdir -p waveshift-tts-engine/models/audio-separator-models
```

### 2. 下载并放置模型文件
将下载的模型文件按照上述结构放置到对应目录中。

### 3. 验证模型完整性
启动TTS引擎时，系统会自动验证模型文件是否存在：
```bash
python3 start_new.py
```

## 🔧 故障排除

### 模型加载失败
- 检查模型文件是否存在
- 验证文件完整性（大小和格式）
- 确保目录权限正确

### 内存不足
- IndexTTS模型需要至少8GB内存
- 建议使用GPU加速（CUDA支持）

## 📊 模型性能参数

| 模型组件 | 大小 | 用途 | GPU内存需求 |
|---------|------|------|------------|
| BigVGAN Generator | 536MB | 语音生成 | 2GB |
| BigVGAN Discriminator | 1.65GB | 质量判别 | 3GB |
| GPT | 1.17GB | 语言建模 | 2GB |
| DVAE | 243MB | 编码解码 | 1GB |

## 📋 版本兼容性

- **IndexTTS**: v0.1.4
- **PyTorch**: 2.7.1+
- **CUDA**: 12.6+ (GPU加速)
- **Python**: 3.11+

## ⚠️ 重要说明

1. **版权**: 模型文件遵循各自的开源许可证
2. **用途**: 仅用于研究和非商业用途
3. **更新**: 定期检查模型更新，保持最佳性能
4. **备份**: 建议在本地保留模型文件备份

---

*最后更新: 2025-08-05*  
*WaveShift TTS Engine v2.0*