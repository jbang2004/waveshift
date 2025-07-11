import { type NextRequest } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks, type NewMediaTask } from '@/db/schema-media';
import { verifyAuth } from '@/lib/auth/verify-request';
import { z } from 'zod';

// 环境变量类型定义
interface CloudflareEnv {
  DB: D1Database;
}

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

// 生成统一的对象路径
function generateObjectPath(userId: string, taskId: string, fileName: string): string {
  // 提取文件扩展名
  const ext = fileName.split('.').pop()?.toLowerCase() || 'mp4';
  // 使用统一的命名规则
  return `users/${userId}/${taskId}/original.${ext}`;
}

// 注意：现在使用Worker分段上传，不需要预先初始化上传
// 前端将直接调用 /api/upload/multipart/create 来开始上传

export async function POST(request: NextRequest) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;
    
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
    
    // 生成任务 ID 和对象路径
    const taskId = crypto.randomUUID();
    const objectPath = generateObjectPath(authResult.user.id, taskId, fileName);
    
    // 注意：不再预先初始化分块上传，前端将直接调用 /api/upload/multipart/create
    
    // 创建媒体任务记录
    const now = Date.now();
    const newTask: NewMediaTask = {
      id: taskId,
      user_id: authResult.user.id,
      status: 'created',
      progress: 0,
      file_name: fileName,
      file_size: fileSize,
      file_type: mimeType,
      file_path: objectPath,
      target_language: targetLanguage,
      translation_style: style,
      created_at: now,
    };
    
    // 插入任务到数据库
    await db.insert(mediaTasks).values(newTask);
    
    // 返回成功响应，包含任务信息
    return Response.json({
      success: true,
      taskId,
      objectPath, // R2 对象路径
      objectName: objectPath, // 前端需要的字段名
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