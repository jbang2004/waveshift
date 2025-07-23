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
    timestamp: new Date().toISOString(),
    note: 'Container功能开发中，当前返回模拟数据'
  });
});

// 主页
app.get('/', (c) => {
  return c.html(`
    <h1>WaveShift Audio Segment Service</h1>
    <p>智能音频切分服务，基于转录数据和说话人信息进行音频片段提取</p>
    <h2>API Endpoints:</h2>
    <ul>
      <li>POST /segment - 音频切分</li>
      <li>GET /health - 健康检查</li>
    </ul>
    <h3>状态：开发中</h3>
    <p>Container功能正在开发中，当前返回模拟数据</p>
  `);
});

// WorkerEntrypoint 类定义
export class AudioSegmentWorker extends WorkerEntrypoint<Env> {
  /**
   * 音频切分方法，供Service Binding调用
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
        // 检查是否符合最小时长要求
        if (!segmenter.shouldKeepSegment(accumulator)) {
          continue;
        }
        
        // Container 处理音频
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
        
        // 🚀 立即上传到 R2 （实时反馈）
        await this.env.R2_BUCKET.put(segment.audioKey, segment.audioData, {
          httpMetadata: { contentType: 'audio/wav' }
        });
        
        console.log(`✅ R2上传完成: ${segment.audioKey}`);
        
        // 🔄 标记音频已生成，支持后续复用
        accumulator.markAudioGenerated(segment.audioKey);
        
        // 📝 收集 D1 更新数据（包括复用句子）
        for (const sentence of accumulator.getAllSentences()) {
          d1Updates.push({
            sequence: sentence.sequence,
            audioKey: segment.audioKey
          });
        }
        
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
      const sentenceToSegmentMap = segmenter.generateSentenceToSegmentMap(accumulators);
      
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
    
    const audioObject = await this.env.R2_BUCKET.get(audioKey);
    if (!audioObject) {
      throw new Error(`音频文件不存在: ${audioKey}`);
    }
    
    const audioData = await audioObject.arrayBuffer();
    console.log(`📥 音频下载完成: ${audioData.byteLength} bytes`);
    
    return audioData;
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
    const segmentId = accumulator.generateSegmentId();
    const audioKey = accumulator.generateAudioKey(outputPrefix);
    
    console.log(`🎵 处理音频片段: ${segmentId}, 时间范围: ${accumulator.timeRanges.length}段`);
    
    // 获取 Container 实例
    const container = this.env.AUDIO_SEGMENT_CONTAINER.get(
      this.env.AUDIO_SEGMENT_CONTAINER.idFromName("audio-segment")
    );
    
    // 调用 Container 的简化接口
    const response = await container.fetch(new Request('http://container/process-single', {
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
      sentences: accumulator.getAllSentences().map(s => ({
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

  /**
   * HTTP fetch处理器
   */
  async fetch(request: Request): Promise<Response> {
    // 处理Service Binding的HTTP请求
    const url = new URL(request.url);
    
    if (url.pathname === '/segment' && request.method === 'POST') {
      try {
        const data = await request.json() as AudioSegmentRequest;
        const result = await this.segment(data);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Invalid request'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 其他请求交给Hono处理
    return app.fetch(request, this.env);
  }
}


// 添加 /segment 路由到主应用 - 🔧 修复：调用新的重构逻辑
app.post('/segment', async (c) => {
  try {
    const data = await c.req.json() as AudioSegmentRequest;
    
    console.log('[HTTP /segment] 收到切分请求，调用新的重构逻辑:', {
      audioKey: data.audioKey,
      transcriptCount: data.transcripts?.length || 0,
      outputPrefix: data.outputPrefix,
      transcriptionId: data.transcriptionId  // 🔧 显示transcriptionId
    });

    // 🎯 修复：创建 AudioSegmentWorker 实例并调用新的 segment() 方法
    const worker = new AudioSegmentWorker(c.executionCtx, c.env);
    const result = await worker.segment(data);

    console.log('[HTTP /segment] 新逻辑处理完成:', {
      success: result.success,
      segmentCount: result.segments?.length || 0,
      hasTranscriptionId: !!data.transcriptionId
    });

    return c.json(result);
    
  } catch (error) {
    console.error('[HTTP /segment] 新逻辑处理失败:', error);
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Request processing failed',
      note: '使用新的重构逻辑处理'
    });
  }
});

// 导出 - 🔧 修复Service Binding entrypoint问题
export { AudioSegmentContainer };
export { AudioSegmentWorker as default };

// 保留Hono应用的兼容性导出
export const honoApp = {
  fetch: app.fetch,
};