import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';

export async function POST(
  request: NextRequest,
  { params }: { params: { taskId: string } }
) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    
    if (!env.DB) {
      return NextResponse.json({ error: '数据库未配置' }, { status: 500 });
    }

    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: '身份验证失败' }, { status: 401 });
    }

    const { taskId } = params;
    const { publicUrl } = await request.json() as { publicUrl?: string };

    if (!taskId) {
      return NextResponse.json({ error: '任务ID是必需的' }, { status: 400 });
    }

    // 初始化数据库
    const db = drizzle(env.DB);

    // 验证任务存在且属于当前用户
    const [task] = await db.select()
      .from(mediaTasks)
      .where(eq(mediaTasks.id, taskId))
      .limit(1);

    if (!task) {
      return NextResponse.json({ error: '任务不存在' }, { status: 404 });
    }

    if (task.user_id !== authResult.user.id) {
      return NextResponse.json({ error: '无权访问此任务' }, { status: 403 });
    }

    // 更新任务状态为上传完成
    await db.update(mediaTasks)
      .set({
        status: 'uploaded',
        progress: 30,
        started_at: Date.now(),
      })
      .where(eq(mediaTasks.id, taskId));

    return NextResponse.json({
      success: true,
      message: '任务状态已更新为上传完成',
      taskId,
      status: 'uploaded'
    });

  } catch (error) {
    console.error('更新任务状态错误:', error);
    
    return NextResponse.json({ 
      error: '更新任务状态失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}