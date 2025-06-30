import { type NextRequest } from 'next/server';
import { mediaTasks, transcriptions, transcriptionSegments } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import {
  getCloudflareDB,
  withWorkflowCallback,
  validateRequestData,
  createSuccessResponse,
  ApiError
} from '@/lib/api/common';
import { z } from 'zod';

// 回调数据验证 Schema
const callbackSchema = z.object({
  taskId: z.string().min(1, 'Task ID is required'),
  status: z.enum(['completed', 'failed']),
  result: z.object({
    videoUrl: z.string().url(),
    audioUrl: z.string().url(),
    transcription: z.object({
      targetLanguage: z.string(),
      style: z.string(),
      model: z.string().optional(),
      segments: z.array(z.object({
        sequence: z.number(),
        start: z.string(),
        end: z.string(),
        contentType: z.string(),
        speaker: z.string(),
        original: z.string(),
        translation: z.string(),
      })),
      metadata: z.any().optional(),
    })
  }).optional(),
  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
  }).optional(),
});

type CallbackPayload = z.infer<typeof callbackSchema>;

async function handleWorkflowCallback(request: NextRequest) {
  // 获取数据库连接
  const { db } = await getCloudflareDB();
  
  // 解析和验证回调数据
  const body = await request.json();
  const payload = validateRequestData(body, callbackSchema);
  const { taskId, status, result, error } = payload;
  
  console.log(`收到工作流回调: ${taskId}, 状态: ${status}`);
  
  // 验证任务存在
  const [task] = await db.select()
    .from(mediaTasks)
    .where(eq(mediaTasks.id, taskId))
    .limit(1);
  
  if (!task) {
    throw new ApiError(404, 'Task not found', { taskId });
  }
  
  const now = Date.now();
  
  if (status === 'completed' && result) {
    // 处理成功完成的回调
    await handleCompletedTask(db, taskId, result, now);
  } else if (status === 'failed') {
    // 处理失败的回调
    await handleFailedTask(db, taskId, error, now);
  }
  
  return createSuccessResponse({ taskId, status });
}

async function handleCompletedTask(
  db: any,
  taskId: string,
  result: NonNullable<CallbackPayload['result']>,
  now: number
) {
  // 更新媒体任务状态
  await db.update(mediaTasks)
    .set({
      status: 'completed',
      progress: 100,
      videoUrl: result.videoUrl,
      audioUrl: result.audioUrl,
      completedAt: now,
      updatedAt: now
    })
    .where(eq(mediaTasks.id, taskId));
  
  // 如果有转录结果，创建转录记录
  if (result.transcription && result.transcription.segments.length > 0) {
    await saveTranscriptionResults(db, taskId, result.transcription, now);
  }
}

async function handleFailedTask(
  db: any,
  taskId: string,
  error: CallbackPayload['error'],
  now: number
) {
  await db.update(mediaTasks)
    .set({
      status: 'failed',
      progress: 0,
      error: error?.message || 'Workflow processing failed',
      errorDetails: error?.stack || null,
      updatedAt: now
    })
    .where(eq(mediaTasks.id, taskId));
  
  console.error(`任务失败: ${taskId}, 错误: ${error?.message}`);
}

async function saveTranscriptionResults(
  db: any,
  taskId: string,
  transcription: NonNullable<CallbackPayload['result']>['transcription'],
  now: number
) {
  const transcriptionId = crypto.randomUUID();
  
  // 创建转录记录
  await db.insert(transcriptions).values({
    id: transcriptionId,
    taskId: taskId,
    targetLanguage: transcription.targetLanguage,
    style: transcription.style,
    model: transcription.model,
    totalSegments: transcription.segments.length,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    createdAt: now
  });
  
  // 更新媒体任务的转录ID
  await db.update(mediaTasks)
    .set({
      transcriptionId: transcriptionId,
      updatedAt: now
    })
    .where(eq(mediaTasks.id, taskId));
  
  // 批量插入转录片段
  const segments = transcription.segments.map(segment => ({
    transcriptionId: transcriptionId,
    sequence: segment.sequence,
    start: segment.start,
    end: segment.end,
    contentType: segment.contentType,
    speaker: segment.speaker,
    original: segment.original,
    translation: segment.translation,
    createdAt: now
  }));
  
  // 分批插入以避免单次插入过多数据
  const batchSize = 50;
  for (let i = 0; i < segments.length; i += batchSize) {
    const batch = segments.slice(i, i + batchSize);
    await db.insert(transcriptionSegments).values(batch);
  }
  
  console.log(`转录结果已保存: ${segments.length} 个片段`);
}

export const POST = withWorkflowCallback(handleWorkflowCallback);