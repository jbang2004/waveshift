-- 数据库迁移：修复媒体任务状态管理
-- 执行命令：npx wrangler d1 execute DB --local --file=db-migration-media-schema-fix.sql

-- 添加转录关联字段（如果不存在）
ALTER TABLE media_tasks ADD COLUMN transcription_id TEXT;

-- 更新现有任务的状态（如果需要）
-- 将所有 'pending_upload' 状态改为 'created'
UPDATE media_tasks SET status = 'created' WHERE status = 'pending_upload';

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_media_transcription ON media_tasks(transcription_id);

-- 验证数据完整性
SELECT 
  status,
  COUNT(*) as count
FROM media_tasks 
GROUP BY status;