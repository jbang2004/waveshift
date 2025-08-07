/**
 * WaveShift TTS Worker - 重构版本
 * 专注批量控制和流程编排，TTS处理委托给TTS-Engine
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import { Env, TTSWatchParams, TTSWatchResponse } from './types';
import { TTSOrchestrator } from './tts-orchestrator';
import { SegmentDatabase } from './database';

export interface TTSService {
  watch(params: TTSWatchParams): Promise<TTSWatchResponse>;
}

export class TTSWorker extends WorkerEntrypoint<Env> implements TTSService {
  
  /**
   * Service Binding RPC方法 - 主要入口
   */
  async watch(params: TTSWatchParams): Promise<TTSWatchResponse> {
    const { transcription_id, output_prefix, voice_settings, media_context } = params;
    const startTime = Date.now();
    
    console.log(`🎭 TTS Worker 启动批量处理:`);
    console.log(`  - 转录ID: ${transcription_id}`);
    console.log(`  - 输出前缀: ${output_prefix}`);
    console.log(`  - 语音设置:`, voice_settings);
    console.log(`  - 媒体上下文:`, media_context);
    
    let orchestrator: TTSOrchestrator | null = null;
    
    try {
      // 参数验证
      if (!transcription_id || !output_prefix) {
        throw new Error('缺少必要参数: transcription_id 或 output_prefix');
      }

      // 验证TTS引擎连接
      const engineUrl = this.env.TTS_ENGINE_URL;
      if (!engineUrl) {
        throw new Error('TTS_ENGINE_URL 环境变量未配置');
      }

      console.log(`🔗 TTS引擎地址: ${engineUrl}`);

      // 创建编排器并开始处理
      orchestrator = new TTSOrchestrator(this.env);
      const result = await orchestrator.synthesizeTranscription(params);

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`🎉 TTS Worker 批量处理完成:`);
      console.log(`  - 总耗时: ${totalTime}秒`);
      console.log(`  - 处理结果: 成功 ${result.processed_count}, 失败 ${result.failed_count}`);
      console.log(`  - 成功率: ${result.success_rate}`);

      return {
        ...result,
        total_time_s: totalTime,
      };
      
    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ TTS Worker 批量处理失败:`, error);
      
      return {
        success: false,
        processed_count: 0,
        failed_count: 0,
        success_rate: '0%',
        total_time_s: totalTime,
        transcription_id,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 清理资源
      if (orchestrator) {
        try {
          // 如果有媒体上下文，清理对应的任务资源
          if (media_context) {
            await orchestrator.cleanupTask(media_context.task_id);
          }
          orchestrator.cleanup();
        } catch (cleanupError) {
          console.error('❌ 资源清理失败:', cleanupError);
        }
      }
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
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        engine_url: this.env.TTS_ENGINE_URL || 'not_configured',
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 状态查询端点
    if (url.pathname === '/status' && request.method === 'GET') {
      const transcriptionId = url.searchParams.get('transcription_id');
      
      if (!transcriptionId) {
        return new Response(JSON.stringify({
          error: '缺少 transcription_id 参数'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      try {
        // 简化状态查询，直接查询数据库
        const database = new SegmentDatabase(this.env.DB);
        const stats = await database.getProcessingStats(transcriptionId);
        
        return new Response(JSON.stringify({
          success: true,
          transcription_id: transcriptionId,
          status: stats,
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    
    // API接口 - 支持HTTP调用
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
    return new Response(JSON.stringify({
      error: 'Not Found',
      available_endpoints: [
        'GET /health - 健康检查',
        'GET /status?transcription_id=xxx - 状态查询',
        'POST /api/watch - TTS批量处理',
      ]
    }), { 
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 导出Worker实例
export default TTSWorker;