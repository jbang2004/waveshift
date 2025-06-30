// 媒体处理相关的数据库表结构
import { integer, text, sqliteTable, index } from 'drizzle-orm/sqlite-core';
import { users, videos } from './schema';

// 媒体任务表 - 统一管理所有媒体处理任务
export const mediaTasks = sqliteTable('media_tasks', {
  id: text('id').notNull().primaryKey(), // UUID
  userId: text('userId').notNull().references(() => users.id),
  videoId: integer('videoId').references(() => videos.id),
  
  // 任务状态
  status: text('status').notNull(), // 'pending_upload', 'uploading', 'separating', 'transcribing', 'completed', 'failed'
  progress: integer('progress').default(0), // 0-100
  
  // 上传信息
  uploadUrl: text('uploadUrl'),
  uploadId: text('uploadId'), // 分块上传ID
  fileSize: integer('fileSize'),
  fileName: text('fileName'),
  mimeType: text('mimeType'),
  
  // 工作流信息
  workflowId: text('workflowId'),
  workflowStatus: text('workflowStatus'),
  
  // 结果信息
  videoUrl: text('videoUrl'),
  audioUrl: text('audioUrl'),
  transcriptionId: text('transcriptionId'),
  
  // 错误信息
  error: text('error'),
  errorDetails: text('errorDetails'),
  
  // 时间戳 (存储为毫秒时间戳)
  createdAt: integer('createdAt').notNull(),
  startedAt: integer('startedAt'),
  completedAt: integer('completedAt'),
  updatedAt: integer('updatedAt').notNull(),
});

// 转录任务表 - 存储转录任务的元数据
export const transcriptions = sqliteTable('transcriptions', {
  id: text('id').notNull().primaryKey(),
  taskId: text('taskId').notNull().references(() => mediaTasks.id),
  
  // 转录配置
  targetLanguage: text('targetLanguage').notNull(), // 'chinese' | 'english'
  style: text('style').notNull(), // 'normal' | 'classical'
  model: text('model'), // 使用的模型
  
  // 文件信息
  fileName: text('fileName'),
  fileSize: integer('fileSize'),
  mimeType: text('mimeType'),
  
  // 统计信息
  totalSegments: integer('totalSegments').notNull(),
  duration: integer('duration'), // 总时长（毫秒）
  
  // 处理信息
  startTime: text('startTime'), // ISO 时间字符串
  endTime: text('endTime'), // ISO 时间字符串
  
  createdAt: integer('createdAt').notNull(),
});

// 转录片段表 - 存储每个转录片段（基于 Gemini 的输出格式）
export const transcriptionSegments = sqliteTable('transcription_segments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  transcriptionId: text('transcriptionId').notNull().references(() => transcriptions.id),
  
  // 基于 TranscriptionSegment 接口的字段
  sequence: integer('sequence').notNull(), // 序列号，从1开始
  start: text('start').notNull(), // 格式: "0m1s682ms"
  end: text('end').notNull(), // 格式: "0m3s245ms"
  
  // 内容类型（基于 content_type enum）
  contentType: text('contentType').notNull(), // 'speech' | 'singing' | 'non_speech_human_vocalizations' | 'non_human_sounds'
  
  // 说话人识别
  speaker: text('speaker').notNull(), // 真实姓名、职称或 "Speaker A/B/C"、"N/A"
  
  // 内容
  original: text('original').notNull(), // 原始语言内容
  translation: text('translation').notNull(), // 翻译后的内容
  
  // 元数据
  createdAt: integer('createdAt').notNull(),
});

// 添加索引到表定义中
export const mediaTaskUserIdIdx = index('media_task_user_id_idx').on(mediaTasks.userId);
export const mediaTaskStatusIdx = index('media_task_status_idx').on(mediaTasks.status);
export const mediaTaskWorkflowIdIdx = index('media_task_workflow_id_idx').on(mediaTasks.workflowId);

export const transcriptionTaskIdIdx = index('transcription_task_id_idx').on(transcriptions.taskId);

export const segmentTranscriptionIdIdx = index('segment_transcription_id_idx').on(transcriptionSegments.transcriptionId);
export const segmentSequenceIdx = index('segment_sequence_idx').on(transcriptionSegments.transcriptionId, transcriptionSegments.sequence);

// 类型定义
export type MediaTask = typeof mediaTasks.$inferSelect;
export type NewMediaTask = typeof mediaTasks.$inferInsert;
export type Transcription = typeof transcriptions.$inferSelect;
export type NewTranscription = typeof transcriptions.$inferInsert;
export type TranscriptionSegment = typeof transcriptionSegments.$inferSelect;
export type NewTranscriptionSegment = typeof transcriptionSegments.$inferInsert;