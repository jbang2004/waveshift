import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';
import { AwsClient } from 'aws4fetch';

// R2预签名URL生成API

// 预签名URL请求验证模式
const presignedUrlSchema = z.object({
  taskId: z.string().uuid('任务ID格式无效'),
  objectName: z.string().min(1, '对象名称不能为空'),
  fileSize: z.number().int().min(1, '文件大小必须大于0'),
  mimeType: z.string().min(1, '文件类型不能为空'),
  expiresIn: z.number().int().min(300).max(86400).optional().default(3600), // 默认1小时过期
});

// POST 方法：生成预签名URL
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
    const authResult = await verifyAuth(request as any);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ 
        error: '身份验证失败' 
      }, { status: 401 });
    }

    // 解析和验证请求参数
    const body = await request.json();
    const validation = presignedUrlSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        error: '请求参数无效',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { taskId, objectName, fileSize, mimeType, expiresIn } = validation.data;
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
        error: `任务状态无效: ${task.status}，只能为状态为 'created' 的任务生成预签名URL` 
      }, { status: 400 });
    }

    const bucketName = env.R2_BUCKET_NAME || 'waveshift-media';
    const accountId = env.CLOUDFLARE_ACCOUNT_ID || '1298fa35ac940c688dc1b6d8f5eead72';
    
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new Error('R2 access credentials not configured');
    }
    
    const client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    });

    const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${objectName}`;
    const urlWithExpiry = `${r2Url}?X-Amz-Expires=${expiresIn}`;
    
    const request = new Request(urlWithExpiry, { 
      method: 'PUT',
      headers: { 
        'Content-Type': mimeType || 'application/octet-stream'
      }
    });
    
    const signed = await client.sign(request, { 
      aws: { 
        signQuery: true
      }
    });
    
    const presignedUrl = signed.url;


    // 更新任务状态为准备上传
    await db.update(mediaTasks)
      .set({
        status: 'ready_for_upload',
        progress: 5,
        started_at: Date.now(),
      })
      .where(eq(mediaTasks.id, taskId));

    // 生成公共访问URL（可选择使用自定义域名或R2原生域名）
    const customDomain = env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN;
    const publicUrl = customDomain 
      ? `${customDomain}/${objectName}`
      : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${objectName}`;

    return NextResponse.json({
      presignedUrl,
      objectName,
      publicUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      taskId,
      uploadInstructions: {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType || 'application/octet-stream'
        },
        progressSupport: true
      }
    });

  } catch (error) {
    console.error('预签名URL生成失败:', error);
    return NextResponse.json({ 
      error: '预签名URL生成失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// GET 方法：获取预签名URL信息（用于调试和状态检查）
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({
        error: '缺少taskId参数'
      }, { status: 400 });
    }

    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    
    if (!env.DB) {
      return NextResponse.json({ 
        error: '数据库未配置' 
      }, { status: 500 });
    }

    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ 
        error: '身份验证失败' 
      }, { status: 401 });
    }

    const db = drizzle(env.DB);

    // 获取任务信息
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

    // 返回任务状态和上传信息
    return NextResponse.json({
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      fileName: task.file_name,
      fileSize: task.file_size,
      fileType: task.file_type,
      createdAt: task.created_at,
      startedAt: task.started_at,
      supportedUploadMethods: ['presigned-url', 'multipart'],
      recommendedMethod: 'presigned-url',
      message: '推荐使用预签名URL方式进行直接上传，性能更佳'
    });

  } catch (error) {
    console.error('获取预签名URL信息失败:', error);
    return NextResponse.json({ 
      error: '获取信息失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}