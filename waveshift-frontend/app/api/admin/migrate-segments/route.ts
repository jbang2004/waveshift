// 数据库迁移：为 transcription_segments 表添加 is_first 和 is_last 字段
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    const context = await getCloudflareContext({ async: true });
    const env = context.env as { DB: D1Database; [key: string]: unknown };
    
    if (!env.DB) {
      throw new Error('D1 Database binding not found');
    }

    console.log('开始数据库迁移：添加 is_first 和 is_last 字段');

    // 步骤1：检查字段是否已存在
    const tableInfo = await env.DB.prepare(`
      PRAGMA table_info(transcription_segments);
    `).all();

    const columns = (tableInfo.results as unknown[]).map((col: any) => col.name);
    const hasIsFirst = columns.includes('is_first');
    const hasIsLast = columns.includes('is_last');

    console.log('当前表结构:', columns);
    console.log('is_first 字段存在:', hasIsFirst);
    console.log('is_last 字段存在:', hasIsLast);

    const migrationSteps = [];

    // 步骤2：如果字段不存在，添加字段
    if (!hasIsFirst) {
      await env.DB.prepare(`
        ALTER TABLE transcription_segments 
        ADD COLUMN is_first INTEGER NOT NULL DEFAULT 0;
      `).run();
      migrationSteps.push('添加 is_first 字段');
      console.log('✅ 已添加 is_first 字段');
    }

    if (!hasIsLast) {
      await env.DB.prepare(`
        ALTER TABLE transcription_segments 
        ADD COLUMN is_last INTEGER NOT NULL DEFAULT 0;
      `).run();
      migrationSteps.push('添加 is_last 字段');
      console.log('✅ 已添加 is_last 字段');
    }

    // 步骤3：更新现有数据，为每个转录标记第一个和最后一个片段
    if (migrationSteps.length > 0) {
      // 获取所有转录ID
      const transcriptions = await env.DB.prepare(`
        SELECT DISTINCT transcription_id FROM transcription_segments
      `).all();

      let updatedCount = 0;
      
      for (const trans of transcriptions.results as { transcription_id: string }[]) {
        // 标记第一个片段
        await env.DB.prepare(`
          UPDATE transcription_segments 
          SET is_first = 1 
          WHERE transcription_id = ? 
          AND sequence = (
            SELECT MIN(sequence) 
            FROM transcription_segments 
            WHERE transcription_id = ?
          )
        `).bind(trans.transcription_id, trans.transcription_id).run();

        // 标记最后一个片段
        await env.DB.prepare(`
          UPDATE transcription_segments 
          SET is_last = 1 
          WHERE transcription_id = ? 
          AND sequence = (
            SELECT MAX(sequence) 
            FROM transcription_segments 
            WHERE transcription_id = ?
          )
        `).bind(trans.transcription_id, trans.transcription_id).run();

        updatedCount++;
      }

      console.log(`✅ 更新了 ${updatedCount} 个转录的首尾标记`);
      migrationSteps.push(`更新了 ${updatedCount} 个转录的首尾标记`);
    }

    // 步骤4：验证迁移结果
    const verifyResult = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total_segments,
        SUM(is_first) as first_count,
        SUM(is_last) as last_count,
        COUNT(DISTINCT transcription_id) as transcription_count
      FROM transcription_segments
    `).first();

    return NextResponse.json({ 
      success: true,
      message: migrationSteps.length > 0 ? '数据库迁移成功' : '数据库已是最新版本',
      migrationSteps,
      verification: {
        totalSegments: verifyResult?.total_segments || 0,
        firstSegments: verifyResult?.first_count || 0,
        lastSegments: verifyResult?.last_count || 0,
        transcriptions: verifyResult?.transcription_count || 0
      },
      tableStructure: tableInfo.results
    });

  } catch (error) {
    console.error('迁移错误:', error);
    return NextResponse.json({ 
      success: false,
      error: '数据库迁移失败', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}