import { type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks, transcriptions, transcriptionSegments } from '@/db/schema-media';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';



// 智能轮询频率调整
function getPollingInterval(status: string): number {
  switch (status) {
    case 'created':
    case 'uploading': return 3000;    // 上传阶段3秒
    case 'separating': return 2000;   // 分离阶段2秒  
    case 'transcribing': return 1000; // 转录阶段1秒
    case 'completed':
    case 'failed': return 0;          // 完成就停止
    default: return 5000;             // 其他状态5秒
  }
}

// 获取任务基本状态信息（轻量级查询）
async function getTaskBasicInfo(taskId: string, userId: string, db: any) {
  const [task] = await db.select({
    id: mediaTasks.id,
    status: mediaTasks.status,
    progress: mediaTasks.progress,
    error_message: mediaTasks.error_message,
    user_id: mediaTasks.user_id,
    transcription_id: mediaTasks.transcription_id,
  })
    .from(mediaTasks)
    .where(and(
      eq(mediaTasks.id, taskId),
      eq(mediaTasks.user_id, userId)
    ))
    .limit(1);
    
  return task;
}

// 获取任务详细信息
async function getTaskWithDetails(taskId: string, userId: string, db: any, env: any) {
  // 获取任务基本信息
  const [task] = await db.select()
    .from(mediaTasks)
    .where(and(
      eq(mediaTasks.id, taskId),
      eq(mediaTasks.user_id, userId)
    ))
    .limit(1);
    
  if (!task) return null;
  
  let transcription = null;
  
  // 如果任务完成，获取转录结果
  if (task.status === 'completed' && task.transcription_id) {
    const [transcriptionData] = await db.select()
      .from(transcriptions)
      .where(eq(transcriptions.id, task.transcription_id))
      .limit(1);
      
    if (transcriptionData) {
      const segments = await db.select()
        .from(transcriptionSegments)
        .where(eq(transcriptionSegments.transcription_id, task.transcription_id))
        .orderBy(transcriptionSegments.sequence);
        
      transcription = {
        ...transcriptionData,
        segments,
      };
    }
  }
  
  // 生成视频URL
  let videoUrl = null;
  if (task.file_path) {
    // 使用自定义域名（官方推荐的生产环境方案）
    const customDomain = env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || 'https://media.waveshift.net';
    videoUrl = `${customDomain}/${task.file_path}`;
    
    console.log('生成自定义域名视频URL:', {
      taskId: task.id,
      filePath: task.file_path,
      customDomain,
      videoUrl,
      note: '使用自定义域名访问（官方推荐的生产环境方案）'
    });
  }
  
  return {
    ...task,
    videoUrl,
    transcription,
  };
}

// 创建智能 SSE 响应
function createSSEResponse(taskId: string, userId: string, db: any, env: any) {
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  
  let lastStatus = '';
  let lastProgress = 0;
  
  const poll = async () => {
    try {
      // 先查基本信息（轻量级查询）
      const basicTask = await getTaskBasicInfo(taskId, userId, db);
      
      if (!basicTask) {
        await writer.write(encoder.encode(
          `data: ${JSON.stringify({ error: 'Task not found' })}\n\n`
        ));
        await writer.close();
        return;
      }
      
      // 只在状态变化或任务完成时查询完整数据
      let taskData;
      if (basicTask.status !== lastStatus || 
          basicTask.progress !== lastProgress ||
          basicTask.status === 'completed' || 
          basicTask.status === 'failed') {
        taskData = await getTaskWithDetails(taskId, userId, db, env);
      } else {
        taskData = basicTask;
      }
      
      await writer.write(encoder.encode(
        `data: ${JSON.stringify(taskData)}\n\n`
      ));
      
      lastStatus = basicTask.status;
      lastProgress = basicTask.progress || 0;
      
      // 动态调整轮询频率
      const newInterval = getPollingInterval(basicTask.status);
      
      if (newInterval === 0) {
        // 任务完成，停止轮询
        await writer.close();
        return;
      }
      
      // 安排下次轮询
      setTimeout(poll, newInterval);
      
    } catch (error) {
      console.error('SSE polling error:', error);
      await writer.close();
    }
  };
  
  // 开始轮询
  poll();
  
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
      return createSSEResponse(taskId, authResult.user.id, db, env);
    }
    
    // 普通状态查询
    const task = await getTaskWithDetails(taskId, authResult.user.id, db, env);
    
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