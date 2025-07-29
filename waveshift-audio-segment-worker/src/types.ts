export interface TranscriptItem {
  sequence: number;
  startMs: number;              // 开始时间（毫秒）
  endMs: number;                // 结束时间（毫秒）
  speaker: string;
  original: string;
  translation?: string;
  content_type: 'speech' | 'non-speech';
}

export interface AudioSegment {
  segmentId: string;
  audioKey: string;
  speaker: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  sentences: Array<{
    sequence: number;
    original: string;
    translation?: string;
  }>;
}

export interface Env {
  AUDIO_SEGMENT_CONTAINER: DurableObjectNamespace;
  DB: D1Database;
  R2_BUCKET: R2Bucket;
  CLOUDFLARE_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_DOMAIN: string;
  // 音频切分配置环境变量
  GAP_DURATION_MS: string;
  MAX_DURATION_MS: string;
  MIN_DURATION_MS: string;
  GAP_THRESHOLD_MULTIPLIER: string;
}