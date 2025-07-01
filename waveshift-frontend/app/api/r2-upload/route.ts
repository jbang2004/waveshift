import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function POST(request: NextRequest) {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as any;
    
    if (!env.MEDIA_STORAGE) {
      return NextResponse.json({ error: 'R2 存储未配置' }, { status: 500 });
    }

    // 解析表单数据
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const objectName = formData.get('objectName') as string;

    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }

    if (!objectName) {
      return NextResponse.json({ error: '未提供对象名称' }, { status: 400 });
    }

    // 直接上传到 R2
    await env.MEDIA_STORAGE.put(objectName, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: '文件上传成功',
      objectName,
      size: file.size,
    });

  } catch (error) {
    console.error('R2 上传错误:', error);
    return NextResponse.json({ 
      error: '文件上传失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}