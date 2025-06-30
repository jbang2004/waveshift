// 导入Cloudflare Workers的类型
/// <reference types="@cloudflare/workers-types" />

export interface Subtitle {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
  translation: string;
  speaker?: string;
  isEditing?: boolean;
  isPanelClosed?: boolean; // This field was in the parent component's original interface, including it for completeness, can be refined if not used by all consumers.
}

// 音视频处理功能相关的类型定义
export interface AudioVideoFeature {
  id: string;
  title: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  icon: string;
  status: 'available' | 'coming-soon';
}

// Cloudflare环境变量类型定义
export interface CloudflareEnv {
  DB: D1Database;
  NEXTAUTH_SECRET?: string;
  AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  // 添加其他环境变量
  [key: string]: any;
} 