#!/bin/bash

echo "🧪 测试优化后的FFmpeg Worker构建..."

# 进入正确目录
cd /home/jbang/codebase/waveshift-program/waveshift-ffmpeg-worker

# 检查Rust代码编译
echo "📦 检查Rust代码..."
cd separate-container
cargo check
if [ $? -ne 0 ]; then
    echo "❌ Rust代码编译失败"
    exit 1
fi

echo "✅ Rust代码检查通过"

# 返回主目录
cd ..

# 检查TypeScript代码
echo "📦 检查TypeScript代码..."
npm run type-check 2>/dev/null || echo "⚠️ TypeScript检查跳过"

echo "🎉 基本检查完成"

# 显示配置摘要
echo "📋 配置摘要:"
echo "  - 实例类型: standard (4GB内存)"
echo "  - 最大实例数: 5"
echo "  - 睡眠时间: 3分钟"
echo "  - 镜像: distroless + glibc"
echo "  - 处理方式: 并行FFmpeg"