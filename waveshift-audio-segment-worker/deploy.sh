#!/bin/bash

# WaveShift Audio Segment Worker 部署脚本

set -e

echo "🚀 开始部署 WaveShift Audio Segment Worker"

# 检查必要的环境变量
check_env() {
    if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
        echo "❌ 错误: 请设置 CLOUDFLARE_API_TOKEN 环境变量"
        exit 1
    fi
    
    if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
        echo "❌ 错误: 请设置 CLOUDFLARE_ACCOUNT_ID 环境变量"
        exit 1
    fi
}

# 安装依赖
install_deps() {
    echo "📦 安装依赖..."
    npm install
}

# 构建TypeScript
build_worker() {
    echo "🔨 构建 Worker..."
    npm run build
}

# 设置Secrets
setup_secrets() {
    echo "🔐 设置 Secrets..."
    
    # 检查是否已经设置过secrets
    if ! wrangler secret list | grep -q "CLOUDFLARE_ACCOUNT_ID"; then
        echo "$CLOUDFLARE_ACCOUNT_ID" | wrangler secret put CLOUDFLARE_ACCOUNT_ID
    fi
    
    if [ -n "$R2_ACCESS_KEY_ID" ] && ! wrangler secret list | grep -q "R2_ACCESS_KEY_ID"; then
        echo "$R2_ACCESS_KEY_ID" | wrangler secret put R2_ACCESS_KEY_ID
    fi
    
    if [ -n "$R2_SECRET_ACCESS_KEY" ] && ! wrangler secret list | grep -q "R2_SECRET_ACCESS_KEY"; then
        echo "$R2_SECRET_ACCESS_KEY" | wrangler secret put R2_SECRET_ACCESS_KEY
    fi
    
    if [ -n "$R2_BUCKET_NAME" ] && ! wrangler secret list | grep -q "R2_BUCKET_NAME"; then
        echo "$R2_BUCKET_NAME" | wrangler secret put R2_BUCKET_NAME
    fi
    
    if [ -n "$R2_PUBLIC_DOMAIN" ] && ! wrangler secret list | grep -q "R2_PUBLIC_DOMAIN"; then
        echo "$R2_PUBLIC_DOMAIN" | wrangler secret put R2_PUBLIC_DOMAIN
    fi
}

# 部署Worker
deploy_worker() {
    echo "🚀 部署 Worker..."
    wrangler deploy
}

# 测试部署
test_deployment() {
    echo "🧪 测试部署..."
    
    # 获取Worker URL
    WORKER_URL=$(wrangler subdomain 2>/dev/null || echo "https://waveshift-audio-segment-worker.$CLOUDFLARE_ACCOUNT_ID.workers.dev")
    
    # 测试健康检查
    echo "测试健康检查: $WORKER_URL/health"
    curl -f "$WORKER_URL/health" > /dev/null
    
    if [ $? -eq 0 ]; then
        echo "✅ 健康检查通过"
    else
        echo "❌ 健康检查失败"
        exit 1
    fi
}

# 主函数
main() {
    check_env
    install_deps
    build_worker
    setup_secrets
    deploy_worker
    test_deployment
    
    echo "🎉 部署完成！"
    echo "🌐 服务地址: https://waveshift-audio-segment-worker.$CLOUDFLARE_ACCOUNT_ID.workers.dev"
    echo "🔍 查看日志: wrangler tail"
}

# 运行主函数
main "$@"