import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks, transcriptions, transcriptionSegments } from '@/db/schema-media';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    const db = drizzle(env.DB);

    const { taskId } = await params;

    // 查询任务，验证所有权
    const [task] = await db.select()
      .from(mediaTasks)
      .where(and(
        eq(mediaTasks.id, taskId),
        eq(mediaTasks.user_id, authResult.user.id)
      ))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // 通过taskId查找转录记录
    const [transcription] = await db.select()
      .from(transcriptions)
      .where(eq(transcriptions.task_id, taskId))
      .limit(1);

    // 如果没有转录记录，返回空数组
    if (!transcription) {
      return NextResponse.json({ sentences: [] });
    }

    // 获取转录片段
    const segments = await db.select()
      .from(transcriptionSegments)
      .where(eq(transcriptionSegments.transcription_id, transcription.id))
      .orderBy(asc(transcriptionSegments.sequence));

    // 转换为旧格式兼容
    const sentences = segments.map((segment, index) => ({
      id: index + 1,
      taskId: taskId,
      sentenceIndex: segment.sequence,
      startMs: segment.start_ms,
      endMs: segment.end_ms,
      rawText: segment.original_text,
      transText: segment.translated_text,
      speakerId: segment.speaker,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    return NextResponse.json({ sentences });
  } catch (error) {
    console.error('Get subtitles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    const db = drizzle(env.DB);

    const body = await request.json() as any;
    const { taskId } = await params;

    // 查询任务，验证所有权
    const [task] = await db.select()
      .from(mediaTasks)
      .where(and(
        eq(mediaTasks.id, taskId),
        eq(mediaTasks.user_id, authResult.user.id)
      ))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }
    
    // 通过taskId查找转录记录
    const [transcription] = await db.select()
      .from(transcriptions)
      .where(eq(transcriptions.task_id, taskId))
      .limit(1);

    if (!transcription) {
      return NextResponse.json({ error: 'Transcription not found' }, { status: 404 });
    }
    
    // 如果是清空操作
    if (body.action === 'clear') {
      await db.update(transcriptionSegments)
        .set({ 
          translated_text: '',
        })
        .where(eq(transcriptionSegments.transcription_id, transcription.id));
      
      return NextResponse.json({ success: true });
    }
    
    // 如果是更新单个字幕
    const { sentenceId, newTranslation } = body;
    
    if (!sentenceId || typeof newTranslation !== 'string') {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 });
    }
    
    // 根据序号更新转录片段
    await db.update(transcriptionSegments)
      .set({ 
        translated_text: newTranslation,
      })
      .where(and(
        eq(transcriptionSegments.transcription_id, transcription.id),
        eq(transcriptionSegments.sequence, sentenceId)
      ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update subtitle error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 