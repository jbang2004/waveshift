# Audio-Separator 模型目录

此目录用于存储 audio-separator 库使用的音频分离模型，避免每次启动时重新下载。

## 当前模型

- `Kim_Vocal_2.onnx` - 用于人声和背景音分离的默认模型

## 配置说明

系统已配置为自动使用此目录中的模型：
- 在 `.env` 文件中设置了 `AUDIO_SEPARATOR_MODEL_DIR=models/audio-separator-models`
- VocalSeparator 类会自动检测并使用此目录

## 添加新模型

如需使用其他模型：
1. 下载模型文件（.onnx 或 .pth 格式）到此目录
2. 在 `.env` 中修改 `VOCAL_SEPARATION_MODEL` 为新模型文件名
3. 重启服务

## 注意事项

- 请勿删除正在使用的模型文件
- 模型文件通常较大（100MB+），建议保留在本地避免重复下载
- 首次使用新模型时，系统会自动下载相关配置文件