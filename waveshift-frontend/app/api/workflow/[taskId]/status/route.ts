import { type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks, transcriptions, transcriptionSegments } from '@/db/schema-media';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';



// 获取任务详细信息
async function getTaskWithDetails(taskId: string, userId: string, db: any) {
  // 获取任务基本信息
  const [task] = await db.select()
    .from(mediaTasks)
    .where(and(
      eq(mediaTasks.id, taskId),
      eq(mediaTasks.userId, userId)
    ))
    .limit(1);
    
  if (!task) return null;
  
  let transcription = null;
  
  // 如果任务完成，获取转录结果
  if (task.status === 'completed' && task.transcriptionId) {
    const [transcriptionData] = await db.select()
      .from(transcriptions)
      .where(eq(transcriptions.id, task.transcriptionId))
      .limit(1);
      
    if (transcriptionData) {
      const segments = await db.select()
        .from(transcriptionSegments)
        .where(eq(transcriptionSegments.transcriptionId, task.transcriptionId))
        .orderBy(transcriptionSegments.sequence);
        
      transcription = {
        ...transcriptionData,
        segments,
      };
    }
  }
  
  return {
    ...task,
    transcription,
  };
}

// 创建 SSE 响应
function createSSEResponse(taskId: string, userId: string, db: any) {
  const encoder = new TextEncoder();
  
  
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  // 定期查询状态
  const intervalId = setInterval(async () => {
    try {
      const task = await getTaskWithDetails(taskId, userId, db);
      
      if (!task) {
        await writer.write(encoder.encode(
          `data: ${JSON.stringify({ error: 'Task not found' })}\n\n`
        ));
        clearInterval(intervalId);
        await writer.close();
        return;
      }
      
      await writer.write(encoder.encode(
        `data: ${JSON.stringify(task)}\n\n`
      ));
      
      // 如果任务完成或失败，停止轮询
      if (task.status === 'completed' || task.status === 'failed') {
        clearInterval(intervalId);
        await writer.close();
      }
    } catch (error) {
      console.error('SSE polling error:', error);
      clearInterval(intervalId);
      await writer.close();
    }
  }, 1000); // 每秒查询一次
  
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    const db = drizzle(env.DB);
    
    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { taskId } = await params;
    
    // 检查是否要求 SSE 响应
    const accept = request.headers.get('accept');
    if (accept === 'text/event-stream') {
      return createSSEResponse(taskId, authResult.user.id, db);
    }
    
    // 普通状态查询
    const task = await getTaskWithDetails(taskId, authResult.user.id, db);
    
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    
    return Response.json(task);
    
  } catch (error) {
    console.error('Error getting task status:', error);
    return Response.json(
      { error: 'Failed to get task status' },
      { status: 500 }
    );
  }
}