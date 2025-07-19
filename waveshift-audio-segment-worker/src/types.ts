export interface AudioSegmentRequest {
  audioKey: string;             // R2 中的音频文件 key
  transcripts: TranscriptItem[]; // 转录数据
  goalDurationMs?: number;      // 目标片段时长（毫秒）
  minDurationMs?: number;       // 最小片段时长（毫秒）  
  paddingMs?: number;           // 片段间的padding（毫秒）
  outputPrefix: string;         // 输出文件前缀
}

export interface TranscriptItem {
  sequence: number;
  startMs: number;              // 直接使用毫秒值
  endMs: number;                // 直接使用毫秒值
  speaker: string;
  original: string;
  translation?: string;
  content_type: 'speech' | 'non-speech';
}

export interface AudioSegmentResponse {
  success: boolean;
  segments?: AudioSegment[];
  sentenceToSegmentMap?: Record<number, string>; // sequence -> segment_id
  error?: string;
}

export interface AudioSegment {
  segmentId: string;            // 片段ID
  audioKey: string;             // R2 中的音频文件 key
  speaker: string;
  startMs: number;
  endMs: number;
  durationMs: number;
  sentences: {
    sequence: number;
    original: string;
    translation?: string;
  }[];
}

export interface Env {
  AUDIO_SEGMENT_CONTAINER: DurableObjectNamespace;
  R2_BUCKET: R2Bucket;
  CLOUDFLARE_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET_NAME: string;
  R2_PUBLIC_DOMAIN: string;
}