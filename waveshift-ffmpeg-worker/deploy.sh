#!/bin/bash

echo "🚀 部署 FFmpeg Worker..."

# 确保在正确的目录
cd "$(dirname "$0")"

# 构建 Docker 镜像
echo "📦 构建容器镜像..."
docker build -t ffmpeg-container .
if [ $? -ne 0 ]; then
    echo "❌ Docker 构建失败"
    exit 1
fi

# 部署到 Cloudflare
echo "☁️ 部署到 Cloudflare Workers..."
npx wrangler deploy
if [ $? -ne 0 ]; then
    echo "❌ Wrangler 部署失败"
    exit 1
fi

echo "✅ FFmpeg Worker 部署成功！"