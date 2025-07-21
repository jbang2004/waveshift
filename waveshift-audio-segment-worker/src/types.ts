export interface AudioSegmentRequest {
  audioKey: string;             // R2 中的音频文件 key
  transcripts: TranscriptItem[]; // 转录数据
  outputPrefix: string;         // 输出文件前缀
  // 注意：切分参数现在通过环境变量配置：
  // GAP_DURATION_MS, MAX_DURATION_MS, MIN_DURATION_MS
}

export interface TranscriptItem {
  sequence: number;
  startMs: number;              // 开始时间（毫秒）
  endMs: number;                // 结束时间（毫秒）
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
  note?: string;                    // 可选的说明信息
  containerStatus?: string;         // 容器状态信息
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
  // 音频切分配置环境变量
  GAP_DURATION_MS: string;
  MAX_DURATION_MS: string;
  MIN_DURATION_MS: string;
  GAP_THRESHOLD_MULTIPLIER: string;
}