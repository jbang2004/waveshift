import { WorkerEntrypoint } from 'cloudflare:workers';
import { Env, TTSWatchParams, TTSWatchResponse, TranscriptionSegment, TTSEngineResponse } from './types';

// Service接口定义 - 匹配workflow中的期望
export interface TTSService {
  watch(params: TTSWatchParams): Promise<TTSWatchResponse>;
}

export class TTSWorker extends WorkerEntrypoint<Env> implements TTSService {
  
  /**
   * Service Binding RPC方法 - 监听并处理TTS
   */
  async watch(params: TTSWatchParams): Promise<TTSWatchResponse> {
    const { transcription_id, output_prefix, voice_settings } = params;
    const startTime = Date.now();
    
    console.log(`🎤 TTS Worker 开始监听处理: transcriptionId=${transcription_id}`);
    console.log(`📁 输出前缀: ${output_prefix}`);
    console.log(`🎙️ 语音设置:`, voice_settings);
    
    try {
      // 参数验证
      if (!transcription_id || !output_prefix) {
        throw new Error('缺少必要参数: transcription_id 或 output_prefix');
      }
      
      // 调用TTS引擎的HTTP API
      const ttsEngineUrl = `${this.env.TTS_ENGINE_URL}/api/watch_and_process_tts`;
      console.log(`🌐 调用TTS引擎: ${ttsEngineUrl}`);
      
      const response = await fetch(ttsEngineUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcription_id,
          output_prefix,
          voice_settings
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS引擎响应错误 ${response.status}: ${errorText}`);
      }
      
      const result: TTSEngineResponse = await response.json();
      
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`✅ TTS Worker 处理完成:`);
      console.log(`  - 处理句子数: ${result.processed_count}`);
      console.log(`  - 失败句子数: ${result.failed_count}`);
      console.log(`  - 成功率: ${result.success_rate}`);
      console.log(`  - 总耗时: ${totalTime}秒`);
      
      // 返回统一格式的响应
      return {
        success: result.success,
        processed_count: result.processed_count,
        failed_count: result.failed_count,
        success_rate: result.success_rate,
        total_time_s: totalTime,
        transcription_id: result.transcription_id,
        error: result.error
      };
      
    } catch (error) {
      console.error(`❌ TTS Worker 处理失败:`, error);
      
      // 返回错误响应
      return {
        success: false,
        processed_count: 0,
        failed_count: 0,
        success_rate: '0%',
        total_time_s: ((Date.now() - startTime) / 1000).toFixed(2),
        transcription_id,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * HTTP请求处理入口
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // 健康检查端点
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({
        status: 'healthy',
        service: 'waveshift-tts-worker',
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // 处理API请求
    if (url.pathname === '/api/watch' && request.method === 'POST') {
      try {
        const params: TTSWatchParams = await request.json();
        const result = await this.watch(params);
        
        return new Response(JSON.stringify(result), {
          headers: { 'Content-Type': 'application/json' },
          status: result.success ? 200 : 500
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }), {
          headers: { 'Content-Type': 'application/json' },
          status: 400
        });
      }
    }
    
    // 404 处理
    return new Response('Not Found', { status: 404 });
  }
}

// 导出Worker实例
export default TTSWorker;