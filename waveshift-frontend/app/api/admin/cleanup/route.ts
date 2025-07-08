import { NextRequest, NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { verifyAuth } from '@/lib/auth/verify-request';

// 管理员清理API - 谨慎使用！

interface CleanupOptions {
  clearMediaTasks?: boolean;
  clearTranscriptions?: boolean;
  clearTTSTasks?: boolean;
  clearUsers?: boolean;
  clearR2Files?: boolean;
}

interface CloudflareEnv {
  DB: D1Database;
  MEDIA_STORAGE?: R2Bucket;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  R2_BUCKET_NAME?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 验证用户认证
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;
    const body = await request.json() as { options?: CleanupOptions };
    const options: CleanupOptions = body.options || {};

    // 安全检查：只允许特定用户进行清理操作
    // TODO: 添加管理员权限检查
    // const adminUsers = ['your-admin-email@example.com']; // 替换为实际的管理员邮箱
    
    // 暂时跳过管理员检查，但在生产环境中应该启用
    // if (!adminUsers.includes(authResult.user.email)) {
    //   return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    // }

    const results = {
      clearedTables: [] as string[],
      errors: [] as string[],
      warnings: [] as string[],
    };

    console.log('开始数据清理操作:', options);

    // 1. 清理转录片段（必须首先清理，因为有外键依赖）
    if (options.clearTranscriptions !== false) {
      try {
        await env.DB.prepare('DELETE FROM transcription_segments').run();
        results.clearedTables.push('transcription_segments');
        console.log('✅ 清理转录片段完成');
      } catch (err) {
        results.errors.push(`清理转录片段失败: ${err}`);
      }
    }

    // 2. 清理TTS相关表
    if (options.clearTTSTasks !== false) {
      try {
        await env.DB.prepare('DELETE FROM tts_segments').run();
        results.clearedTables.push('tts_segments');
      } catch {
        results.warnings.push('TTS片段表不存在或清理失败');
      }

      try {
        await env.DB.prepare('DELETE FROM tts_tasks').run();
        results.clearedTables.push('tts_tasks');
      } catch {
        results.warnings.push('TTS任务表不存在或清理失败');
      }

      try {
        await env.DB.prepare('DELETE FROM voice_models').run();
        results.clearedTables.push('voice_models');
      } catch {
        results.warnings.push('声音模型表不存在或清理失败');
      }

      try {
        await env.DB.prepare('DELETE FROM media_compositions').run();
        results.clearedTables.push('media_compositions');
      } catch {
        results.warnings.push('媒体合成表不存在或清理失败');
      }
    }

    // 3. 清理转录任务（在片段清理后）
    if (options.clearTranscriptions !== false) {
      try {
        await env.DB.prepare('DELETE FROM transcriptions').run();
        results.clearedTables.push('transcriptions');
        console.log('✅ 清理转录任务完成');
      } catch (err) {
        results.errors.push(`清理转录任务失败: ${err}`);
      }
    }

    // 4. 清理媒体任务（在所有依赖清理后）
    if (options.clearMediaTasks !== false) {
      try {
        await env.DB.prepare('DELETE FROM media_tasks').run();
        results.clearedTables.push('media_tasks');
        console.log('✅ 清理媒体任务完成');
      } catch (err) {
        results.errors.push(`清理媒体任务失败: ${err}`);
      }
    }

    // 5. 清理旧版表（如果存在）
    const oldTables = ['sentences', 'tasks', 'videos'];
    for (const table of oldTables) {
      try {
        await env.DB.prepare(`DELETE FROM ${table}`).run();
        results.clearedTables.push(table);
      } catch {
        results.warnings.push(`旧版表 ${table} 不存在或清理失败`);
      }
    }

    // 6. 清理用户数据（谨慎操作）
    if (options.clearUsers === true) {
      try {
        await env.DB.prepare('DELETE FROM users').run();
        results.clearedTables.push('users');
        results.warnings.push('⚠️ 用户数据已清空，需要重新注册');
        console.log('⚠️ 清理用户数据完成');
      } catch (err) {
        results.errors.push(`清理用户数据失败: ${err}`);
      }
    }

    // 7. 重置自增计数器
    try {
      await env.DB.prepare(`
        DELETE FROM sqlite_sequence 
        WHERE name IN ('transcription_segments', 'tts_segments')
      `).run();
      console.log('✅ 重置自增计数器完成');
    } catch {
      results.warnings.push('重置自增计数器失败或无需重置');
    }

    // 8. R2文件清理
    if (options.clearR2Files === true && env.MEDIA_STORAGE) {
      try {
        console.log('开始清理R2文件...');
        let deletedCount = 0;
        let cursor: string | undefined;
        const deleteErrors: string[] = [];
        
        // 分批列出并删除所有文件
        do {
          const listed = await env.MEDIA_STORAGE.list({
            cursor,
            limit: 1000, // R2 API 每次最多返回1000个对象
          });
          
          console.log(`找到 ${listed.objects.length} 个文件待删除`);
          
          // 并发删除文件（限制并发数避免超时）
          const batchSize = 10;
          for (let i = 0; i < listed.objects.length; i += batchSize) {
            const batch = listed.objects.slice(i, i + batchSize);
            await Promise.all(
              batch.map(async (object) => {
                try {
                  await env.MEDIA_STORAGE!.delete(object.key);
                  deletedCount++;
                } catch (err) {
                  deleteErrors.push(`删除 ${object.key} 失败: ${err}`);
                }
              })
            );
          }
          
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
        
        if (deletedCount > 0) {
          results.clearedTables.push(`R2文件 (${deletedCount}个)`);
          console.log(`✅ 清理R2文件完成，共删除 ${deletedCount} 个文件`);
        }
        
        if (deleteErrors.length > 0) {
          results.warnings.push(`R2清理遇到 ${deleteErrors.length} 个错误`);
          console.error('R2删除错误:', deleteErrors);
        }
      } catch (err) {
        results.errors.push(`清理R2文件失败: ${err}`);
        console.error('R2清理错误:', err);
      }
    }

    // 验证清理结果
    const verification = {
      mediaTasksCount: 0,
      transcriptionsCount: 0,
      segmentsCount: 0,
      usersCount: 0,
    };

    try {
      const mediaTasksResult = await env.DB.prepare('SELECT COUNT(*) as count FROM media_tasks').first() as { count: number } | null;
      verification.mediaTasksCount = mediaTasksResult?.count || 0;

      const transcriptionsResult = await env.DB.prepare('SELECT COUNT(*) as count FROM transcriptions').first() as { count: number } | null;
      verification.transcriptionsCount = transcriptionsResult?.count || 0;

      const segmentsResult = await env.DB.prepare('SELECT COUNT(*) as count FROM transcription_segments').first() as { count: number } | null;
      verification.segmentsCount = segmentsResult?.count || 0;

      const usersResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as { count: number } | null;
      verification.usersCount = usersResult?.count || 0;
    } catch {
      results.warnings.push('验证清理结果时出错');
    }

    return NextResponse.json({
      success: true,
      message: '数据清理操作完成',
      results,
      verification,
      nextSteps: [
        options.clearUsers ? '重新注册用户账户' : '使用现有账户登录',
        '访问前端应用开始新的视频翻译测试',
        '确保所有服务正常运行',
        options.clearR2Files ? '手动清理R2存储文件' : null,
      ].filter(Boolean),
    });

  } catch (error) {
    console.error('数据清理错误:', error);
    
    return NextResponse.json({
      success: false,
      error: '数据清理失败',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

// GET方法：获取当前数据统计
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.authenticated || !authResult.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;

    const stats = {
      users: 0,
      mediaTasks: 0,
      transcriptions: 0,
      transcriptionSegments: 0,
      ttsTasks: 0,
      ttsSegments: 0,
    };

    try {
      const results = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) as count FROM users').first() as Promise<{ count: number } | null>,
        env.DB.prepare('SELECT COUNT(*) as count FROM media_tasks').first() as Promise<{ count: number } | null>,
        env.DB.prepare('SELECT COUNT(*) as count FROM transcriptions').first() as Promise<{ count: number } | null>,
        env.DB.prepare('SELECT COUNT(*) as count FROM transcription_segments').first() as Promise<{ count: number } | null>,
        env.DB.prepare('SELECT COUNT(*) as count FROM tts_tasks').first().catch(() => ({ count: 0 })) as Promise<{ count: number }>,
        env.DB.prepare('SELECT COUNT(*) as count FROM tts_segments').first().catch(() => ({ count: 0 })) as Promise<{ count: number }>,
      ]);

      stats.users = results[0]?.count || 0;
      stats.mediaTasks = results[1]?.count || 0;
      stats.transcriptions = results[2]?.count || 0;
      stats.transcriptionSegments = results[3]?.count || 0;
      stats.ttsTasks = results[4]?.count || 0;
      stats.ttsSegments = results[5]?.count || 0;
    } catch (error) {
      console.error('获取统计数据错误:', error);
    }

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('获取数据统计错误:', error);
    
    return NextResponse.json({
      success: false,
      error: '获取数据统计失败',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}