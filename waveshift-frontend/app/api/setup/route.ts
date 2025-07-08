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

      // 视频表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS videos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          userId TEXT NOT NULL,
          fileName TEXT NOT NULL,
          storagePath TEXT NOT NULL,
          bucketName TEXT NOT NULL,
          status TEXT NOT NULL,
          videoWidth INTEGER,
          videoHeight INTEGER,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
        );
      `).run();

      // 任务表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          taskId TEXT NOT NULL UNIQUE,
          videoId INTEGER NOT NULL,
          status TEXT NOT NULL,
          hlsPlaylistUrl TEXT,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
        );
      `).run();

      // 字幕表
      await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS sentences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          taskId TEXT NOT NULL,
          sentenceIndex INTEGER NOT NULL,
          rawText TEXT NOT NULL,
          transText TEXT,
          startMs INTEGER NOT NULL,
          endMs INTEGER NOT NULL,
          speakerId INTEGER,
          createdAt INTEGER NOT NULL,
          updatedAt INTEGER NOT NULL,
          FOREIGN KEY (taskId) REFERENCES tasks(taskId) ON DELETE CASCADE
        );
      `).run();

      console.log('Created JWT authentication database tables');
    } catch (error) {
      console.log('Error creating database tables:', error);
    }

    return NextResponse.json({ 
      message: 'Database migration completed successfully (JWT Session)',
      tables: ['users', 'videos', 'tasks', 'sentences'],
      note: 'Using JWT sessions - no session tables needed'
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