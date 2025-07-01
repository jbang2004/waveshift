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
  status: 'created' | 'uploading' | 'uploaded' | 'separating' | 'transcribing' | 'completed' | 'failed',
  progress?: number
): Promise<void> {
  if (progress !== undefined) {
    await env.DB.prepare(`
      UPDATE media_tasks 
      SET status = ?, progress = ?
      WHERE id = ?
    `).bind(status, progress, taskId).run();
  } else {
    await env.DB.prepare(`
      UPDATE media_tasks 
      SET status = ?
      WHERE id = ?
    `).bind(status, taskId).run();
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
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET audio_path = ?, video_path = ?
    WHERE id = ?
  `).bind(audioUrl, videoUrl, taskId).run();
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
  const now = Date.now();
  
  await env.DB.prepare(`
    INSERT INTO transcriptions 
    (id, task_id, target_language, style, total_segments, duration_ms, created_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    transcriptionId,
    taskId,
    targetLanguage,
    style,
    metadata?.totalSegments || 0,
    metadata?.duration || null,
    now
  ).run();
  
  // 更新 media_tasks 表的 transcription_id
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET transcription_id = ?
    WHERE id = ?
  `).bind(transcriptionId, taskId).run();
  
  return transcriptionId;
}

/**
 * 存储转录结果到前端表结构
 */
export async function storeTranscriptionResult(
  env: Env,
  transcriptionId: string,
  transcriptionData: {
    segments: any[];
    metadata?: TranscriptionMetadata;
    totalSegments: number;
  }
): Promise<void> {
  const now = Date.now();
  
  // 更新转录任务的总片段数和处理时间
  const transcription = await env.DB.prepare(`SELECT created_at FROM transcriptions WHERE id = ?`).bind(transcriptionId).first();
  const processingTime = transcription ? now - transcription.created_at : 0;
  
  await env.DB.prepare(`
    UPDATE transcriptions 
    SET total_segments = ?, processing_time_ms = ?
    WHERE id = ?
  `).bind(transcriptionData.totalSegments, processingTime, transcriptionId).run();
  
  // 批量插入转录片段
  for (const segment of transcriptionData.segments) {
    await env.DB.prepare(`
      INSERT INTO transcription_segments 
      (transcription_id, sequence, start_ms, end_ms, content_type, speaker, original_text, translated_text) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transcriptionId,
      segment.sequence,
      parseInt(segment.start_ms) || 0,
      parseInt(segment.end_ms) || 0,
      segment.content_type || 'speech',
      segment.speaker,
      segment.original_text,
      segment.translated_text
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
  
  if (!task || !task.transcription_id) return null;
  
  // 获取转录任务信息
  const transcription = await env.DB.prepare(`
    SELECT * FROM transcriptions WHERE id = ?
  `).bind(task.transcription_id).first();
  
  if (!transcription) return null;
  
  // 获取所有转录片段
  const segmentsResult = await env.DB.prepare(`
    SELECT sequence, start_ms, end_ms, content_type, speaker, original_text, translated_text
    FROM transcription_segments 
    WHERE transcription_id = ? 
    ORDER BY sequence ASC
  `).bind(task.transcription_id).all();
  
  const segments = (segmentsResult.results || []).map((row: any) => ({
    sequence: row.sequence as number,
    start: String(row.start_ms),
    end: String(row.end_ms),
    contentType: row.content_type as 'speech' | 'singing' | 'non_speech_human_vocalizations' | 'non_human_sounds',
    speaker: row.speaker as string,
    original: row.original_text as string,
    translation: row.translated_text as string
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
  const now = Date.now();
  const status = success ? 'completed' : 'failed';
  const progress = success ? 100 : 0;
  
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET status = ?, progress = ?, completed_at = ?
    WHERE id = ?
  `).bind(status, progress, now, taskId).run();
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
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET status = 'failed', error_message = ?, error_details = ?
    WHERE id = ?
  `).bind(error, errorDetails || null, taskId).run();
}