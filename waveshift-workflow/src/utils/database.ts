import { Env } from '../types/env.d';


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
 * 更新媒体任务的音视频路径（相对路径）
 */
export async function updateMediaTaskUrls(
  env: Env,
  taskId: string,
  audioPath: string,
  videoPath: string
): Promise<void> {
  await env.DB.prepare(`
    UPDATE media_tasks 
    SET audio_path = ?, video_path = ?
    WHERE id = ?
  `).bind(audioPath, videoPath, taskId).run();
}

/**
 * 创建转录任务
 */
export async function createTranscription(
  env: Env,
  taskId: string,
  targetLanguage: string,
  style: string,
  metadata?: {
    startTime?: string;
    duration?: number;
    totalSegments?: number;
  }
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
 * 更新转录记录的总片段数和处理时间
 * 
 * @param env 环境变量
 * @param transcriptionId 转录ID
 * @param totalSegments 总片段数
 */
export async function updateTranscriptionTotalSegments(
  env: Env, 
  transcriptionId: string, 
  totalSegments: number
): Promise<void> {
  try {
    const processingEndTime = Date.now();
    
    await env.DB.prepare(`
      UPDATE transcriptions 
      SET total_segments = ?, processing_time_ms = ?
      WHERE id = ?
    `).bind(totalSegments, processingEndTime, transcriptionId).run();
    
    console.log(`✅ 更新转录记录: ID=${transcriptionId}, 总片段数=${totalSegments}`);
  } catch (error) {
    console.error(`❌ 更新转录记录失败: ID=${transcriptionId}, 错误:`, error);
    throw error;
  }
}

/**
 * 存储单个转录片段到数据库
 * 
 * @param env 环境变量
 * @param transcriptionId 转录ID
 * @param segment 转录片段
 * @param finalSequence 最终序列号
 */
export async function storeTranscriptionSegment(
  env: Env,
  transcriptionId: string,
  segment: {
    start_ms: number;
    end_ms: number;
    content_type: string;
    speaker: string;
    original: string;
    translation: string;
    is_first?: boolean;
    is_last?: boolean;
  },
  finalSequence: number
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO transcription_segments 
      (transcription_id, sequence, start_ms, end_ms, content_type, speaker, original, translation, is_first, is_last) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      transcriptionId,
      finalSequence,
      segment.start_ms,
      segment.end_ms,
      segment.content_type,
      segment.speaker,
      segment.original,
      segment.translation,
      segment.is_first ? 1 : 0,
      segment.is_last ? 1 : 0
    ).run();
    
    console.log(`✅ 存储片段到D1: sequence=${finalSequence}, 说话人=${segment.speaker}, 时长=${segment.end_ms - segment.start_ms}ms, is_first=${segment.is_first}, is_last=${segment.is_last}`);
  } catch (error) {
    console.error(`❌ 存储片段失败: sequence=${finalSequence}, 错误:`, error);
    throw error;
  }
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

/**
 * 标记转录的最后一个片段
 * 
 * @param env 环境变量
 * @param transcriptionId 转录ID
 */
export async function markLastTranscriptionSegment(
  env: Env,
  transcriptionId: string
): Promise<void> {
  try {
    // 更新最后一个片段的 is_last 标记
    const result = await env.DB.prepare(`
      UPDATE transcription_segments 
      SET is_last = 1 
      WHERE transcription_id = ? 
      AND sequence = (
        SELECT MAX(sequence) 
        FROM transcription_segments 
        WHERE transcription_id = ?
      )
    `).bind(transcriptionId, transcriptionId).run();
    
    console.log(`✅ 标记最后片段完成: transcription_id=${transcriptionId}, 更新行数=${result.changes}`);
  } catch (error) {
    console.error(`❌ 标记最后片段失败: transcription_id=${transcriptionId}, 错误:`, error);
    throw error;
  }
}