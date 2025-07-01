import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';
import { mediaTasks } from '@/db/schema-media';
import { eq } from 'drizzle-orm';
import { verifyAuth } from '@/lib/auth/verify-request';

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

    // 从请求头获取分段上传参数
    const uploadId = request.headers.get('x-upload-id');
    const partNumberStr = request.headers.get('x-part-number');
    const objectKey = request.headers.get('x-object-key');
    const taskId = request.headers.get('x-task-id');

    // 验证必要参数
    if (!uploadId || !partNumberStr || !objectKey || !taskId) {
      return NextResponse.json({
        error: '缺少必要的请求头参数',
        required: ['x-upload-id', 'x-part-number', 'x-object-key', 'x-task-id']
      }, { status: 400 });
    }

    const partNumber = parseInt(partNumberStr, 10);
    if (isNaN(partNumber) || partNumber < 1 || partNumber > 10000) {
      return NextResponse.json({
        error: '分片编号无效，必须在 1-10000 之间'
      }, { status: 400 });
    }

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

    // 恢复分段上传会话
    const multipartUpload = env.MEDIA_STORAGE.resumeMultipartUpload(objectKey, uploadId);

    // 上传分片
    const uploadPartResult = await multipartUpload.uploadPart(partNumber, chunkData);

    console.log('分片上传成功:', {
      partNumber,
      etag: uploadPartResult.etag
    });

    // 可选：更新任务进度（基于分片完成情况）
    // 这里简单地增加一些进度，具体进度计算可以在前端完成
    const currentProgress = Math.min((task.progress || 0) + 2, 95); // 避免超过95%，留给最终完成
    
    await db.update(mediaTasks)
      .set({
        progress: currentProgress,
      })
      .where(eq(mediaTasks.id, taskId));

    // 返回成功响应
    return NextResponse.json({
      success: true,
      partNumber,
      etag: uploadPartResult.etag,
      uploadId,
      message: `分片 ${partNumber} 上传成功`
    });

  } catch (error) {
    console.error('分片上传错误:', error);
    
    return NextResponse.json({ 
      error: '分片上传失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}