-- 添加 TTS 相关字段到 transcription_segments 表
-- 支持流式TTS处理和状态跟踪

-- TTS音频文件路径（R2存储键）
ALTER TABLE `transcription_segments` ADD `tts_audio_key` text;

-- TTS处理状态：pending, processing, completed, failed
ALTER TABLE `transcription_segments` ADD `tts_status` text DEFAULT 'pending';

-- TTS生成音频的时长（毫秒）
ALTER TABLE `transcription_segments` ADD `tts_duration_ms` integer;

-- TTS处理耗时（毫秒）
ALTER TABLE `transcription_segments` ADD `tts_processing_time_ms` integer;

-- TTS处理错误信息
ALTER TABLE `transcription_segments` ADD `tts_error` text;

-- 创建TTS相关的优化索引

-- 用于TTS监听器轮询查询
CREATE INDEX IF NOT EXISTS idx_segments_tts_ready 
ON transcription_segments(transcription_id, sequence, audio_key, tts_status);

-- 用于TTS进度查询
CREATE INDEX IF NOT EXISTS idx_segments_tts_progress 
ON transcription_segments(transcription_id, tts_status);

-- 用于TTS音频URL查询
CREATE INDEX IF NOT EXISTS idx_segments_tts_audio 
ON transcription_segments(transcription_id, sequence, tts_audio_key);