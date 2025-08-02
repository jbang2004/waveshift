#!/bin/bash
# FC降噪服务部署脚本
# 基于ModelScope ZipEnhancer模型

echo "🚀 部署FC降噪服务"
echo "📊 特性：30行代码实现，本地模型，11x实时处理速度"

# 镜像信息
IMAGE_NAME="fc-denoise"
IMAGE_TAG="v5.0-minimal-local"
FULL_IMAGE="crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/${IMAGE_NAME}:${IMAGE_TAG}"

# 1. 构建Docker镜像
echo ""
echo "🔨 构建Docker镜像..."
docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .

if [ $? -ne 0 ]; then
    echo "❌ Docker构建失败"
    exit 1
fi

echo "✅ 镜像构建成功"

# 2. 标记镜像
echo ""
echo "🏷️ 标记镜像..."
docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${FULL_IMAGE}

# 3. 登录ACR
echo ""
echo "🔐 登录阿里云容器镜像服务..."
docker login crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com \
    -u aliyun0518007542 \
    -p 13318251863jbang

if [ $? -ne 0 ]; then
    echo "❌ ACR登录失败"
    exit 1
fi

# 4. 推送镜像
echo ""
echo "📤 推送镜像到ACR..."
docker push ${FULL_IMAGE}

if [ $? -ne 0 ]; then
    echo "❌ 镜像推送失败"
    exit 1
fi

echo "✅ 镜像推送成功"

# 5. 部署函数
echo ""
echo "🚀 部署函数到FC..."
s deploy -y

if [ $? -ne 0 ]; then
    echo "❌ 函数部署失败"
    exit 1
fi

echo ""
echo "🎉 FC降噪服务部署完成！"
echo ""
echo "📊 部署信息："
echo "   - 镜像: ${FULL_IMAGE}"
echo "   - 代码: 30行实现"
echo "   - 模型: 本地加载"
echo "   - 性能: 11x实时处理速度"
echo ""
echo "🧪 测试命令："
echo "curl -X POST 'https://fc-deno-service-ppbixyajpa.ap-southeast-1.fcapp.run/' \\"
echo "  -H 'Content-Type: audio/wav' \\"
echo "  --data-binary @test/test_audio.wav \\"
echo "  --output denoised.wav"