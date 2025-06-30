import { Env } from '../types/env.d';

// 基于前端 schema-media.ts 的类型定义
export interface TranscriptionSegment {
  sequence: number;
  start: string;
  end: string;
  contentType: 'speech' | 'singing' | 'non_speech_human_vocalizations' | 'non_human_sounds';
  speaker: string;
  original: string;
  translation: string;
}

export interface TranscriptionMetadata {
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  startTime: string;
  model?: string;
  duration?: number;
  totalSegments: number;
}

/**
 * 更新媒体任务状态
 */
export async function updateMediaTaskStatus(
  env: Env,
  taskId: string,
  status: 'pending_upload' | 'uploading' | 'separating' | 'transcribing' | 'completed' | 'failed',
  progress?: number
): Promise<void> {
  const now = new Date().getTime();
  
  if (progress !== undefined) {
    await env.DB.prepare(`
      UPDATE media_tasks 
      SET status = ?, progress = ?, updatedAt = ? 
      WHERE id = ?
    `).bind(status, progress, now, taskId).run();
  } else {
    await env.DB.prepare(`
      UPDATE media_tasks 
      SET status = ?, updatedAt = ? 
      WHERE id = ?
    `).bind(status, now, taskId).run();
  }
}

/**
 * 更新媒体任务的音视频 URL
 */
export async function updateMediaTaskUrls(
  env: Env,
  taskId: string,
  audioUrl: string,
  videoUrl: string
): Promise<void> {
  const now = new Date().getTime();
  
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET audioUrl = ?, videoUrl = ?, updatedAt = ? 
    WHERE id = ?
  `).bind(audioUrl, videoUrl, now, taskId).run();
}

/**
 * 创建转录任务
 */
export async function createTranscription(
  env: Env,
  taskId: string,
  targetLanguage: string,
  style: string,
  metadata?: Partial<TranscriptionMetadata>
): Promise<string> {
  const transcriptionId = crypto.randomUUID();
  const now = new Date().getTime();
  
  await env.DB.prepare(`
    INSERT INTO transcriptions 
    (id, taskId, targetLanguage, style, fileName, fileSize, mimeType, totalSegments, duration, startTime, createdAt) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    transcriptionId,
    taskId,
    targetLanguage,
    style,
    metadata?.fileName || null,
    metadata?.fileSize || null,
    metadata?.mimeType || null,
    metadata?.totalSegments || 0,
    metadata?.duration || null,
    metadata?.startTime || new Date().toISOString(),
    now
  ).run();
  
  // 更新 media_tasks 表的 transcriptionId
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET transcriptionId = ?, updatedAt = ? 
    WHERE id = ?
  `).bind(transcriptionId, now, taskId).run();
  
  return transcriptionId;
}

/**
 * 存储转录结果到前端表结构
 */
export async function storeTranscriptionResult(
  env: Env,
  transcriptionId: string,
  transcriptionData: {
    segments: TranscriptionSegment[];
    metadata?: TranscriptionMetadata;
    totalSegments: number;
  }
): Promise<void> {
  const now = new Date().getTime();
  
  // 更新转录任务的总片段数
  await env.DB.prepare(`
    UPDATE transcriptions 
    SET totalSegments = ?, endTime = ? 
    WHERE id = ?
  `).bind(transcriptionData.totalSegments, new Date().toISOString(), transcriptionId).run();
  
  // 批量插入转录片段
  for (const segment of transcriptionData.segments) {
    await env.DB.prepare(`
      INSERT INTO transcription_segments 
      (transcriptionId, sequence, start, end, contentType, speaker, original, translation, createdAt) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transcriptionId,
      segment.sequence,
      segment.start,
      segment.end,
      segment.contentType,
      segment.speaker,
      segment.original,
      segment.translation,
      now
    ).run();
  }
}

/**
 * 获取媒体任务信息
 */
export async function getMediaTask(
  env: Env,
  taskId: string
): Promise<any | null> {
  const result = await env.DB.prepare(`
    SELECT * FROM media_tasks WHERE id = ?
  `).bind(taskId).first();
  
  return result;
}

/**
 * 获取转录结果
 */
export async function getTranscriptionResult(
  env: Env,
  taskId: string
): Promise<{ task: any; transcription: any; segments: TranscriptionSegment[] } | null> {
  // 获取媒体任务信息
  const task = await env.DB.prepare(`
    SELECT * FROM media_tasks WHERE id = ?
  `).bind(taskId).first();
  
  if (!task || !task.transcriptionId) return null;
  
  // 获取转录任务信息
  const transcription = await env.DB.prepare(`
    SELECT * FROM transcriptions WHERE id = ?
  `).bind(task.transcriptionId).first();
  
  if (!transcription) return null;
  
  // 获取所有转录片段
  const segmentsResult = await env.DB.prepare(`
    SELECT sequence, start, end, contentType, speaker, original, translation
    FROM transcription_segments 
    WHERE transcriptionId = ? 
    ORDER BY sequence ASC
  `).bind(task.transcriptionId).all();
  
  const segments = (segmentsResult.results || []).map((row: any) => ({
    sequence: row.sequence as number,
    start: row.start as string,
    end: row.end as string,
    contentType: row.contentType as 'speech' | 'singing' | 'non_speech_human_vocalizations' | 'non_human_sounds',
    speaker: row.speaker as string,
    original: row.original as string,
    translation: row.translation as string
  }));
  
  return { task, transcription, segments };
}

/**
 * 完成任务处理 - 更新状态和时间
 */
export async function completeMediaTask(
  env: Env,
  taskId: string,
  success: boolean = true
): Promise<void> {
  const now = new Date().getTime();
  const status = success ? 'completed' : 'failed';
  const progress = success ? 100 : 0;
  
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET status = ?, progress = ?, completedAt = ?, updatedAt = ? 
    WHERE id = ?
  `).bind(status, progress, now, now, taskId).run();
}

/**
 * 设置任务错误信息
 */
export async function setMediaTaskError(
  env: Env,
  taskId: string,
  error: string,
  errorDetails?: string
): Promise<void> {
  const now = new Date().getTime();
  
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET status = 'failed', error = ?, errorDetails = ?, updatedAt = ? 
    WHERE id = ?
  `).bind(error, errorDetails || null, now, taskId).run();
}