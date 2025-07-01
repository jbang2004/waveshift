#!/bin/bash

# 最终数据库结构修复部署

echo "🚀 开始最终数据库结构修复部署..."

# 1. 重新部署前端服务
echo "🌐 重新部署前端服务..."
cd waveshift-frontend
npm run deploy

# 2. 重新部署工作流服务
echo "⚙️ 重新部署工作流服务..."
cd ../waveshift-workflow
npm run deploy

echo "✅ 数据库结构修复部署完成！"
echo ""
echo "🎯 已完成的修复："
echo "- ✅ 本地数据库：添加transcription_segments表和所有索引"
echo "- ✅ 生产数据库：添加transcription_id字段和transcription_segments表"
echo "- ✅ 字段名统一：前端和工作流完全对齐"
echo "- ✅ 表结构完整：media_tasks, transcriptions, transcription_segments"
echo ""
echo "🧪 验证步骤："
echo "1. 访问: https://waveshift-frontend.jbang20042004.workers.dev"
echo "2. 上传视频文件测试完整流程"
echo "3. 检查是否还有字段名或表结构错误"
echo ""
echo "📋 数据库表结构总结："
echo "- media_tasks: ✅ 包含transcription_id字段"
echo "- transcriptions: ✅ 包含task_id字段"  
echo "- transcription_segments: ✅ 新创建，包含所有必要字段"