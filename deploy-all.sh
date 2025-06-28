#!/bin/bash

echo "🎯 WaveShift 完整部署流程"
echo "========================"

# 设置环境变量
export CLOUDFLARE_API_TOKEN=c-09QTxMiwuq87L9gQe959CTRxbDHXi5NYnQUbMz
export CLOUDFLARE_ACCOUNT_ID=1298fa35ac940c688dc1b6d8f5eead72

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. 部署 ffmpeg-worker (必须先部署，因为 waveshift-workflow 依赖它)
echo ""
echo "1️⃣ 部署 FFmpeg Worker..."
echo "------------------------"
cd "$SCRIPT_DIR/ffmpeg-worker"
if [ -f "deploy.sh" ]; then
    ./deploy.sh
    if [ $? -ne 0 ]; then
        echo "❌ FFmpeg Worker 部署失败"
        exit 1
    fi
else
    echo "⚠️ 没有找到 ffmpeg-worker/deploy.sh，使用 wrangler 直接部署..."
    npm install
    npx wrangler deploy
    if [ $? -ne 0 ]; then
        echo "❌ FFmpeg Worker 部署失败"
        exit 1
    fi
fi

# 2. 部署 waveshift-workflow
echo ""
echo "2️⃣ 部署 WaveShift Workflow..."
echo "-----------------------------"
cd "$SCRIPT_DIR/waveshift-workflow"
if [ -f "deploy.sh" ]; then
    ./deploy.sh
    if [ $? -ne 0 ]; then
        echo "❌ WaveShift Workflow 部署失败"
        exit 1
    fi
else
    echo "⚠️ 没有找到 waveshift-workflow/deploy.sh，使用 wrangler 直接部署..."
    npm install
    npx wrangler deploy
    if [ $? -ne 0 ]; then
        echo "❌ WaveShift Workflow 部署失败"
        exit 1
    fi
fi

# 3. 验证部署
echo ""
echo "3️⃣ 验证部署状态..."
echo "-------------------"
echo "📍 FFmpeg Worker: https://ffmpeg-worker.YOUR_SUBDOMAIN.workers.dev"
echo "📍 WaveShift Workflow: https://waveshift-workflow.YOUR_SUBDOMAIN.workers.dev"
echo "📍 Gemini Transcribe: https://gemini-transcribe-worker.YOUR_SUBDOMAIN.workers.dev"

echo ""
echo "✅ 所有服务部署完成！"
echo ""
echo "📝 注意事项："
echo "- 确保所有 Service Binding 配置正确"
echo "- 检查 R2 bucket 权限是否正确配置"
echo "- 验证 D1 数据库是否初始化"
echo ""
echo "🧪 测试建议："
echo "1. 访问 WaveShift Workflow 主页面"
echo "2. 上传一个小视频文件进行测试"
echo "3. 检查音视频分离和转录功能是否正常"