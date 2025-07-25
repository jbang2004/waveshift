import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AudioSegmentRequest, AudioSegmentResponse, Env } from './types';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { AudioSegmentContainer } from './container';
import { 
  AudioSegmenter, 
  StreamingAccumulator, 
  type AudioSegmentConfig 
} from './streaming-processor';
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
  segment(request: AudioSegmentRequest): Promise<AudioSegmentResponse>;
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
    version: '3.0',
    timestamp: new Date().toISOString(),
    note: 'Smart audio segmentation with reuse optimization'
  });
});

// 主页
app.get('/', (c) => {
  return c.html(`
    <h1>WaveShift Audio Segment Service</h1>
    <p>智能音频切分服务 - 基于转录数据进行音频片段智能提取和复用</p>
    <h2>特性:</h2>
    <ul>
      <li>🎯 智能音频切分（最长12秒）</li>
      <li>🔄 音频复用优化</li>
      <li>📊 实时D1数据库更新</li>
      <li>🚀 高性能Container处理</li>
    </ul>
    <h2>Architecture:</h2>
    <p>Worker (业务逻辑 + R2/D1) + Container (纯FFmpeg处理)</p>
    <h3>✅ Production Ready</h3>
  `);
});

// WorkerEntrypoint 类定义 - 用于Service Binding RPC调用
export class AudioSegmentWorker extends WorkerEntrypoint<Env> implements AudioSegmentService {
  
  /**
   * 🔧 新增：统一URL规范化方法
   */
  private normalizeAudioUrl(audioKey: string): string {
    // 如果已经是完整URL，直接返回
    if (audioKey.startsWith('http')) {
      return audioKey;
    }
    
    // 构建完整的R2公共URL
    const r2PublicDomain = this.env.R2_PUBLIC_DOMAIN;
    if (r2PublicDomain) {
      return `https://${r2PublicDomain}/${audioKey}`;
    }
    
    // fallback: 返回相对路径
    console.warn(`⚠️ R2_PUBLIC_DOMAIN未配置，使用相对路径: ${audioKey}`);
    return audioKey;
  }
  
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
            console.log(`🏁 检测到最后一个句子(is_last=1)，结束轮询`);
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
      
      const totalDuration = Date.now() - startTime;
      console.log(`✅ 音频切分监听完成:`);
      console.log(`  - 总耗时: ${totalDuration}ms`);
      console.log(`  - 轮询次数: ${pollState.totalPolls}`);
      console.log(`  - 处理句子数: ${pollState.totalSentencesProcessed}`);
      console.log(`  - 生成音频片段: ${pollState.totalSegments}`);
      
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
  
  /**
   * 音频切分方法，供Service Binding调用（保持向后兼容）
   * 新架构：Worker 处理业务逻辑 + 混合更新策略
   */
  async segment(request: AudioSegmentRequest): Promise<AudioSegmentResponse> {
    console.log('[AudioSegmentWorker] 收到切分请求:', {
      audioKey: request.audioKey,
      transcriptCount: request.transcripts.length,
      outputPrefix: request.outputPrefix,
      transcriptionId: request.transcriptionId
    });

    try {
      // 🎯 步骤1: Worker 下载音频数据
      const audioData = await this.downloadAudioFromR2(request.audioKey);
      
      // 🎯 步骤2: Worker 执行流式处理逻辑
      const segmentConfig: AudioSegmentConfig = {
        gapDurationMs: parseInt(this.env.GAP_DURATION_MS || '500'),
        maxDurationMs: parseInt(this.env.MAX_DURATION_MS || '12000'),
        minDurationMs: parseInt(this.env.MIN_DURATION_MS || '1000'),
        gapThresholdMultiplier: parseInt(this.env.GAP_THRESHOLD_MULTIPLIER || '3')
      };
      
      const segmenter = new AudioSegmenter(segmentConfig);
      const accumulators = segmenter.processTranscriptsStreaming(request.transcripts);
      
      if (accumulators.length === 0) {
        console.log('[AudioSegmentWorker] 没有需要处理的音频片段');
        return { success: true, segments: [], sentenceToSegmentMap: {} };
      }
      
      // 🎯 步骤3: 流式处理每个累积器，实时上传 R2
      const segments = [];
      const d1Updates: Array<{sequence: number, audioKey: string}> = [];
      
      for (const accumulator of accumulators) {
        // 🔄 特殊处理：如果accumulator只包含复用句子，跳过音频生成
        if (accumulator.pendingSentences.length === 0 && accumulator.reusedSentences.length > 0) {
          console.log(`🔄 跳过纯复用片段: ${accumulator.generateSegmentId()}, ` +
                      `复用句子数=${accumulator.reusedSentences.length}`);
          
          // 直接收集 D1 更新数据（使用已存在的音频key）
          if (accumulator.generatedAudioKey) {
            const normalizedAudioUrl = this.normalizeAudioUrl(accumulator.generatedAudioKey);
            
            for (const sentence of accumulator.reusedSentences) {
              d1Updates.push({
                sequence: sentence.sequence,
                audioKey: normalizedAudioUrl
              });
            }
          }
          continue;
        }
        
        // 检查是否符合最小时长要求
        if (!segmenter.shouldKeepSegment(accumulator)) {
          console.log(`🗑️ 跳过过短片段: ${accumulator.generateSegmentId()}, ` +
                      `时长=${accumulator.getTotalDuration(segmentConfig.gapDurationMs)}ms < 最小时长=${segmentConfig.minDurationMs}ms`);
          continue;
        }
        
        // Container 处理音频（只处理pendingSentences）
        const segment = await this.processAccumulatorWithContainer(
          accumulator, 
          audioData, 
          request.outputPrefix,
          segmentConfig.gapDurationMs
        );
        
        if (!segment) {
          console.error(`[AudioSegmentWorker] 处理片段失败: ${accumulator.generateSegmentId()}`);
          continue;
        }
        
        // 🚀 立即上传到 R2 （使用相对路径）
        const relativeAudioKey = segment.audioKey; // 这里是相对路径
        await this.env.R2_BUCKET.put(relativeAudioKey, segment.audioData, {
          httpMetadata: { contentType: 'audio/wav' }
        });
        
        console.log(`✅ R2上传完成: ${relativeAudioKey}`);
        
        // 🔧 修复：生成完整URL用于D1存储和复用
        const fullAudioUrl = this.normalizeAudioUrl(relativeAudioKey);
        
        // 📝 收集 D1 更新数据（使用完整URL）
        for (const sentence of accumulator.pendingSentences) {
          d1Updates.push({
            sequence: sentence.sequence,
            audioKey: fullAudioUrl
          });
        }
        
        // 🔄 同时收集复用句子的D1更新数据（使用相同的音频URL）
        for (const sentence of accumulator.reusedSentences) {
          d1Updates.push({
            sequence: sentence.sequence,
            audioKey: fullAudioUrl
          });
        }
        
        // 🔧 更新segment返回的audioKey为完整URL
        segment.audioKey = fullAudioUrl;
        
        // 移除 audioData 减少内存占用
        delete segment.audioData;
        segments.push(segment);
      }
      
      // 🎯 步骤4: 批量更新 D1 数据库
      if (d1Updates.length > 0 && request.transcriptionId) {
        await this.batchUpdateD1AudioKeys(request.transcriptionId, d1Updates);
        console.log(`✅ D1批量更新完成: ${d1Updates.length} 条记录`);
      }
      
      // 🎯 步骤5: 生成句子映射关系
      const sentenceToSegmentMap: Record<number, string> = {};
      for (const accumulator of accumulators) {
        const segmentId = accumulator.generateSegmentId();
        // 映射待处理句子
        for (const sentence of accumulator.pendingSentences) {
          sentenceToSegmentMap[sentence.sequence] = segmentId;
        }
        // 🔄 映射复用句子
        for (const sentence of accumulator.reusedSentences) {
          sentenceToSegmentMap[sentence.sequence] = segmentId;
        }
      }
      
      console.log('[AudioSegmentWorker] 切分完成:', {
        success: true,
        segmentCount: segments.length,
        d1UpdateCount: d1Updates.length
      });

      return {
        success: true,
        segments,
        sentenceToSegmentMap
      };

    } catch (error) {
      console.error('[AudioSegmentWorker] 处理失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 从 R2 下载音频文件
   */
  private async downloadAudioFromR2(audioKey: string): Promise<ArrayBuffer> {
    console.log(`📥 从 R2 下载音频: ${audioKey}`);
    
    // 🔧 修复：添加更详细的错误信息和调试日志
    try {
      const audioObject = await this.env.R2_BUCKET.get(audioKey);
      if (!audioObject) {
        // 列出R2桶中的文件进行调试
        console.error(`❌ 音频文件不存在: ${audioKey}`);
        
        // 尝试列出相近的文件（用于调试）
        const list = await this.env.R2_BUCKET.list({ prefix: audioKey.split('/')[0] || '', limit: 5 });
        console.log(`🔍 R2桶中相近文件:`, list.objects.map(obj => obj.key));
        
        throw new Error(`音频文件不存在: ${audioKey} (请检查R2桶中是否有此文件)`);
      }
      
      const audioData = await audioObject.arrayBuffer();
      if (audioData.byteLength === 0) {
        throw new Error(`音频文件为空: ${audioKey}`);
      }
      
      console.log(`📥 音频下载完成: ${audioData.byteLength} bytes`);
      return audioData;
      
    } catch (error) {
      console.error(`❌ R2音频下载失败: ${audioKey}`, error);
      throw error;
    }
  }

  /**
   * 使用 Container 处理单个累积器
   */
  private async processAccumulatorWithContainer(
    accumulator: StreamingAccumulator,
    audioData: ArrayBuffer,
    outputPrefix: string,
    gapDurationMs: number
  ): Promise<any> {
    // 🔧 修复：参数验证
    if (!outputPrefix || !outputPrefix.trim()) {
      console.error(`❌ outputPrefix为空或无效: "${outputPrefix}"`);
      return null;
    }
    
    const segmentId = accumulator.generateSegmentId();
    const audioKey = accumulator.generateAudioKey(outputPrefix); // 相对路径
    
    console.log(`🎵 处理音频片段: ${segmentId}, 时间范围: ${accumulator.timeRanges.length}段`);
    
    // 获取 Container 实例
    const container = this.env.AUDIO_SEGMENT_CONTAINER.get(
      this.env.AUDIO_SEGMENT_CONTAINER.idFromName("audio-segment")
    );
    
    // 调用 Container 的根路径接口 - 类似FFmpeg Container模式
    const response = await container.fetch(new Request('https://audio-segment/', {
      method: 'POST',
      body: audioData,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Time-Ranges': JSON.stringify(accumulator.timeRanges),
        'X-Segment-Id': segmentId,
        'X-Speaker': accumulator.speaker,
        'X-Gap-Duration': gapDurationMs.toString()
      }
    }));
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`Container 处理失败: ${error}`);
      return null;
    }
    
    const result = await response.arrayBuffer();
    
    return {
      segmentId,
      audioKey,
      speaker: accumulator.speaker,
      startMs: accumulator.timeRanges[0][0],
      endMs: accumulator.timeRanges[accumulator.timeRanges.length - 1][1],
      durationMs: accumulator.getTotalDuration(gapDurationMs),
      sentences: accumulator.getAllSentences().map((s: any) => ({
        sequence: s.sequence,
        original: s.original,
        translation: s.translation
      })),
      audioData: result  // 用于 R2 上传
    };
  }

  /**
   * 批量更新 D1 数据库中的 audio_key 字段
   */
  private async batchUpdateD1AudioKeys(
    transcriptionId: string,
    updates: Array<{sequence: number, audioKey: string}>
  ): Promise<void> {
    console.log(`💾 开始批量更新 D1: transcriptionId=${transcriptionId}, 更新数量=${updates.length}`);
    
    // 🚀 按 audioKey 分组，减少 SQL 调用次数
    const groupedUpdates = new Map<string, number[]>();
    
    for (const update of updates) {
      if (!groupedUpdates.has(update.audioKey)) {
        groupedUpdates.set(update.audioKey, []);
      }
      groupedUpdates.get(update.audioKey)!.push(update.sequence);
    }
    
    console.log(`📝 分组优化: ${updates.length} 条更新 → ${groupedUpdates.size} 个SQL语句`);
    
    // 🎯 并行执行分组更新
    const updatePromises = Array.from(groupedUpdates.entries()).map(
      async ([audioKey, sequences]) => {
        try {
          const placeholders = sequences.map(() => '?').join(',');
          
          const result = await this.env.DB.prepare(`
            UPDATE transcription_segments 
            SET audio_key = ? 
            WHERE transcription_id = ? 
            AND sequence IN (${placeholders})
          `).bind(audioKey, transcriptionId, ...sequences).run();
          
          console.log(`✅ D1更新成功: ${audioKey} → ${sequences.length}句 (影响${result.meta.changes}行)`);
          
          return { success: true, audioKey, updateCount: sequences.length, changes: result.meta.changes };
        } catch (error) {
          console.error(`❌ D1更新失败: ${audioKey}`, error);
          return { success: false, audioKey, error: error instanceof Error ? error.message : 'Unknown error' };
        }
      }
    );
    
    // 等待所有更新完成
    const results = await Promise.all(updatePromises);
    
    // 统计结果
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;
    const totalChanges = results
      .filter(r => r.success && 'changes' in r)
      .reduce((sum, r) => sum + (r.changes || 0), 0);
    
    console.log(`📊 D1批量更新完成: 成功${successCount}/${results.length}, 总影响行数=${totalChanges}`);
    
    if (failureCount > 0) {
      const failures = results.filter(r => !r.success);
      console.warn(`⚠️ 部分更新失败:`, failures.map(f => ({ audioKey: f.audioKey, error: f.error })));
    }
  }

  // 🔥 移除fetch方法，保持WorkerEntrypoint纯净，只处理RPC调用
}


// 添加 /segment 路由到主应用 - 🔧 修复：使用静态实例调用
app.post('/segment', async (c) => {
  try {
    const data = await c.req.json() as AudioSegmentRequest;
    
    console.log('[HTTP /segment] 收到切分请求:', {
      audioKey: data.audioKey,
      transcriptCount: data.transcripts?.length || 0,
      outputPrefix: data.outputPrefix,
      transcriptionId: data.transcriptionId
    });

    // 🎯 修复：创建 AudioSegmentWorker 实例用于HTTP调用
    const worker = new AudioSegmentWorker(c.executionCtx, c.env);
    const result = await worker.segment(data);

    console.log('[HTTP /segment] 处理完成:', {
      success: result.success,
      segmentCount: result.segments?.length || 0,
      hasTranscriptionId: !!data.transcriptionId
    });

    return c.json(result);
    
  } catch (error) {
    console.error('[HTTP /segment] 处理失败:', error);
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Request processing failed'
    });
  }
});

// 导出 - 🔧 修复Service Binding entrypoint问题  
export { AudioSegmentContainer };
// AudioSegmentWorker已在类定义处export，无需重复导出

// HTTP处理器 - 处理普通HTTP请求（健康检查、调试等）
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return app.fetch(request, env);
  }
};