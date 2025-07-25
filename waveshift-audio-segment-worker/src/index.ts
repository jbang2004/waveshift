import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { AudioSegmentContainer } from './container';
import { StreamingProcessor } from './streaming-processor-v2';

// 新增Watch接口定义
export interface WatchRequest {
  audioKey: string;
  transcriptionId: string;
  outputPrefix: string;
  taskId?: string;
}

export interface WatchResponse {
  success: boolean;
  segmentCount?: number;
  sentenceToSegmentMap?: Record<number, string>;
  error?: string;
  stats?: {
    totalPolls: number;
    totalSentencesProcessed: number;
    totalDuration: number;
  };
}

// Service接口定义 - 匹配workflow/env.d.ts中的定义
export interface AudioSegmentService {
  watch(params: {
    audioKey: string;
    transcriptionId: string;
    outputPrefix: string;
    taskId?: string;
  }): Promise<{
    success: boolean;
    segmentCount?: number;
    sentenceToSegmentMap?: Record<number, string>;
    error?: string;
    stats?: {
      totalPolls: number;
      totalSentencesProcessed: number;
      totalDuration: number;
    };
  }>;
}

const app = new Hono<{ Bindings: Env }>();

// 添加CORS中间件
app.use('*', cors({
  origin: '*',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
}));

// 健康检查端点
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy',
    service: 'audio-segment-worker',
    version: '4.0',
    timestamp: new Date().toISOString(),
    note: 'Real-time streaming audio segmentation service'
  });
});

// 主页
app.get('/', (c) => {
  return c.html(`
    <h1>WaveShift Audio Segment Service v4.0</h1>
    <p>流式实时音频切分服务 - 基于转录数据进行智能实时音频片段生成</p>
    <h2>流式实时特性:</h2>
    <ul>
      <li>🔄 轮询D1数据库，实时处理新转录句子</li>
      <li>🎯 智能音频合并与复用（最长12秒）</li>
      <li>💾 实时更新D1数据库audio_key字段</li>
      <li>⚡ 高性能跨批次状态保持</li>
      <li>🚀 Rust+FFmpeg Container处理</li>
    </ul>
    <h2>流式架构:</h2>
    <p>Watch API → D1轮询 → 实时音频切分 → R2存储 → D1更新</p>
    <h3>✅ 纯流式实时处理架构</h3>
  `);
});

// WorkerEntrypoint 类定义 - 用于Service Binding RPC调用
export class AudioSegmentWorker extends WorkerEntrypoint<Env> implements AudioSegmentService {
  
  
  /**
   * 🔥 新增watch方法 - 轮询D1并实时处理
   * 🔧 修复：参数类型匹配Service Binding接口定义
   */
  async watch(params: {
    audioKey: string;
    transcriptionId: string;
    outputPrefix: string;
    taskId?: string;
  }): Promise<{
    success: boolean;
    segmentCount?: number;
    sentenceToSegmentMap?: Record<number, string>;
    error?: string;
    stats?: {
      totalPolls: number;
      totalSentencesProcessed: number;
      totalDuration: number;
    };
  }> {
    const startTime = Date.now();
    console.log(`🔄 开始监听模式: transcriptionId=${params.transcriptionId}`);
    
    // 🔧 修复：参数验证
    if (!params.outputPrefix || !params.outputPrefix.trim()) {
      console.error(`❌ watch方法参数错误: outputPrefix为空或无效: "${params.outputPrefix}"`);
      return {
        success: false,
        error: `无效的outputPrefix: "${params.outputPrefix}"`
      };
    }
    
    if (!params.audioKey || !params.transcriptionId) {
      console.error(`❌ watch方法参数错误: audioKey或transcriptionId为空`);
      return {
        success: false,
        error: `缺少必要参数: audioKey=${params.audioKey}, transcriptionId=${params.transcriptionId}`
      };
    }
    
    console.log(`✅ 参数验证通过: outputPrefix="${params.outputPrefix}", audioKey="${params.audioKey}"`);
    
    try {
      
      // 1. 预加载音频数据（只加载一次）- 增加重试机制
      let audioBytes: Uint8Array | undefined;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (retryCount < maxRetries) {
        try {
          const audioObject = await this.env.R2_BUCKET.get(params.audioKey);
          if (!audioObject) {
            throw new Error(`音频文件未找到: ${params.audioKey}`);
          }
          
          const audioData = await audioObject.arrayBuffer();
          if (audioData.byteLength === 0) {
            throw new Error(`音频文件为空: ${params.audioKey}`);
          }
          
          audioBytes = new Uint8Array(audioData);
          console.log(`📦 音频加载完成: ${audioBytes.length} bytes`);
          break;
          
        } catch (audioError) {
          retryCount++;
          console.error(`❌ 音频加载失败 (尝试 ${retryCount}/${maxRetries}):`, audioError);
          
          if (retryCount >= maxRetries) {
            return {
              success: false,
              error: `音频文件加载失败，已重试${maxRetries}次: ${audioError instanceof Error ? audioError.message : String(audioError)}`
            };
          }
          
          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
      
      // 检查音频是否成功加载
      if (!audioBytes) {
        return {
          success: false,
          error: `音频文件加载失败，已重试${maxRetries}次`
        };
      }
      
      // 2. 创建处理器实例（整个监听周期复用）
      const processor = new StreamingProcessor(
        this.env.AUDIO_SEGMENT_CONTAINER,
        this.env.R2_BUCKET,
        this.env,
        this.env.DB  // 传入DB实例用于实时更新
      );
      
      // 3. 轮询状态
      const pollState = {
        lastProcessedSequence: 0,
        totalSegments: 0,
        totalPolls: 0,
        totalSentencesProcessed: 0,
        allSentenceToSegmentMap: {} as Record<number, string>
      };
      
      // 4. 轮询主循环
      while (true) {
        pollState.totalPolls++;
        
        // 4.1 查询新句子（基于sequence递增）
        const newSegments = await this.env.DB.prepare(`
          SELECT 
            sequence,
            start_ms as startMs,
            end_ms as endMs,
            speaker,
            original,
            translation,
            content_type,
            is_last
          FROM transcription_segments 
          WHERE transcription_id = ? 
          AND sequence > ?
          ORDER BY sequence ASC
          LIMIT 50
        `).bind(params.transcriptionId, pollState.lastProcessedSequence).all();
        
        if (newSegments.results && newSegments.results.length > 0) {
          const sentenceCount = newSegments.results.length;
          const sequenceRange = `${newSegments.results[0].sequence}-${newSegments.results[sentenceCount-1].sequence}`;
          console.log(`📥 轮询#${pollState.totalPolls}: 获取到 ${sentenceCount} 个新句子 [${sequenceRange}]`);
          
          // 4.2 转换数据格式
          const transcripts = newSegments.results.map((row: any) => ({
            sequence: row.sequence,
            startMs: row.startMs,
            endMs: row.endMs,
            speaker: row.speaker,
            original: row.original,
            translation: row.translation,
            content_type: row.content_type as 'speech' | 'non-speech'
          }));
          
          // 4.3 处理新句子（StreamingProcessor会实时更新D1）
          let result;
          try {
            result = await processor.processTranscripts({
              audioData: audioBytes,
              transcripts,
              outputPrefix: params.outputPrefix,
              transcriptionId: params.transcriptionId
            });
            
            if (!result.success) {
              console.error(`❌ 处理音频片段失败: ${result.error}`);
              // 继续处理下一批，不中断整个流程
              result = { success: true, segments: [], sentenceToSegmentMap: {} };
            }
          } catch (processingError) {
            console.error(`❌ 音频处理异常:`, processingError);
            // 容错处理：继续轮询，但记录错误
            result = { success: true, segments: [], sentenceToSegmentMap: {} };
          }
          
          // 4.4 更新统计
          pollState.lastProcessedSequence = Math.max(...transcripts.map(t => t.sequence));
          pollState.totalSegments += result.segments?.length || 0;
          pollState.totalSentencesProcessed += sentenceCount;
          Object.assign(pollState.allSentenceToSegmentMap, result.sentenceToSegmentMap);
          
          console.log(`✅ 处理完成: 生成 ${result.segments?.length || 0} 个音频片段`);
          
          // 4.5 检查是否遇到最后一个句子
          const hasLastSegment = newSegments.results.some((r: any) => r.is_last === 1);
          if (hasLastSegment) {
            console.log(`🏁 检测到最后一个句子(is_last=1)，准备结束轮询`);
            break;
          }
        } else {
          console.log(`📭 轮询#${pollState.totalPolls}: 暂无新句子`);
        }
        
        // 4.6 检查转录是否完成（双重保险）
        const transcription = await this.env.DB.prepare(`
          SELECT total_segments, processing_time_ms
          FROM transcriptions 
          WHERE id = ?
        `).bind(params.transcriptionId).first();
        
        if (transcription && 
            transcription.processing_time_ms && 
            typeof transcription.total_segments === 'number' &&
            transcription.total_segments > 0 &&
            pollState.lastProcessedSequence >= transcription.total_segments) {
          console.log(`🏁 转录已完成，已处理所有 ${transcription.total_segments} 个片段`);
          break;
        }
        
        // 4.7 动态调整轮询间隔
        const pollInterval = newSegments.results?.length > 0 ? 2000 : 5000;
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // 4.8 超时保护
        const elapsedTime = Date.now() - startTime;
        if (elapsedTime > 10 * 60 * 1000) { // 10分钟
          console.warn(`⚠️ 轮询超时(10分钟)，强制结束`);
          break;
        }
      }
      
      // 🚀 5. 处理转录结束时的剩余累积器
      console.log(`🎬 轮询结束，开始处理剩余累积器`);
      try {
        const finalResult = await processor.finalizeTranscription({
          audioData: audioBytes,
          outputPrefix: params.outputPrefix,
          transcriptionId: params.transcriptionId
        });
        
        if (finalResult.success && finalResult.segments && finalResult.segments.length > 0) {
          // 更新统计
          pollState.totalSegments += finalResult.segments.length;
          Object.assign(pollState.allSentenceToSegmentMap, finalResult.sentenceToSegmentMap);
          
          console.log(`✅ 剩余累积器处理完成: 额外生成 ${finalResult.segments.length} 个音频片段`);
        } else if (!finalResult.success) {
          console.error(`❌ 剩余累积器处理失败: ${finalResult.error}`);
        } else {
          console.log(`📭 无剩余累积器需要处理`);
        }
      } catch (finalizeError) {
        console.error(`❌ 剩余累积器处理异常:`, finalizeError);
        // 不中断整个流程，只记录错误
      }
      
      const totalDuration = Date.now() - startTime;
      console.log(`✅ 音频切分监听完成:`);
      console.log(`  - 总耗时: ${totalDuration}ms`);
      console.log(`  - 轮询次数: ${pollState.totalPolls}`);
      console.log(`  - 处理句子数: ${pollState.totalSentencesProcessed}`);
      console.log(`  - 生成音频片段: ${pollState.totalSegments} (含剩余处理)`);
      
      return {
        success: true,
        segmentCount: pollState.totalSegments,
        sentenceToSegmentMap: pollState.allSentenceToSegmentMap,
        stats: {
          totalPolls: pollState.totalPolls,
          totalSentencesProcessed: pollState.totalSentencesProcessed,
          totalDuration
        }
      };
      
    } catch (error) {
      console.error(`❌ 音频切分监听失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  




  // 🔥 移除fetch方法，保持WorkerEntrypoint纯净，只处理RPC调用
}



// 导出 - 🔧 修复Service Binding entrypoint问题  
export { AudioSegmentContainer };
// AudioSegmentWorker已在类定义处export，无需重复导出

// HTTP处理器 - 处理普通HTTP请求（健康检查、调试等）
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env);
  }
};