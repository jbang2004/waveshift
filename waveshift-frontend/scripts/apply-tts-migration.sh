#!/bin/bash

# 应用TTS字段迁移脚本
# 为transcription_segments表添加TTS相关字段

echo "🔄 开始应用TTS字段迁移..."

# 检查迁移文件是否存在
MIGRATION_FILE="./db/migrations/0004_add_tts_fields.sql"
if [ ! -f "$MIGRATION_FILE" ]; then
    echo "❌ 迁移文件不存在: $MIGRATION_FILE"
    exit 1
fi

echo "📄 找到迁移文件: $MIGRATION_FILE"

# 应用到本地D1数据库
echo "🔄 应用到本地D1数据库..."
npx wrangler d1 execute DB --local --file="$MIGRATION_FILE"

if [ $? -eq 0 ]; then
    echo "✅ 本地D1数据库迁移成功"
else
    echo "❌ 本地D1数据库迁移失败"
    exit 1
fi

# 询问是否应用到远程数据库
echo ""
read -p "是否也要应用到远程D1数据库? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🔄 应用到远程D1数据库..."
    npx wrangler d1 execute DB --remote --file="$MIGRATION_FILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ 远程D1数据库迁移成功"
    else
        echo "❌ 远程D1数据库迁移失败"
        exit 1
    fi
else
    echo "⏭️ 跳过远程数据库迁移"
fi

echo ""
echo "🎉 TTS字段迁移完成！"
echo ""
echo "📋 已添加的字段："
echo "   - tts_audio_key: TTS音频文件路径"
echo "   - tts_status: TTS处理状态"
echo "   - tts_duration_ms: TTS音频时长"
echo "   - tts_processing_time_ms: TTS处理耗时"
echo "   - tts_error: TTS错误信息"
echo "   - audio_key: 音频片段路径"
echo ""
echo "📋 已创建的索引："
echo "   - idx_segments_tts_ready: TTS监听器轮询优化"
echo "   - idx_segments_tts_progress: TTS进度查询优化"
echo "   - idx_segments_tts_audio: TTS音频查询优化"
echo ""
echo "✨ 现在可以使用流式TTS功能了！"