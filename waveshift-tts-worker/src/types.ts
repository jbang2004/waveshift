export interface Env {
  // D1数据库
  DB: D1Database;
  
  // R2存储
  R2_BUCKET: R2Bucket;
  
  // 环境变量
  TTS_ENGINE_URL: string;
  R2_PUBLIC_DOMAIN: string;
}

// 媒体上下文信息
export interface MediaContext {
  task_id: string;
  user_id: string;
  audio_key: string;    // R2中的音频文件键
  video_key: string;    // R2中的视频文件键
  r2_domain: string;    // R2公共域名
}

// TTS请求参数接口
export interface TTSWatchParams {
  transcription_id: string;
  output_prefix: string;
  voice_settings?: {
    language?: string;
    speed?: number;
    pitch?: number;
    [key: string]: any;
  };
  // 新增：媒体上下文信息，用于TTS引擎获取音视频文件
  media_context?: MediaContext;
}

// TTS响应接口
export interface TTSWatchResponse {
  success: boolean;
  processed_count: number;
  failed_count: number;
  success_rate: string;
  total_time_s: string;
  transcription_id: string;
  error?: string;
}

// 数据库中的转录片段结构
export interface TranscriptionSegment {
  id: number;
  transcription_id: string;
  sequence: number;
  original_text: string | null;
  translation: string | null;
  start_ms: number;
  end_ms: number;
  audio_key: string | null;
  tts_audio_key: string | null;
  tts_status: string | null;
  tts_updated_at: string | null;
}

// TTS引擎API响应接口
export interface TTSEngineResponse {
  success: boolean;
  processed_count: number;
  failed_count: number;
  success_rate: string;
  total_time_s: string;
  transcription_id: string;
  error?: string;
}