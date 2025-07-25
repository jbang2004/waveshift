-- 为 transcription_segments 表添加 audio_key 字段
ALTER TABLE transcription_segments ADD COLUMN audio_key TEXT;

-- 创建轮询优化索引
CREATE INDEX IF NOT EXISTS idx_segments_polling 
ON transcription_segments(transcription_id, sequence);

-- 创建 audio_key 更新优化索引
CREATE INDEX IF NOT EXISTS idx_segments_audio_update 
ON transcription_segments(transcription_id, sequence, audio_key);