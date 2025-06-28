#!/bin/bash

# WaveShift Workflow 部署脚本
echo "🚀 开始部署 WaveShift Workflow..."

# 设置环境变量
export CLOUDFLARE_API_TOKEN=c-09QTxMiwuq87L9gQe959CTRxbDHXi5NYnQUbMz
export CLOUDFLARE_ACCOUNT_ID=1298fa35ac940c688dc1b6d8f5eead72

# 确保在正确的目录中
cd "$(dirname "$0")"

echo "📁 当前目录: $(pwd)"
echo "📋 检查配置文件..."

if [ ! -f "wrangler.jsonc" ]; then
    echo "❌ 错误: 找不到 wrangler.jsonc 文件"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo "❌ 错误: 找不到 package.json 文件" 
    exit 1
fi

echo "✅ 配置文件检查完成"

# 检查依赖
echo "📦 检查依赖..."
if [ ! -d "node_modules" ]; then
    echo "⬇️ 安装依赖..."
    npm install
fi

echo "🔨 开始部署到 Cloudflare..."

# 注意：不再需要构建容器，因为容器已经移到 ffmpeg-worker
# 使用 npx 来确保使用本地安装的 wrangler
npx wrangler deploy

if [ $? -eq 0 ]; then
    echo "✅ 部署成功!"
    echo "🌐 Worker 已部署到: https://waveshift-workflow.YOUR_SUBDOMAIN.workers.dev"
    echo "📊 可以在 Cloudflare Dashboard 查看部署状态"
else
    echo "❌ 部署失败，请检查错误信息"
    exit 1
fi