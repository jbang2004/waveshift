#!/bin/bash
set -e

echo "=========================================="
echo "WaveShift TTS Engine - 主机部署启动脚本"
echo "=========================================="

# 检查 Python 版本
echo "检查 Python 环境..."
python3 --version || {
    echo "错误：需要 Python 3.8+ 环境"
    exit 1
}

# 检查必要目录
echo "检查模型目录..."
if [ ! -d "models/IndexTTS" ]; then
    echo "错误：未找到 models/IndexTTS 目录"
    echo "请确保模型文件已正确放置"
    exit 1
fi

# 检查必要的模型文件
echo "检查关键模型文件..."
REQUIRED_FILES=(
    "models/IndexTTS/checkpoints/gpt.pth"
    "models/IndexTTS/checkpoints/dvae.pth"
    "models/IndexTTS/checkpoints/bigvgan_generator.pth"
    "models/IndexTTS/checkpoints/config.yaml"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "警告：缺少模型文件 $file"
    else
        echo "✓ 找到 $file"
    fi
done

# 检查环境变量文件
if [ ! -f ".env" ]; then
    echo "错误：未找到 .env 配置文件"
    exit 1
fi

# 安装依赖
echo "安装 Python 依赖..."
pip3 install -r requirements.txt

# 启动服务
echo "启动 WaveShift TTS Engine..."
echo "服务将在 http://localhost:8000 启动"
echo "按 Ctrl+C 停止服务"
echo "=========================================="

python3 app.py