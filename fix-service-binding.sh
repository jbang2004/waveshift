#!/bin/bash

echo "=== 修复 Service Binding 问题 ==="
echo ""

# 设置工作目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "1. 首先部署 ffmpeg-worker（确保 FFmpegWorker entrypoint 可用）"
cd waveshift-ffmpeg-worker

# 添加显式的 entrypoint 导出
echo "检查并修复 index.ts 中的导出..."
if ! grep -q "export { FFmpegWorker }" src/index.ts; then
    echo "添加显式的 FFmpegWorker 导出..."
    # 在文件末尾添加显式导出
    echo "" >> src/index.ts
    echo "// 显式导出 WorkerEntrypoint 供 Service Binding 使用" >> src/index.ts
    echo "export { FFmpegWorker };" >> src/index.ts
fi

echo "构建并部署 ffmpeg-worker..."
npm run build
wrangler deploy --compatibility-date 2025-06-14

echo ""
echo "2. 等待 5 秒让部署生效..."
sleep 5

echo ""
echo "3. 现在重新部署 workflow（使用新的 Service Binding）"
cd ../waveshift-workflow

echo "部署 workflow..."
wrangler deploy --compatibility-date 2025-06-14

echo ""
echo "4. 验证部署状态..."
echo "检查 ffmpeg-worker 健康状态："
curl -s https://waveshift-ffmpeg-worker.jbang20042004.workers.dev/health || echo "健康检查失败"

echo ""
echo "检查容器状态："
curl -s https://waveshift-ffmpeg-worker.jbang20042004.workers.dev/container-status | jq . || echo "容器状态检查失败"

echo ""
echo "=== 修复完成 ==="
echo ""
echo "测试建议："
echo "1. 通过前端上传一个新的视频文件"
echo "2. 检查 workflow 日志确认音视频分离是否成功"
echo "3. 如果仍有问题，可能需要清除 Cloudflare 的部署缓存"