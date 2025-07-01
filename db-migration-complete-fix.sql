-- 完整数据库结构修复迁移
-- 执行命令：npx wrangler d1 execute DB --local --file=db-migration-complete-fix.sql

-- 1. 创建transcription_segments表（如果不存在）
CREATE TABLE IF NOT EXISTS transcription_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'speech',
  speaker TEXT,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  FOREIGN KEY (transcription_id) REFERENCES transcriptions(id)
);

-- 2. 创建必要的索引
CREATE INDEX IF NOT EXISTS idx_segments_lookup ON transcription_segments(transcription_id, sequence);
CREATE INDEX IF NOT EXISTS idx_segments_time ON transcription_segments(transcription_id, start_ms, end_ms);
CREATE INDEX IF NOT EXISTS idx_transcriptions_task ON transcriptions(task_id);
CREATE INDEX IF NOT EXISTS idx_media_user_status ON media_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_media_workflow ON media_tasks(workflow_id);
CREATE INDEX IF NOT EXISTS idx_media_transcription ON media_tasks(transcription_id);

-- 3. 验证表结构
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;

-- 4. 验证关键字段
PRAGMA table_info(media_tasks);
PRAGMA table_info(transcriptions);
PRAGMA table_info(transcription_segments);