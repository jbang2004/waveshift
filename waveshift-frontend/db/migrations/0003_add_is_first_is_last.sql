-- 添加 is_first 和 is_last 字段到 transcription_segments 表
ALTER TABLE `transcription_segments` ADD `is_first` integer NOT NULL DEFAULT 0;
ALTER TABLE `transcription_segments` ADD `is_last` integer NOT NULL DEFAULT 0;