#!/bin/bash
# ZipEnhancer 自包含 GPU Docker 运行脚本
# 🎊 使用完全自包含的镜像，无需任何主机库映射！

echo "🚀 启动 ZipEnhancer 自包含 GPU 加速容器..."

if [ $# -lt 2 ]; then
    echo "用法: $0 <输入音频> <输出音频> [--verbose]"
    echo "示例: $0 test/test_audio.wav output.wav --verbose"
    echo ""
    echo "✨ 特点："
    echo "  - 🎯 完全自包含，无需库映射"
    echo "  - 🚀 内置 cuDNN 9.11.0"
    echo "  - 📦 完全可移植"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="$2"
VERBOSE_FLAG="$3"
CURRENT_DIR=$(pwd)

echo "📁 输入文件: $INPUT_FILE"
echo "📁 输出文件: $OUTPUT_FILE" 
echo "📦 使用镜像: zipenhancer:self-contained"
echo ""

# 🎉 极简运行命令 - 无需任何库映射！
docker run --gpus all \
  -v "${CURRENT_DIR}:/audio" \
  zipenhancer:self-contained "/audio/${INPUT_FILE}" "/audio/${OUTPUT_FILE}" ${VERBOSE_FLAG}

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 自包含 GPU 加速降噪完成！"
    echo "🎊 这就是完全可移植的 Docker 方案！"
else
    echo ""
    echo "❌ 处理失败，请检查："
    echo "  1. 确保安装了 NVIDIA Container Toolkit"
    echo "  2. 检查输入文件路径是否正确"
    echo "  3. 确保 GPU 可用 (nvidia-smi)"
fi 