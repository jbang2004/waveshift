import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyAuth } from '@/lib/auth/verify-request';

interface CloudflareEnv {
  MEDIA_STORAGE?: R2Bucket;
}

// GET方法：获取R2存储统计信息
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;

    if (!env.MEDIA_STORAGE) {
      return NextResponse.json({ 
        error: 'R2存储未配置' 
      }, { status: 500 });
    }

    const stats = {
      totalFiles: 0,
      totalSize: 0,
      filesByType: {} as Record<string, number>,
      filesByUser: {} as Record<string, number>,
      largestFiles: [] as Array<{
        key: string;
        size: number;
        uploaded: string;
      }>,
    };

    try {
      let cursor: string | undefined;
      const allFiles: Array<{
        key: string;
        size: number;
        uploaded: Date;
      }> = [];

      // 获取所有文件信息
      do {
        const listed: R2Objects = await env.MEDIA_STORAGE.list({
          cursor,
          limit: 1000,
        });

        for (const object of listed.objects) {
          stats.totalFiles++;
          stats.totalSize += object.size;
          
          // 统计文件类型
          const ext = object.key.split('.').pop()?.toLowerCase() || 'unknown';
          stats.filesByType[ext] = (stats.filesByType[ext] || 0) + 1;
          
          // 统计用户文件
          const userMatch = object.key.match(/users\/([^\/]+)\//);
          if (userMatch) {
            const userId = userMatch[1];
            stats.filesByUser[userId] = (stats.filesByUser[userId] || 0) + 1;
          }
          
          allFiles.push({
            key: object.key,
            size: object.size,
            uploaded: object.uploaded,
          });
        }

        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);

      // 找出最大的10个文件
      stats.largestFiles = allFiles
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map(file => ({
          key: file.key,
          size: file.size,
          uploaded: file.uploaded.toISOString(),
        }));

    } catch (error) {
      console.error('获取R2统计信息错误:', error);
      return NextResponse.json({
        error: '获取R2统计信息失败',
        details: error instanceof Error ? error.message : String(error),
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('R2统计错误:', error);
    
    return NextResponse.json({
      success: false,
      error: '获取R2统计失败',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}