-- 删除现有表（如果存在）
DROP TABLE IF EXISTS sentences;
DROP TABLE IF EXISTS tasks; 
DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS verification_tokens;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS users;

-- 创建 NextAuth 必需的表
-- Users 表 - 添加 id 列和 hashedPassword 列
CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER,
  image TEXT,
  hashedPassword TEXT
);

-- Accounts 表 - 添加 id 列
CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(provider, providerAccountId)
);

-- Sessions 表 - 添加 id 列
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  sessionToken TEXT NOT NULL UNIQUE,
  userId TEXT NOT NULL,
  expires INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

-- Verification tokens 表
CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- 业务表
CREATE TABLE videos (
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

CREATE TABLE tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  taskId TEXT NOT NULL UNIQUE,
  videoId INTEGER NOT NULL,
  status TEXT NOT NULL,
  hlsPlaylistUrl TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (videoId) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE TABLE sentences (
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

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_userId ON sessions(userId);
CREATE INDEX IF NOT EXISTS idx_sessions_sessionToken ON sessions(sessionToken);
CREATE INDEX IF NOT EXISTS idx_videos_userId ON videos(userId);
CREATE INDEX IF NOT EXISTS idx_tasks_taskId ON tasks(taskId);
CREATE INDEX IF NOT EXISTS idx_sentences_taskId ON sentences(taskId); 