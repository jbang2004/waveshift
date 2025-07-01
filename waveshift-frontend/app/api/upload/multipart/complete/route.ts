import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 请求验证模式
const completeMultipartSchema = z.object({
  taskId: z.string().uuid('任务ID格式无效'),
  uploadId: z.string().min(1, 'uploadId不能为空'),
  objectKey: z.string().min(1, '对象键不能为空'),
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10000),
    etag: z.string().min(1, 'etag不能为空')
  })).min(1, '至少需要一个分片'),
});

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
    const validation = completeMultipartSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        error: '请求参数无效',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { taskId, uploadId, objectKey, parts } = validation.data;

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
    if (task.status !== 'uploading') {
      return NextResponse.json({ 
        error: `任务状态无效: ${task.status}，只能完成状态为 'uploading' 的任务` 
      }, { status: 400 });
    }

    // 验证分片连续性（确保没有缺失的分片）
    const sortedParts = parts.sort((a, b) => a.partNumber - b.partNumber);
    for (let i = 0; i < sortedParts.length; i++) {
      if (sortedParts[i].partNumber !== i + 1) {
        return NextResponse.json({
          error: `分片编号不连续，缺少分片 ${i + 1}`
        }, { status: 400 });
      }
    }

    console.log('开始完成分段上传:', {
      taskId,
      uploadId,
      objectKey,
      totalParts: parts.length
    });

    // 恢复分段上传会话
    const multipartUpload = env.MEDIA_STORAGE.resumeMultipartUpload(objectKey, uploadId);

    // 完成分段上传
    const completeResult = await multipartUpload.complete(parts);

    console.log('分段上传完成成功:', {
      taskId,
      objectKey,
      etag: completeResult.etag
    });

    // 使用自定义域名生成访问URL（推荐的生产环境方案）
    const customDomain = env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || `https://media.waveshift.net`;
    const publicUrl = `${customDomain}/${objectKey}`;
    
    console.log('生成自定义域名访问URL:', {
      customDomain,
      objectKey,
      publicUrl,
      note: '使用自定义域名替代pub-xxx.r2.dev（官方推荐的生产环境方案）'
    });

    // 更新任务状态为上传完成
    await db.update(mediaTasks)
      .set({
        status: 'uploaded',
        progress: 30,
        started_at: Date.now(),
      })
      .where(eq(mediaTasks.id, taskId));

    console.log('任务状态更新成功:', {
      taskId,
      status: 'uploaded',
      publicUrl
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      taskId,
      objectKey,
      publicUrl,
      etag: completeResult.etag,
      totalParts: parts.length,
      message: '分段上传完成成功'
    });

  } catch (error) {
    console.error('完成分段上传错误:', error);
    
    return NextResponse.json({ 
      error: '完成分段上传失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}