import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 请求验证模式
const createMultipartSchema = z.object({
  taskId: z.string().uuid('任务ID格式无效'),
  objectName: z.string().min(1, '对象名称不能为空'),
});

// 分片配置常量
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const MAX_PARTS = 10000; // R2最大分片数量

export async function POST(request: NextRequest) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    
    if (!env.DB || !env.MEDIA_STORAGE) {
      return NextResponse.json({ 
        error: '服务配置错误：数据库或存储未配置' 
      }, { status: 500 });
    }

    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ 
        error: '身份验证失败' 
      }, { status: 401 });
    }

    // 解析请求数据
    const body = await request.json();
    const validation = createMultipartSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        error: '请求参数无效',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { taskId, objectName } = validation.data;

    // 初始化数据库
    const db = drizzle(env.DB);

    // 验证任务存在且属于当前用户
    const [task] = await db.select()
      .from(mediaTasks)
      .where(eq(mediaTasks.id, taskId))
      .limit(1);

    if (!task) {
      return NextResponse.json({ 
        error: '任务不存在' 
      }, { status: 404 });
    }

    if (task.user_id !== authResult.user.id) {
      return NextResponse.json({ 
        error: '无权访问此任务' 
      }, { status: 403 });
    }

    // 验证任务状态
    if (task.status !== 'created') {
      return NextResponse.json({ 
        error: `任务状态无效: ${task.status}，只能上传状态为 'created' 的任务` 
      }, { status: 400 });
    }

    // 调用 R2 创建分段上传
    console.log('开始创建分段上传:', { taskId, objectName });
    
    const multipartUpload = await env.MEDIA_STORAGE.createMultipartUpload(objectName);
    
    console.log('分段上传创建成功:', {
      uploadId: multipartUpload.uploadId,
      key: multipartUpload.key
    });

    // 更新任务状态为上传中
    await db.update(mediaTasks)
      .set({
        status: 'uploading',
        progress: 5,
        started_at: Date.now(),
      })
      .where(eq(mediaTasks.id, taskId));

    // 返回成功响应
    return NextResponse.json({
      success: true,
      uploadId: multipartUpload.uploadId,
      key: multipartUpload.key,
      chunkSize: CHUNK_SIZE,
      maxParts: MAX_PARTS,
      taskId,
      message: '分段上传初始化成功'
    });

  } catch (error) {
    console.error('分段上传初始化错误:', error);
    
    return NextResponse.json({ 
      error: '分段上传初始化失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}