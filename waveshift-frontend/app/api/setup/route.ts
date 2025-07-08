// Database setup for JWT-based authentication
import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function GET() {
  try {
    // 获取Cloudflare环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as { DB: D1Database; [key: string]: unknown };
    
    if (!env.DB) {
      throw new Error('D1 Database binding not found');
    }

    // 创建JWT认证系统的数据库表
    try {
      // 用户表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT,
          image TEXT,
          hashedPassword TEXT,
          emailVerified INTEGER,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL
        );
      `).run();

      // 媒体任务表 - 统一管理所有媒体处理任务
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS media_tasks (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          file_path TEXT NOT NULL,
          file_name TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          file_type TEXT NOT NULL,
          target_language TEXT DEFAULT 'chinese',
          translation_style TEXT DEFAULT 'normal',
          audio_path TEXT,
          video_path TEXT,
          workflow_id TEXT,
          workflow_status TEXT,
          transcription_id TEXT,
          error_message TEXT,
          error_details TEXT,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `).run();

      // 转录任务表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS transcriptions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          source_language TEXT,
          target_language TEXT NOT NULL,
          style TEXT NOT NULL,
          model_name TEXT,
          model_provider TEXT DEFAULT 'gemini',
          total_segments INTEGER NOT NULL,
          duration_ms INTEGER,
          created_at INTEGER NOT NULL,
          processing_time_ms INTEGER,
          FOREIGN KEY (task_id) REFERENCES media_tasks(id) ON DELETE CASCADE
        );
      `).run();

      // 转录片段表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS transcription_segments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transcription_id TEXT NOT NULL,
          sequence INTEGER NOT NULL,
          start_ms INTEGER NOT NULL,
          end_ms INTEGER NOT NULL,
          content_type TEXT NOT NULL,
          speaker TEXT,
          original_text TEXT NOT NULL,
          translated_text TEXT NOT NULL,
          FOREIGN KEY (transcription_id) REFERENCES transcriptions(id) ON DELETE CASCADE
        );
      `).run();

      // 创建索引
      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_media_user_status ON media_tasks(user_id, status);
      `).run();

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_media_created ON media_tasks(created_at);
      `).run();

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_transcriptions_task ON transcriptions(task_id);
      `).run();

      await env.DB.prepare(`
        CREATE INDEX IF NOT EXISTS idx_segments_lookup ON transcription_segments(transcription_id, sequence);
      `).run();

      console.log('Created database tables successfully');
    } catch (error) {
      console.log('Error creating database tables:', error);
    }

    return NextResponse.json({ 
      message: 'Database migration completed successfully',
      tables: ['users', 'media_tasks', 'transcriptions', 'transcription_segments'],
      note: 'Modern architecture with unified media processing tables'
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ 
      error: 'Migration failed', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

// 获取数据库状态的辅助端点
export async function POST() {
  try {
    const context = await getCloudflareContext({ async: true });
    const env = context.env as { DB: D1Database; [key: string]: unknown };
    
    if (!env.DB) {
      throw new Error('D1 Database binding not found');
    }

    // 检查用户表是否存在
    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name = 'users';
    `).all();

    // 检查users表结构
    const userTableInfo = await env.DB.prepare(`
      PRAGMA table_info(users);
    `).all();

    // 检查用户数量
    const userCount = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM users;
    `).first();

    return NextResponse.json({
      existingTables: (tables.results as { name: string }[]).map(t => t.name),
      userTableStructure: userTableInfo.results,
      userCount: userCount?.count || 0,
      sessionStrategy: 'JWT'
    });
  } catch (error) {
    console.error('Database check error:', error);
    return NextResponse.json({ 
      error: 'Database check failed', 
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}