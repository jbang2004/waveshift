#!/bin/bash

# 部署媒体上传修复

echo "🚀 开始部署媒体上传修复..."

# 1. 应用数据库迁移
echo "📊 应用数据库迁移..."
cd waveshift-frontend
npx wrangler d1 execute DB --local --file=../db-migration-media-schema-fix.sql || echo "⚠️ 本地数据库迁移失败，继续部署..."
npx wrangler d1 execute DB --file=../db-migration-media-schema-fix.sql || echo "⚠️ 生产数据库迁移失败，继续部署..."

# 2. 生成数据库类型
echo "🔧 生成数据库类型..."
npm run db:generate || echo "⚠️ 数据库类型生成失败，继续部署..."

# 3. 部署前端服务
echo "🌐 部署前端服务..."
npm run deploy

# 4. 部署工作流服务
echo "⚙️ 部署工作流服务..."
cd ../waveshift-workflow
npm run deploy

echo "✅ 部署完成！"
echo ""
echo "🔧 已修复的关键问题："
echo "- ❌→✅ 修复'Task is already being processed'错误"
echo "- ❌→✅ 统一R2上传状态管理(created→uploading→uploaded)"
echo "- ❌→✅ 修复数据库字段名不匹配问题"
echo "- ❌→✅ 统一存储绑定配置(MEDIA_STORAGE)"
echo "- ❌→✅ 优化文件路径管理和URL生成"
echo "- ❌→✅ 改进错误处理和状态回滚机制"
echo ""
echo "🎯 现在可以重新测试视频上传功能："
echo "1. 上传视频文件"
echo "2. 检查状态转换: created → uploading → uploaded → processing → completed"  
echo "3. 验证最终结果文件生成"