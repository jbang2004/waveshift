-- Separate Worker 转录服务数据库架构
-- 支持音视频分离后的自动转录功能

-- 转录任务表
CREATE TABLE transcription_tasks (
    id TEXT PRIMARY KEY,                    -- 工作流实例ID
    status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
    audio_url TEXT NOT NULL,               -- 分离后的音频文件URL
    video_url TEXT NOT NULL,               -- 分离后的视频文件URL
    user_id TEXT,                          -- 用户ID（可选，用于多用户场景）
    created_at TEXT NOT NULL,              -- 创建时间
    updated_at TEXT NOT NULL,              -- 更新时间
    completed_at TEXT                      -- 完成时间（仅完成状态时有值）
);

-- 转录结果表
CREATE TABLE transcription_results (
    task_id TEXT PRIMARY KEY,              -- 关联转录任务ID
    result TEXT NOT NULL,                  -- 转录结果JSON数据
    metadata TEXT NOT NULL,               -- 元数据JSON（包含处理信息）
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES transcription_tasks(id) ON DELETE CASCADE
);

-- 性能优化索引
CREATE INDEX idx_tasks_status ON transcription_tasks(status);
CREATE INDEX idx_tasks_user ON transcription_tasks(user_id);
CREATE INDEX idx_tasks_created ON transcription_tasks(created_at);
CREATE INDEX idx_results_created ON transcription_results(created_at);

-- 插入示例数据（用于测试）
-- INSERT INTO transcription_tasks (
--     id, status, audio_url, video_url, created_at, updated_at
-- ) VALUES (
--     'test-task-001',
--     'processing',
--     'https://separate.waveshift.net/audio/test-audio.aac',
--     'https://separate.waveshift.net/videos/test-video.mp4',
--     datetime('now'),
--     datetime('now')
-- );