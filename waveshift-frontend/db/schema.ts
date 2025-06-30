import { integer, text, sqliteTable } from 'drizzle-orm/sqlite-core';

// 用户表
export const users = sqliteTable('users', {
  id: text('id').notNull().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  hashedPassword: text('hashedPassword'), // 用于邮箱/密码登录
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
});

// 业务数据表
export const videos = sqliteTable('videos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fileName: text('fileName').notNull(),
  storagePath: text('storagePath').notNull(),
  bucketName: text('bucketName').notNull(),
  status: text('status').notNull(), // 'pending', 'preprocessed', 'completed', 'error'
  videoWidth: integer('videoWidth'),
  videoHeight: integer('videoHeight'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
});

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('taskId').notNull().unique(),
  videoId: integer('videoId').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  status: text('status').notNull(), // 'pending', 'preprocessed', 'completed', 'error'
  hlsPlaylistUrl: text('hlsPlaylistUrl'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
});

export const sentences = sqliteTable('sentences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('taskId').notNull().references(() => tasks.taskId, { onDelete: 'cascade' }),
  sentenceIndex: integer('sentenceIndex').notNull(),
  rawText: text('rawText').notNull(),
  transText: text('transText'),
  startMs: integer('startMs').notNull(),
  endMs: integer('endMs').notNull(),
  speakerId: integer('speakerId'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}); 