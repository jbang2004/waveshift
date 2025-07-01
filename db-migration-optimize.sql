-- WaveShift 数据库优化迁移脚本
-- 执行前请确保已备份数据

-- 1. 删除遗留表
DROP TABLE IF EXISTS sentences;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS videos;

-- 2. 优化 media_tasks 表
-- 2.1 备份原表
ALTER TABLE media_tasks RENAME TO media_tasks_backup;

-- 2.2 创建新表结构
CREATE TABLE media_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  
  -- 核心状态
  status TEXT NOT NULL,  -- created|uploading|processing|completed|failed
  progress INTEGER DEFAULT 0,
  
  -- 文件信息（使用统一路径）
  file_path TEXT NOT NULL,        -- users/{userId}/{taskId}/original.{ext}
  file_name TEXT NOT NULL,        -- 用户原始文件名（仅展示用）
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,        -- video/mp4, audio/mp3 等
  
  -- 处理配置
  target_language TEXT DEFAULT 'chinese',  -- chinese|english
  translation_style TEXT DEFAULT 'normal',  -- normal|classical
  
  -- 处理结果路径（相对路径）
  audio_path TEXT,                -- audio.aac
  video_path TEXT,                -- video.mp4
  
  -- 工作流管理
  workflow_id TEXT,
  workflow_status TEXT,
  
  -- 错误处理
  error_message TEXT,
  error_details TEXT,
  
  -- 时间戳
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 2.3 迁移数据
INSERT INTO media_tasks 
SELECT 
  id,
  userId as user_id,
  status,
  progress,
  uploadUrl as file_path,
  fileName as file_name,
  fileSize as file_size,
  mimeType as file_type,
  'chinese' as target_language,
  'normal' as translation_style,
  CASE WHEN audioUrl IS NOT NULL THEN 'audio.aac' END as audio_path,
  CASE WHEN videoUrl IS NOT NULL THEN 'video.mp4' END as video_path,
  workflowId as workflow_id,
  workflowStatus as workflow_status,
  error as error_message,
  errorDetails as error_details,
  createdAt as created_at,
  startedAt as started_at,
  completedAt as completed_at
FROM media_tasks_backup
WHERE id IS NOT NULL;

-- 2.4 创建索引
CREATE INDEX idx_media_user_status ON media_tasks(user_id, status);
CREATE INDEX idx_media_created ON media_tasks(created_at DESC);
CREATE INDEX idx_media_workflow ON media_tasks(workflow_id) WHERE workflow_id IS NOT NULL;

-- 3. 优化 transcriptions 表
-- 3.1 备份原表
ALTER TABLE transcriptions RENAME TO transcriptions_backup;

-- 3.2 创建新表结构
CREATE TABLE transcriptions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  
  -- 语言配置
  source_language TEXT,          -- 自动检测的源语言
  target_language TEXT NOT NULL,
  style TEXT NOT NULL,
  
  -- AI模型信息
  model_name TEXT,               -- gemini-1.5-pro 等
  model_provider TEXT DEFAULT 'gemini',
  
  -- 统计信息
  total_segments INTEGER NOT NULL,
  duration_ms INTEGER,           -- 音频时长（毫秒）
  
  -- 处理时间
  created_at INTEGER NOT NULL,
  processing_time_ms INTEGER,    -- 处理耗时
  
  FOREIGN KEY (task_id) REFERENCES media_tasks(id) ON DELETE CASCADE
);

-- 3.3 迁移数据
INSERT INTO transcriptions 
SELECT 
  id,
  taskId as task_id,
  NULL as source_language,
  targetLanguage as target_language,
  style,
  model as model_name,
  'gemini' as model_provider,
  totalSegments as total_segments,
  duration as duration_ms,
  createdAt as created_at,
  NULL as processing_time_ms
FROM transcriptions_backup
WHERE id IS NOT NULL;

-- 3.4 创建索引
CREATE INDEX idx_transcriptions_task ON transcriptions(task_id);

-- 4. 优化 transcription_segments 表
-- 4.1 备份原表
ALTER TABLE transcription_segments RENAME TO transcription_segments_backup;

-- 4.2 创建新表结构
CREATE TABLE transcription_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transcription_id TEXT NOT NULL,
  
  -- 序号和时间（简化格式）
  sequence INTEGER NOT NULL,
  start_ms INTEGER NOT NULL,      -- 毫秒时间戳
  end_ms INTEGER NOT NULL,
  
  -- 内容
  content_type TEXT NOT NULL,     -- speech|music|silence|other
  speaker TEXT,                   -- 说话人标识
  
  -- 文本
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  
  FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
);

-- 4.3 迁移数据（需要转换时间格式的函数）
-- 创建一个临时函数来转换时间格式 "0m1s682ms" -> 毫秒数
-- SQLite 不支持存储过程，所以需要在应用层处理或使用以下简化方案
INSERT INTO transcription_segments
SELECT 
  id,
  transcriptionId as transcription_id,
  sequence,
  -- 暂时使用0作为占位符，后续通过应用层更新
  0 as start_ms,
  0 as end_ms,
  contentType as content_type,
  speaker,
  original as original_text,
  translation as translated_text
FROM transcription_segments_backup
WHERE transcriptionId IS NOT NULL;

-- 4.4 创建复合索引
CREATE INDEX idx_segments_lookup ON transcription_segments(transcription_id, sequence);
CREATE INDEX idx_segments_time ON transcription_segments(transcription_id, start_ms, end_ms);

-- 5. 清理备份表（在确认数据正确后执行）
-- DROP TABLE media_tasks_backup;
-- DROP TABLE transcriptions_backup;
-- DROP TABLE transcription_segments_backup;

-- 6. 验证数据完整性
SELECT 'media_tasks' as table_name, COUNT(*) as count FROM media_tasks
UNION ALL
SELECT 'transcriptions', COUNT(*) FROM transcriptions
UNION ALL
SELECT 'transcription_segments', COUNT(*) FROM transcription_segments;