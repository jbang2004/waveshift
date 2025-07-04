import { getCloudflareContext } from '@opennextjs/cloudflare';

interface CloudflareEnv {
  DB: D1Database;
}

export async function POST() {
  try {
    // 获取 Cloudflare 环境
    const context = await getCloudflareContext({ async: true });
    const env = context.env as CloudflareEnv;

    console.log('开始创建媒体处理相关表...');

    // 创建媒体任务表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS media_tasks (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        videoId INTEGER,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        uploadUrl TEXT,
        uploadId TEXT,
        fileSize INTEGER,
        fileName TEXT,
        mimeType TEXT,
        workflowId TEXT,
        workflowStatus TEXT,
        videoUrl TEXT,
        audioUrl TEXT,
        transcriptionId TEXT,
        error TEXT,
        errorDetails TEXT,
        createdAt INTEGER NOT NULL,
        startedAt INTEGER,
        completedAt INTEGER,
        updatedAt INTEGER NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `).run();

    // 创建转录任务表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS transcriptions (
        id TEXT PRIMARY KEY,
        taskId TEXT NOT NULL,
        targetLanguage TEXT NOT NULL,
        style TEXT NOT NULL,
        model TEXT,
        fileName TEXT,
        fileSize INTEGER,
        mimeType TEXT,
        totalSegments INTEGER NOT NULL,
        duration INTEGER,
        startTime TEXT,
        endTime TEXT,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (taskId) REFERENCES media_tasks(id) ON DELETE CASCADE
      )
    `).run();

    // 创建转录片段表
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS transcription_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcriptionId TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        start TEXT NOT NULL,
        end TEXT NOT NULL,
        contentType TEXT NOT NULL,
        speaker TEXT NOT NULL,
        original TEXT NOT NULL,
        translation TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        FOREIGN KEY (transcriptionId) REFERENCES transcriptions(id) ON DELETE CASCADE
      )
    `).run();

    // 创建索引
    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_media_tasks_user_id ON media_tasks(userId)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_media_tasks_status ON media_tasks(status)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_transcriptions_task_id ON transcriptions(taskId)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_segments_transcription_id ON transcription_segments(transcriptionId)
    `).run();

    await env.DB.prepare(`
      CREATE INDEX IF NOT EXISTS idx_segments_sequence ON transcription_segments(transcriptionId, sequence)
    `).run();

    console.log('媒体处理相关表创建完成');

    return Response.json({
      success: true,
      message: '媒体处理相关表创建完成',
      tables: ['media_tasks', 'transcriptions', 'transcription_segments']
    });

  } catch (error) {
    console.error('创建媒体表失败:', error);
    return Response.json(
      { error: 'Failed to create media tables', details: error },
      { status: 500 }
    );
  }
}