#!/bin/bash

echo "🔍 数据库结构验证测试"
echo "=========================="

echo ""
echo "📋 生产数据库表列表："
npx wrangler d1 execute DB --remote --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" | grep '"name"'

echo ""
echo "🏗️ media_tasks表结构检查："
echo "查找transcription_id字段："
npx wrangler d1 execute DB --remote --command="PRAGMA table_info(media_tasks);" | grep transcription_id || echo "❌ transcription_id字段不存在"

echo ""  
echo "🏗️ transcriptions表结构检查："
echo "查找task_id字段："
npx wrangler d1 execute DB --remote --command="PRAGMA table_info(transcriptions);" | grep task_id || echo "❌ task_id字段不存在"

echo ""
echo "🏗️ transcription_segments表结构检查："
npx wrangler d1 execute DB --remote --command="SELECT COUNT(*) as segment_table_exists FROM sqlite_master WHERE type='table' AND name='transcription_segments';" | grep segment_table_exists

echo ""
echo "✅ 数据库结构验证完成"