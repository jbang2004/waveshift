// 媒体处理相关的数据库表结构
import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';
import { users } from './schema';

// 媒体任务表 - 统一管理所有媒体处理任务（优化后的结构）
export const mediaTasks = sqliteTable('media_tasks', {
  id: text('id').notNull().primaryKey(), // UUID
  user_id: text('user_id').notNull().references(() => users.id),
  
  // 核心状态
  status: text('status').notNull(), // 'created', 'uploading', 'uploaded', 'processing', 'separating', 'transcribing', 'completed', 'failed'
  progress: integer('progress').default(0), // 0-100
  
  // 文件信息（使用统一路径）
  file_path: text('file_path').notNull(), // users/{userId}/{taskId}/original.{ext}
  file_name: text('file_name').notNull(), // 用户原始文件名（仅展示用）
  file_size: integer('file_size').notNull(),
  file_type: text('file_type').notNull(), // video/mp4, audio/mp3 等
  
  // 处理配置
  target_language: text('target_language').default('chinese'), // chinese|english
  translation_style: text('translation_style').default('normal'), // normal|classical
  
  // 处理结果路径（相对路径）
  audio_path: text('audio_path'), // audio.aac
  video_path: text('video_path'), // video.mp4
  
  // 工作流管理
  workflow_id: text('workflow_id'),
  workflow_status: text('workflow_status'),
  
  // 转录关联
  transcription_id: text('transcription_id'),
  
  // 错误处理
  error_message: text('error_message'),
  error_details: text('error_details'),
  
  // 时间戳
  created_at: integer('created_at').notNull(),
  started_at: integer('started_at'),
  completed_at: integer('completed_at'),
});

// 转录任务表 - 存储转录任务的元数据（优化后的结构）
export const transcriptions = sqliteTable('transcriptions', {
  id: text('id').notNull().primaryKey(),
  task_id: text('task_id').notNull().references(() => mediaTasks.id),
  
  // 语言配置
  source_language: text('source_language'), // 自动检测的源语言
  target_language: text('target_language').notNull(), // chinese|english
  style: text('style').notNull(), // normal|classical
  
  // AI模型信息
  model_name: text('model_name'), // gemini-1.5-pro 等
  model_provider: text('model_provider').default('gemini'),
  
  // 统计信息
  total_segments: integer('total_segments').notNull(),
  duration_ms: integer('duration_ms'), // 音频时长（毫秒）
  
  // 处理时间
  created_at: integer('created_at').notNull(),
  processing_time_ms: integer('processing_time_ms'), // 处理耗时
});

// 转录片段表 - 存储每个转录片段（优化后的结构）
export const transcriptionSegments = sqliteTable('transcription_segments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transcription_id: text('transcription_id').notNull().references(() => transcriptions.id),
  
  // 序号和时间（简化格式）
  sequence: integer('sequence').notNull(), // 序列号，从1开始
  start_ms: integer('start_ms').notNull(), // 毫秒时间戳
  end_ms: integer('end_ms').notNull(), // 毫秒时间戳
  
  // 内容
  content_type: text('content_type').notNull(), // speech|music|silence|other
  speaker: text('speaker'), // 说话人标识
  
  // 文本
  original_text: text('original_text').notNull(), // 原始语言内容
  translated_text: text('translated_text').notNull(), // 翻译后的内容
});

// 添加索引到表定义中
export const mediaTaskUserIdIdx = index('idx_media_user_status').on(mediaTasks.user_id, mediaTasks.status);
export const mediaTaskCreatedIdx = index('idx_media_created').on(mediaTasks.created_at);
export const mediaTaskWorkflowIdIdx = index('idx_media_workflow').on(mediaTasks.workflow_id);

export const transcriptionTaskIdIdx = index('idx_transcriptions_task').on(transcriptions.task_id);

export const segmentLookupIdx = index('idx_segments_lookup').on(transcriptionSegments.transcription_id, transcriptionSegments.sequence);
export const segmentTimeIdx = index('idx_segments_time').on(transcriptionSegments.transcription_id, transcriptionSegments.start_ms, transcriptionSegments.end_ms);

// 类型定义
export type MediaTask = typeof mediaTasks.$inferSelect;
export type NewMediaTask = typeof mediaTasks.$inferInsert;
export type Transcription = typeof transcriptions.$inferSelect;
export type NewTranscription = typeof transcriptions.$inferInsert;
export type TranscriptionSegment = typeof transcriptionSegments.$inferSelect;
export type NewTranscriptionSegment = typeof transcriptionSegments.$inferInsert;