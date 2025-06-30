import { type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';



// 获取文件的 MIME 类型
function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    'mp4': 'video/mp4',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
  };
  return mimeTypes[ext || ''] || 'video/mp4';
}

export async function POST(
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
    const body = await request.json() as { targetLanguage?: string; style?: string };
    const { targetLanguage = 'chinese', style = 'normal' } = body;
    
    // 查询任务，验证所有权
    const [task] = await db.select()
      .from(mediaTasks)
      .where(and(
        eq(mediaTasks.id, taskId),
        eq(mediaTasks.userId, authResult.user.id)
      ))
      .limit(1);
      
    if (!task) {
      return Response.json({ error: 'Task not found' }, { status: 404 });
    }
    
    if (task.status !== 'pending_upload' && task.status !== 'uploading') {
      return Response.json(
        { error: 'Task is already being processed' },
        { status: 400 }
      );
    }
    
    // 通过 Service Binding 调用 Workflow 服务的 /start 端点（文件路径引用模式）
    const fileKey = `uploads/${authResult.user.id}/${taskId}/${task.fileName}`;
    
    // 调用 waveshift-workflow 的 /start 端点（JSON 模式）
    const workflowResponse = await env.WORKFLOW_SERVICE.fetch(
      new Request('https://workflow/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileKey,
          fileType: task.mimeType || getMimeType(task.fileName || ''),
          options: {
            targetLanguage,
            style,
          },
          userId: authResult.user.id,
          taskId,
        }),
      })
    );
    
    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      console.error('Workflow service error:', errorText);
      throw new Error(`Workflow service returned ${workflowResponse.status}: ${errorText}`);
    }
    
    const workflow = await workflowResponse.json() as { id: string; details: any };
    
    // 更新任务状态
    await db.update(mediaTasks)
      .set({
        status: 'separating', // 开始音视频分离
        workflowId: workflow.id,
        workflowStatus: 'running',
        startedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(mediaTasks.id, taskId));
      
    return Response.json({
      taskId,
      workflowId: workflow.id,
      status: 'processing',
    });
    
  } catch (error) {
    console.error('Error processing media task:', error);
    return Response.json(
      { error: 'Failed to process media task' },
      { status: 500 }
    );
  }
}