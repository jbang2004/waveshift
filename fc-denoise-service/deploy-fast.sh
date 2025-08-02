#!/bin/bash
# FC降噪服务快速部署脚本
# 使用网络加速和并行下载

echo "🚀 快速部署FC降噪服务"
echo "📊 特性：30行代码实现，本地模型，11x实时处理速度"

# 镜像信息
IMAGE_NAME="fc-denoise"
IMAGE_TAG="v5.0-minimal-local"
FULL_IMAGE="crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/${IMAGE_NAME}:${IMAGE_TAG}"

# 1. 构建Docker镜像（使用代理加速）
echo ""
echo "🔨 快速构建Docker镜像..."

# 检查是否有代理
if [ -n "$http_proxy" ] || [ -n "$HTTP_PROXY" ]; then
    echo "📡 使用代理: ${http_proxy:-$HTTP_PROXY}"
    BUILD_ARGS="--build-arg http_proxy=${http_proxy:-$HTTP_PROXY} --build-arg https_proxy=${https_proxy:-$HTTPS_PROXY}"
else
    echo "📡 直连构建"
    BUILD_ARGS=""
fi

# 使用--network host加速
docker build --network host $BUILD_ARGS -t ${IMAGE_NAME}:${IMAGE_TAG} .

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

# 5. 显示部署信息
echo ""
echo "🎉 Docker镜像准备完成！"
echo ""
echo "📊 镜像信息："
echo "   - 镜像地址: ${FULL_IMAGE}"
echo "   - 代码: 30行实现"
echo "   - 模型: 本地加载"
echo ""
echo "📋 下一步："
echo "1. 登录阿里云FC控制台: https://fc3.console.aliyun.com"
echo "2. 更新函数镜像为: ${FULL_IMAGE}"
echo "3. 或使用Serverless Devs部署: s deploy -y"
echo ""
echo "🧪 部署后测试命令："
echo "curl -X GET 'https://fc-deno-service-ppbixyajpa.ap-southeast-1.fcapp.run/health'"
echo "curl -X POST 'https://fc-deno-service-ppbixyajpa.ap-southeast-1.fcapp.run/' \\"
echo "  -H 'Content-Type: audio/wav' \\"
echo "  --data-binary @test/test_audio.wav \\"
echo "  --output denoised.wav"