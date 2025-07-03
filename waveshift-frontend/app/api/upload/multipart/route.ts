import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 基于Cloudflare官方Worker模式的统一multipart API
// 参考: https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/

// 创建上传验证模式
const createSchema = z.object({
  taskId: z.string().uuid('任务ID格式无效'),
  objectName: z.string().min(1, '对象名称不能为空'),
});

// 完成上传验证模式  
const completeSchema = z.object({
  parts: z.array(z.object({
    partNumber: z.number().int().min(1).max(10000),
    etag: z.string().min(1, 'etag不能为空')
  })).min(1, '至少需要一个分片'),
});

// 分片配置常量
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
const MAX_PARTS = 10000; // R2最大分片数量

// POST 方法处理：创建分段上传 和 完成分段上传
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

    // 获取URL参数（官方模式）
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    
    switch (action) {
      case "mpu-create": {
        // 创建分段上传逻辑
        return await handleCreateMultipart(request, env, authResult.user.id);
      }
      
      case "mpu-complete": {
        // 完成分段上传逻辑
        return await handleCompleteMultipart(request, url, env, authResult.user.id);
      }
      
      default:
        return NextResponse.json({
          error: '无效的action参数',
          validActions: ['mpu-create', 'mpu-complete']
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Multipart POST API错误:', error);
    return NextResponse.json({ 
      error: 'API处理失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// PUT 方法处理：上传分片
export async function PUT(request: NextRequest) {
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

    // 获取URL参数（官方模式）
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    
    if (action === "mpu-uploadpart") {
      return await handleUploadPart(request, url, env, authResult.user.id);
    }
    
    return NextResponse.json({
      error: '无效的action参数',
      validActions: ['mpu-uploadpart']
    }, { status: 400 });

  } catch (error) {
    console.error('Multipart PUT API错误:', error);
    return NextResponse.json({ 
      error: 'API处理失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// 处理创建分段上传
async function handleCreateMultipart(
  request: NextRequest, 
  env: any, 
  userId: string
): Promise<NextResponse> {
  // 解析请求数据
  const body = await request.json();
  const validation = createSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      error: '请求参数无效',
      details: validation.error.errors
    }, { status: 400 });
  }

  const { taskId, objectName } = validation.data;
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

  if (task.user_id !== userId) {
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

  // 调用 R2 创建分段上传（官方API格式）
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

  // 返回官方格式的响应
  return NextResponse.json({
    key: multipartUpload.key,
    uploadId: multipartUpload.uploadId,
    chunkSize: CHUNK_SIZE,
    maxParts: MAX_PARTS,
    taskId,
    message: '分段上传初始化成功'
  });
}

// 处理上传分片
async function handleUploadPart(
  request: NextRequest,
  url: URL,
  env: any,
  userId: string
): Promise<NextResponse> {
  // 从URL参数获取分段上传参数（官方模式）
  const uploadId = url.searchParams.get('uploadId');
  const partNumberStr = url.searchParams.get('partNumber');
  const objectKey = url.searchParams.get('key');
  const taskId = url.searchParams.get('taskId');

  // 验证必要参数
  if (!uploadId || !partNumberStr || !objectKey || !taskId) {
    return NextResponse.json({
      error: '缺少必要的URL参数',
      required: ['uploadId', 'partNumber', 'key', 'taskId']
    }, { status: 400 });
  }

  const partNumber = parseInt(partNumberStr, 10);
  if (isNaN(partNumber) || partNumber < 1 || partNumber > 10000) {
    return NextResponse.json({
      error: '分片编号无效，必须在 1-10000 之间'
    }, { status: 400 });
  }

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

  if (task.user_id !== userId) {
    return NextResponse.json({ 
      error: '无权访问此任务' 
    }, { status: 403 });
  }

  // 验证任务状态
  if (task.status !== 'uploading') {
    return NextResponse.json({ 
      error: `任务状态无效: ${task.status}，只能上传状态为 'uploading' 的任务` 
    }, { status: 400 });
  }

  // 获取请求体（分片数据）
  const chunkData = await request.arrayBuffer();
  
  if (!chunkData || chunkData.byteLength === 0) {
    return NextResponse.json({
      error: '分片数据不能为空'
    }, { status: 400 });
  }

  console.log('开始上传分片:', {
    taskId,
    uploadId,
    partNumber,
    objectKey,
    chunkSize: chunkData.byteLength
  });

  // 恢复分段上传会话并上传分片（官方API格式）
  const multipartUpload = env.MEDIA_STORAGE.resumeMultipartUpload(objectKey, uploadId);
  const uploadedPart = await multipartUpload.uploadPart(partNumber, chunkData);

  console.log('分片上传成功:', {
    partNumber,
    etag: uploadedPart.etag
  });

  // 更新任务进度
  const currentProgress = Math.min((task.progress || 0) + 2, 95);
  
  await db.update(mediaTasks)
    .set({
      progress: currentProgress,
    })
    .where(eq(mediaTasks.id, taskId));

  // 返回官方格式的响应
  return NextResponse.json(uploadedPart);
}

// 处理完成分段上传
async function handleCompleteMultipart(
  request: NextRequest,
  url: URL,
  env: any,
  userId: string
): Promise<NextResponse> {
  // 从URL参数获取参数（官方模式）
  const uploadId = url.searchParams.get('uploadId');
  const objectKey = url.searchParams.get('key');
  const taskId = url.searchParams.get('taskId');

  if (!uploadId || !objectKey || !taskId) {
    return NextResponse.json({
      error: '缺少必要的URL参数',
      required: ['uploadId', 'key', 'taskId']
    }, { status: 400 });
  }

  // 解析请求数据
  const body = await request.json();
  const validation = completeSchema.safeParse(body);
  
  if (!validation.success) {
    return NextResponse.json({
      error: '请求参数无效',
      details: validation.error.errors
    }, { status: 400 });
  }

  const { parts } = validation.data;
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

  if (task.user_id !== userId) {
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

  // 验证分片连续性
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

  // 完成分段上传（官方API格式）
  const multipartUpload = env.MEDIA_STORAGE.resumeMultipartUpload(objectKey, uploadId);
  const completeResult = await multipartUpload.complete(sortedParts);

  console.log('分段上传完成成功:', {
    taskId,
    objectKey,
    etag: completeResult.httpEtag
  });

  // 生成访问URL
  const customDomain = env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN || `https://media.waveshift.net`;
  const publicUrl = `${customDomain}/${objectKey}`;
  
  console.log('生成自定义域名访问URL:', {
    customDomain,
    objectKey,
    publicUrl
  });

  // 更新任务状态为上传完成
  await db.update(mediaTasks)
    .set({
      status: 'uploaded',
      progress: 30,
    })
    .where(eq(mediaTasks.id, taskId));

  console.log('任务状态更新成功:', {
    taskId,
    status: 'uploaded',
    publicUrl
  });

  // 返回官方格式的响应
  return NextResponse.json({
    etag: completeResult.httpEtag,
    publicUrl,
    taskId,
    objectKey,
    totalParts: parts.length,
    message: '分段上传完成成功'
  });
}