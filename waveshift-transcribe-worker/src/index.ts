/**
 * Gemini 转录服务 - Cloudflare Workers 版本
 * 提供音频转录 HTTP API 服务
 */

import { GeminiClient } from './gemini-client';
import { TranscriptionStyle } from './transcription';

// Cloudflare Workers 环境变量接口
interface Env {
  GEMINI_API_KEY: string;
  MAX_CONCURRENT_REQUESTS?: string; // 新增：最大并发请求数配置
}

// 支持的音频格式映射
const MIME_TYPE_MAP = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.webm': 'audio/webm',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.quicktime': 'video/quicktime'
} as const;

// 支持的音频格式
const SUPPORTED_MIME_TYPES = Object.values(MIME_TYPE_MAP);

// 在文件顶部导入之后立即添加
const DEBUG = false; // 生产环境默认关闭，如需调试改为 true
const dbg = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};

/**
 * 获取正确的MIME类型（整合了验证逻辑）
 */
function getMimeTypeAndValidate(file: File): { mimeType: string; error?: string } {
  // 检查文件大小 (最大 100MB)
  const maxSize = 100 * 1024 * 1024;
  if (file.size > maxSize) {
    return { 
      mimeType: '', 
      error: `文件大小超过限制，最大支持 ${maxSize / 1024 / 1024}MB` 
    };
  }

  // 获取MIME类型，如果不正确则根据文件扩展名推断
  let mimeType = file.type;
  
  if (!mimeType || mimeType === 'application/octet-stream') {
    const fileName = file.name.toLowerCase();
    const extension = Object.keys(MIME_TYPE_MAP).find(ext => fileName.endsWith(ext));
    
    if (extension) {
      mimeType = MIME_TYPE_MAP[extension as keyof typeof MIME_TYPE_MAP];
    }
  }

  if (!SUPPORTED_MIME_TYPES.includes(mimeType as any)) {
    return { 
      mimeType: '', 
      error: `不支持的文件格式: ${file.type} (推断为: ${mimeType})。支持的格式: ${SUPPORTED_MIME_TYPES.join(', ')}` 
    };
  }

  return { mimeType };
}

/**
 * 处理 CORS 预检请求
 */
function handleCORS(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  return null;
}

/**
 * 添加 CORS 头
 */
function addCORSHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return newResponse;
}

/**
 * 创建成功响应
 */
function createSuccessResponse(data: any): Response {
  const response = new Response(JSON.stringify({
    success: true,
    data: data
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return addCORSHeaders(response);
}

/**
 * 创建错误响应
 */
function createErrorResponse(error: string, status: number = 400): Response {
  const response = new Response(JSON.stringify({
    success: false,
    error: error
  }), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
  return addCORSHeaders(response);
}

/**
 * 增量式 JSON 数组解析器（TransformStream 版）
 * 仅扫描 "新到达" 的字符，避免重复遍历历史 buffer，
 * 以降低单次 pull 的 CPU 占用。
 */
function createJsonObjectTransform(): TransformStream<string, any> {
  let insideArray = false;
  let braceCount = 0;
  let inString = false;
  let escaped = false;
  let current = '';

  return new TransformStream<string, any>({
    transform(chunk, controller) {
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];

        // 尚未进入数组：跳过直到 '['
        if (!insideArray) {
          if (char === '[') insideArray = true;
          continue;
        }

        // 已在数组内但尚未开始对象，忽略逗号/空白
        if (braceCount === 0) {
          if (char === ']') {
            insideArray = false; // 数组结束
            continue;
          }
          if (char === '{') {
            braceCount = 1;
            current = '{';
          }
          continue;
        }

        // 正在收集对象内容
        current += char;

        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          // 对象结束
          if (braceCount === 0) {
            try {
              controller.enqueue(JSON.parse(current));
            } catch (_) {
              // 忽略解析失败的对象
            }
            current = '';
          }
        }
      }
    },
  });
}

/**
 * 将 AsyncIterable<string> 转换为 ReadableStream<string>
 */
function iterableToReadableStream(iterable: AsyncIterable<string>): ReadableStream<string> {
  const iterator = iterable[Symbol.asyncIterator]();
  return new ReadableStream<string>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value as string);
      }
    },
    cancel() {
      if (typeof iterator.return === 'function') iterator.return();
    },
  });
}

/**
 * 解析 Gemini 返回的 JSON 数组流（TransformStream 管线）
 */
async function* parseJsonArrayStream(source: AsyncIterable<string>): AsyncGenerator<any, void, unknown> {
  const objectStream = iterableToReadableStream(source).pipeThrough(createJsonObjectTransform());

  const reader = objectStream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      yield value;
      // 主动让出事件循环，避免连续 CPU 峰值
      await Promise.resolve();
    }
  } finally {
    reader.releaseLock();
  }
}

// 添加简单的请求队列机制
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private processing = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.processing--;
          this.processNext();
        }
      });
      this.processNext();
    });
  }

  private processNext() {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    const task = this.queue.shift();
    if (task) {
      this.processing++;
      task();
    }
  }
}

// 全局队列实例将在 Worker 主入口中动态初始化
let geminiQueue: RequestQueue;

/**
 * 处理转录请求（流式返回）
 */
async function handleTranscription(request: Request, env: Env): Promise<Response> {
  // 动态初始化队列，根据环境变量设置并发数
  if (!geminiQueue) {
    const maxConcurrent = parseInt(env.MAX_CONCURRENT_REQUESTS || '1');
    geminiQueue = new RequestQueue(maxConcurrent);
  }
  try {
    if (!env.GEMINI_API_KEY) {
      return createErrorResponse('Gemini API key not configured', 500);
    }

    const formData = await request.formData();
    const audioFile = formData.get('file') as File;
    if (!audioFile) return createErrorResponse('缺少音频文件，请上传 file 字段');

    const { mimeType, error: validationError } = getMimeTypeAndValidate(audioFile);
    if (validationError) return createErrorResponse(validationError);

    const targetLanguage = (formData.get('targetLanguage') as string) || 'chinese';
    const style = (formData.get('style') as TranscriptionStyle) || 'normal';
         const model = (formData.get('model') as string) || 'models/gemini-2.5-flash';

    if (!['chinese', 'english'].includes(targetLanguage)) {
      return createErrorResponse('targetLanguage 必须是 "chinese" 或 "english"');
    }
    if (!['normal', 'classical'].includes(style)) {
      return createErrorResponse('style 必须是 "normal" 或 "classical"');
    }

    // 初始化 Gemini 客户端
    const geminiClient = new GeminiClient({ apiKey: env.GEMINI_API_KEY, model });

    // 转换音频文件为 ArrayBuffer
    const audioBuffer = await audioFile.arrayBuffer();

    // 创建流式响应，实时组装并返回完整的转录段
    let encoder = new TextEncoder();
    let segmentCount = 0;
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送开始事件
          const startEvent = `data: ${JSON.stringify({
            type: 'start',
            metadata: {
              fileName: audioFile.name,
              fileSize: audioFile.size,
              mimeType,
              targetLanguage,
              style,
              model,
              startTime: new Date().toISOString()
            }
          })}\n\n`;
          controller.enqueue(encoder.encode(startEvent));

          // 🎯 使用队列机制控制 Gemini API 并发调用
          const chunkIterable = await geminiQueue.add(async () => {
            return geminiClient.transcribeAudioStream(
              audioBuffer,
              mimeType,
              targetLanguage,
              style,
              audioFile.name
            );
          });

          // 真正的流式处理：从碎片化JSON中实时提取完整segments
          dbg('🔍 开始优化版JSON流解析...');
          const parseStartTime = Date.now();
          
          for await (const segment of parseJsonArrayStream(chunkIterable)) {
            segmentCount++;
            dbg(`⚡ 高效提取第${segmentCount}个转录段: ${segment.sequence || 'N/A'}`);
            
            const segmentEvent = `data: ${JSON.stringify({
              type: 'segment',
              sequence: segmentCount,
              segment,
              timestamp: new Date().toISOString(),
            })}\n\n`;
            controller.enqueue(encoder.encode(segmentEvent));
          }

          const parseEndTime = Date.now();
          const parseTime = parseEndTime - parseStartTime;
          dbg(`✅ 优化版流解析完成，总共输出${segmentCount}个段，耗时${parseTime}ms (平均${parseTime/Math.max(segmentCount,1)}ms/段)`);

          // 发送完成事件
          const endEvent = `data: ${JSON.stringify({
            type: 'end',
            totalSegments: segmentCount,
            endTime: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(endEvent));

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '转录失败';
          const errorEvent = `data: ${JSON.stringify({
            type: 'error',
            error: errorMessage,
            timestamp: new Date().toISOString()
          })}\n\n`;
          controller.enqueue(encoder.encode(errorEvent));
        } finally {
          controller.close();
        }
      }
    });

    const response = new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

    return addCORSHeaders(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '服务器内部错误';
    return createErrorResponse(errorMessage, 500);
  }
}

/**
 * 处理健康检查
 */
function handleHealthCheck(): Response {
  return createSuccessResponse({
    status: 'healthy',
    service: 'gemini-transcribe-worker',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    supportedFormats: SUPPORTED_MIME_TYPES
  });
}

/**
 * 处理 API 文档
 */
function handleApiDocs(): Response {
  const docs = {
    name: 'Gemini 转录服务 API',
    version: '1.0.0',
    description: '使用 Google Gemini API 进行音频/视频转录的 Cloudflare Workers 服务',
    endpoints: {
      'POST /transcribe': {
        description: '转录音频或视频文件（流式模式，实时返回转录片段）',
        contentType: 'multipart/form-data',
        responseType: 'text/event-stream (Server-Sent Events)',
        parameters: {
          file: {
            type: 'file',
            required: true,
            description: '音频或视频文件'
          },
          targetLanguage: {
            type: 'string',
            required: false,
            default: 'chinese',
            enum: ['chinese', 'english'],
            description: '目标翻译语言'
          },
          style: {
            type: 'string',
            required: false,
            default: 'normal',
            enum: ['normal', 'classical'],
            description: '翻译风格'
          },
          model: {
            type: 'string',
            required: false,
            default: 'models/gemini-2.5-flash',
            description: 'Gemini 模型名称'
          }
        },
        events: {
          start: '开始转录，包含元数据信息',
          segment: '完整的转录段，包含时间戳、说话人、原文和翻译',
          end: '转录完成，包含总转录段数',
          error: '转录出错'
        }
      },
      'GET /health': {
        description: '健康检查',
        response: {
          success: 'boolean',
          data: {
            status: 'string',
            service: 'string',
            version: 'string',
            timestamp: 'string',
            supportedFormats: 'string[]'
          }
        }
      },
      'GET /': {
        description: 'API 文档',
        response: 'object'
      }
    },
    supportedFormats: SUPPORTED_MIME_TYPES,
    limits: {
      maxFileSize: '100MB',
      timeout: '5 minutes'
    }
  };

  return createSuccessResponse(docs);
}

/**
 * Worker 主入口
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 处理 CORS 预检请求
    const corsResponse = handleCORS(request);
    if (corsResponse) {
      return corsResponse;
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 路由处理
      switch (path) {
        case '/':
          return handleApiDocs();
          
        case '/health':
          return handleHealthCheck();
          
        case '/transcribe':
          if (request.method !== 'POST') {
            return createErrorResponse('只支持 POST 方法', 405);
          }
          return await handleTranscription(request, env);
          
        default:
          return createErrorResponse('未找到请求的路径', 404);
      }
    } catch (error) {
      console.error('Worker 处理请求时发生错误:', error);
      const errorMessage = error instanceof Error ? error.message : '服务器内部错误';
      return createErrorResponse(errorMessage, 500);
    }
  },
}; 