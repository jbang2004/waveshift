import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AudioSegmentRequest, AudioSegmentResponse, TranscriptItem, Env } from './types';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { AudioSegmentContainer } from './container';

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
   */
  async segment(request: AudioSegmentRequest): Promise<AudioSegmentResponse> {
    console.log('[AudioSegmentWorker] 收到切分请求:', {
      audioKey: request.audioKey,
      transcriptCount: request.transcripts.length,
      outputPrefix: request.outputPrefix
    });

    try {
      // 获取Container实例
      const id = this.env.AUDIO_SEGMENT_CONTAINER.idFromName("audio-segment");
      const container = this.env.AUDIO_SEGMENT_CONTAINER.get(id);

      // 准备请求数据
      const containerRequest = new Request('http://container/segment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          r2Config: {
            accountId: this.env.CLOUDFLARE_ACCOUNT_ID,
            accessKeyId: this.env.R2_ACCESS_KEY_ID,
            secretAccessKey: this.env.R2_SECRET_ACCESS_KEY,
            bucketName: this.env.R2_BUCKET_NAME,
            publicDomain: this.env.R2_PUBLIC_DOMAIN,
          }
        })
      });

      // 调用Container
      const response = await container.fetch(containerRequest);
      
      if (!response.ok) {
        const error = await response.text();
        console.error('[AudioSegmentWorker] Container返回错误:', error);
        return {
          success: false,
          error: `Container error: ${error}`
        };
      }

      // 解析响应
      const result = await response.json() as AudioSegmentResponse;
      console.log('[AudioSegmentWorker] 切分完成:', {
        success: result.success,
        segmentCount: result.segments?.length || 0
      });

      return result;

    } catch (error) {
      console.error('[AudioSegmentWorker] 容器不可用，返回模拟数据:', error);
      
      // 容器不可用时返回模拟数据
      const mockSegments = request.transcripts.map((transcript: TranscriptItem, index: number) => {
        const segmentKey = `${request.outputPrefix}/segment_${String(index + 1).padStart(3, '0')}.mp3`;
        const startMs = transcript.startMs;
        const endMs = transcript.endMs;
        return {
          segmentId: `mock_segment_${Date.now()}_${index}`,
          audioKey: segmentKey,
          speaker: transcript.speaker,
          startMs: startMs,
          endMs: endMs,
          durationMs: endMs - startMs,
          sentences: [{
            sequence: transcript.sequence,
            original: transcript.original,
            translation: transcript.translation
          }]
        };
      });

      console.log('[AudioSegmentWorker] 返回模拟数据片段:', mockSegments.length);
      
      return {
        success: true,
        segments: mockSegments,
        note: '容器不可用，返回模拟数据 - 容器部署完成后将处理真实音频',
        containerStatus: 'unavailable'
      };
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


// 添加 /segment 路由到主应用
app.post('/segment', async (c) => {
  try {
    const data = await c.req.json() as AudioSegmentRequest;
    
    console.log('[HTTP /segment] 收到切分请求:', {
      audioKey: data.audioKey,
      transcriptCount: data.transcripts?.length || 0,
      outputPrefix: data.outputPrefix
    });

    // 直接尝试访问容器
    const id = c.env.AUDIO_SEGMENT_CONTAINER.idFromName("audio-segment");
    const container = c.env.AUDIO_SEGMENT_CONTAINER.get(id);

    // 准备请求数据
    const containerRequest = new Request('http://container/segment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...data,
        r2Config: {
          accountId: c.env.CLOUDFLARE_ACCOUNT_ID,
          accessKeyId: c.env.R2_ACCESS_KEY_ID,
          secretAccessKey: c.env.R2_SECRET_ACCESS_KEY,
          bucketName: c.env.R2_BUCKET_NAME,
          publicDomain: c.env.R2_PUBLIC_DOMAIN,
        },
        segmentConfig: {
          gapDurationMs: parseInt(c.env.GAP_DURATION_MS || '500'),
          maxDurationMs: parseInt(c.env.MAX_DURATION_MS || '12000'),
          minDurationMs: parseInt(c.env.MIN_DURATION_MS || '1000'),
          gapThresholdMultiplier: parseInt(c.env.GAP_THRESHOLD_MULTIPLIER || '3')
        }
      })
    });

    console.log('[HTTP /segment] 调用容器...');
    
    // 调用Container
    const response = await container.fetch(containerRequest);
    
    if (!response.ok) {
      const error = await response.text();
      console.error('[HTTP /segment] Container返回错误:', error);
      return c.json({
        success: false,
        error: `Container error: ${error}`,
        containerStatus: 'error'
      });
    }

    // 解析响应
    const result = await response.json() as AudioSegmentResponse;
    console.log('[HTTP /segment] 切分完成:', {
      success: result.success,
      segmentCount: result.segments?.length || 0
    });

    return c.json(result);
    
  } catch (error) {
    console.error('[HTTP /segment] 处理失败:', error);
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Request processing failed',
      containerStatus: 'error'
    });
  }
});

// 导出
export { AudioSegmentContainer };
export default {
  fetch: app.fetch,
};