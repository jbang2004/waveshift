import { type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks, type NewMediaTask } from '@/db/schema-media';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 文件上传验证模式
const createWorkflowSchema = z.object({
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().min(1, 'File size must be greater than 0').max(104857600, 'File size cannot exceed 100MB'),
  mimeType: z.string().min(1, 'MIME type is required'),
  targetLanguage: z.enum(['chinese', 'english']).optional().default('chinese'),
  style: z.enum(['normal', 'classical']).optional().default('normal'),
});

// 支持的文件类型
const supportedMimeTypes = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/flac',
  'audio/aac',
  'audio/ogg',
];

// 生成安全的对象名称
function generateObjectName(userId: string, taskId: string, fileName: string): string {
  // 清理文件名，移除危险字符
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `uploads/${userId}/${taskId}/${sanitizedFileName}`;
}

// 初始化分块上传 - 返回前端所需的上传信息
async function initiateMultipartUpload(objectName: string, env: any): Promise<{ uploadId: string; uploadUrl: string }> {
  // 生成一个临时的 uploadId 供前端使用
  // 实际的 R2 uploadId 会在前端调用 /api/r2-presigned-url 时生成
  const tempUploadId = crypto.randomUUID();
  
  return {
    uploadId: tempUploadId,
    uploadUrl: '/api/r2-presigned-url' // 前端会使用这个端点进行分块上传
  };
}

export async function POST(request: NextRequest) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    
    if (!env.DB) {
      return Response.json({ 
        error: 'Database configuration error' 
      }, { status: 500 });
    }
    
    // 验证用户身份
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return Response.json({ 
        error: 'Authentication required' 
      }, { status: 401 });
    }
    
    // 解析请求数据
    const body = await request.json();
    
    // 验证输入数据
    const validation = createWorkflowSchema.safeParse(body);
    if (!validation.success) {
      return Response.json({
        error: 'Invalid request data',
        details: validation.error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      }, { status: 400 });
    }
    
    const { fileName, fileSize, mimeType, targetLanguage, style } = validation.data;
    
    // 验证文件类型
    if (!supportedMimeTypes.includes(mimeType)) {
      return Response.json({
        error: 'Unsupported file type',
        supportedTypes: supportedMimeTypes
      }, { status: 400 });
    }
    
    // 初始化数据库
    const db = drizzle(env.DB);
    
    // 生成任务 ID 和对象名称
    const taskId = crypto.randomUUID();
    const objectName = generateObjectName(authResult.user.id, taskId, fileName);
    
    // 初始化分块上传
    const { uploadId, uploadUrl } = await initiateMultipartUpload(objectName, env);
    
    // 创建媒体任务记录
    const now = Date.now();
    const newTask: NewMediaTask = {
      id: taskId,
      userId: authResult.user.id,
      status: 'pending_upload',
      progress: 0,
      fileName,
      fileSize,
      mimeType,
      uploadUrl: objectName, // 存储 R2 对象路径
      uploadId,
      createdAt: now,
      updatedAt: now,
    };
    
    // 插入任务到数据库
    await db.insert(mediaTasks).values(newTask);
    
    // 返回成功响应，包含上传所需信息
    return Response.json({
      success: true,
      taskId,
      uploadId,
      uploadUrl, // 前端分块上传端点
      objectName, // R2 对象路径
      message: 'Workflow created successfully. Ready for file upload.',
      metadata: {
        fileName,
        fileSize,
        mimeType,
        targetLanguage,
        style,
      }
    });
    
  } catch (error) {
    console.error('Workflow creation error:', error);
    const err = error as Error;
    
    return Response.json({
      error: 'Failed to create workflow',
      message: err.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack?.substring(0, 500) // 只在开发环境显示堆栈
      })
    }, { status: 500 });
  }
}