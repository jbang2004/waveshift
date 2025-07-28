#!/bin/bash

echo "🚀 开始部署音频切分+降噪服务..."

# 设置错误时退出
set -e

# 进入项目目录
cd "$(dirname "$0")"

echo "📁 当前工作目录: $(pwd)"

# 1. 检查必要文件是否存在
echo "🔍 检查文件结构..."
if [ ! -f "wrangler.jsonc" ]; then
    echo "❌ wrangler.jsonc 文件不存在"
    exit 1
fi

if [ ! -d "denoise-container" ]; then
    echo "❌ denoise-container 目录不存在"
    exit 1
fi

if [ ! -f "denoise-container/denoise_server.py" ]; then
    echo "❌ denoise_server.py 文件不存在"
    exit 1
fi

if [ ! -f "denoise-container/speech_zipenhancer_ans_multiloss_16k_base/onnx_model.onnx" ]; then
    echo "❌ ONNX模型文件不存在"
    exit 1
fi

echo "✅ 文件结构检查通过"

# 2. 构建和部署
echo "🔧 开始构建和部署..."
npm run deploy

# 3. 等待部署完成
echo "⏳ 等待容器启动..."
sleep 30

# 4. 健康检查
echo "🩺 执行健康检查..."

# 检查Worker基本健康状态
echo "检查Worker健康状态..."
if curl -s "https://waveshift-audio-segment-worker.jbang20042004.workers.dev/health" > /dev/null; then
    echo "✅ Worker健康检查通过"
else
    echo "⚠️ Worker健康检查失败，但可能是正常的（容器可能还在启动）"
fi

echo "🎉 部署完成！"
echo ""
echo "✅ 重要更新："
echo "🔊 音频切分容器已优化为16kHz单声道输出"
echo "🧠 降噪容器已优化采样率验证逻辑"
echo "⚡ FFmpeg处理顺序: 先切分 → 后重采样 (性能最优)"
echo ""
echo "📋 后续步骤："
echo "1. 在前端界面启用降噪选项"
echo "2. 上传测试音频文件"
echo "3. 检查生成的音频是否经过降噪处理"
echo "4. 验证音频采样率为16kHz单声道"
echo ""
echo "🔍 监控命令："
echo "wrangler tail waveshift-audio-segment-worker --format pretty"
echo ""
echo "🧪 测试调用（从workflow）："
echo "enableDenoising: true # 在工作流参数中设置此选项"
echo ""
echo "⚙️ GitHub Actions部署："
echo "gh workflow run 'Deploy Audio Segment Worker with Denoise (Manual)'"