-- 生产数据库修复迁移 - 简化版本
-- 执行命令：npx wrangler d1 execute DB --remote --file=db-migration-production-fix.sql

-- 1. 为media_tasks表添加缺失的字段（如果不存在）
ALTER TABLE media_tasks ADD COLUMN transcription_id TEXT;

-- 2. 创建transcription_segments表（如果不存在）
CREATE TABLE IF NOT EXISTS transcription_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'speech',
  speaker TEXT,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL
);

-- 3. 创建基本索引
CREATE INDEX IF NOT EXISTS idx_segments_lookup ON transcription_segments(transcription_id, sequence);
CREATE INDEX IF NOT EXISTS idx_transcriptions_task ON transcriptions(task_id);
CREATE INDEX IF NOT EXISTS idx_media_transcription ON media_tasks(transcription_id);