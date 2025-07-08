import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 环境变量类型定义
interface CloudflareEnv {
  DB: D1Database;
  MEDIA_STORAGE: R2Bucket;
  R2_PUBLIC_DOMAIN?: string;
}

// 上传完成确认接口
// 用于预签名URL上传完成后，更新数据库状态

// 上传完成确认请求验证模式
const confirmUploadSchema = z.object({
  taskId: z.string().uuid('任务ID格式无效'),
  objectName: z.string().min(1, '对象名称不能为空'),
  fileSize: z.number().int().min(1, '文件大小必须大于0').optional(),
  etag: z.string().optional(), // R2返回的ETag
  uploadTimestamp: z.number().int().optional(), // 上传完成时间戳
});

// POST 方法：确认上传完成
export async function POST(request: NextRequest) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;
    
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

    // 解析和验证请求参数
    const body = await request.json();
    const validation = confirmUploadSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json({
        error: '请求参数无效',
        details: validation.error.errors
      }, { status: 400 });
    }

    const { taskId, objectName, fileSize } = validation.data;
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
    const validStatuses = ['ready_for_upload', 'uploading'];
    if (!validStatuses.includes(task.status)) {
      return NextResponse.json({ 
        error: `任务状态无效: ${task.status}，只能确认状态为 '${validStatuses.join("' 或 '")}' 的任务` 
      }, { status: 400 });
    }

    console.log('开始验证上传文件:', { taskId, objectName });

    // 验证文件是否确实存在于R2中
    try {
      const r2Object = await env.MEDIA_STORAGE.head(objectName);
      
      if (!r2Object) {
        console.error('文件验证失败: R2中未找到文件', { objectName });
        return NextResponse.json({ 
          error: '上传验证失败：文件未在存储中找到' 
        }, { status: 400 });
      }

      console.log('文件验证成功:', {
        objectName,
        size: r2Object.size,
        etag: r2Object.etag,
        uploaded: r2Object.uploaded
      });

      // 可选：验证文件大小是否匹配
      if (fileSize && r2Object.size !== fileSize) {
        console.warn('文件大小不匹配:', {
          expected: fileSize,
          actual: r2Object.size
        });
      }

    } catch (error) {
      console.error('文件验证失败:', error);
      return NextResponse.json({ 
        error: '上传验证失败：无法验证文件状态',
        details: error instanceof Error ? error.message : String(error)
      }, { status: 400 });
    }

    // 生成公共访问URL
    const domain = env.R2_PUBLIC_DOMAIN || 'media.waveshift.net';
    const publicUrl = `https://${domain}/${objectName}`;

    // 更新任务状态为上传完成
    const updateData: Partial<typeof mediaTasks.$inferInsert> = {
      status: 'uploaded',
      progress: 30,
      file_path: objectName, // 存储相对路径，不是完整URL
      started_at: task.started_at || Date.now(), // 保持started_at不变
    };

    await db.update(mediaTasks)
      .set(updateData)
      .where(eq(mediaTasks.id, taskId));

    console.log('任务状态更新成功:', {
      taskId,
      status: 'uploaded',
      publicUrl,
      objectName
    });

    // 返回成功响应
    return NextResponse.json({
      success: true,
      taskId,
      status: 'uploaded',
      filePath: objectName, // 返回相对路径，前端可自行构建完整URL
      publicUrl, // 也提供完整URL供前端使用
      objectName,
      message: '上传确认成功，任务状态已更新'
    });

  } catch (error) {
    console.error('上传确认失败:', error);
    return NextResponse.json({ 
      error: '上传确认失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// GET 方法：检查上传状态
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const taskId = url.searchParams.get('taskId');
    const objectName = url.searchParams.get('objectName');

    if (!taskId) {
      return NextResponse.json({
        error: '缺少taskId参数'
      }, { status: 400 });
    }

    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;
    
    if (!env.DB || !env.MEDIA_STORAGE) {
      return NextResponse.json({ 
        error: '服务配置错误' 
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

    // 如果提供了objectName，检查R2中的文件状态
    let r2FileInfo = null;
    if (objectName) {
      try {
        const r2Object = await env.MEDIA_STORAGE.head(objectName);
        if (r2Object) {
          r2FileInfo = {
            exists: true,
            size: r2Object.size,
            etag: r2Object.etag,
            uploaded: r2Object.uploaded?.toISOString(),
            contentType: r2Object.httpMetadata?.contentType,
          };
        } else {
          r2FileInfo = { exists: false };
        }
      } catch (error) {
        r2FileInfo = { 
          exists: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }

    // 返回任务和文件状态
    return NextResponse.json({
      task: {
        id: task.id,
        status: task.status,
        progress: task.progress,
        fileName: task.file_name,
        fileSize: task.file_size,
        filePath: task.file_path, // 使用数据库中的实际字段
        createdAt: task.created_at,
        startedAt: task.started_at,
        completedAt: task.completed_at,
      },
      r2FileInfo,
      canConfirmUpload: ['ready_for_upload', 'uploading'].includes(task.status),
      message: task.status === 'uploaded' ? '文件已上传完成' : '文件尚未上传或正在上传中'
    });

  } catch (error) {
    console.error('检查上传状态失败:', error);
    return NextResponse.json({ 
      error: '检查状态失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}