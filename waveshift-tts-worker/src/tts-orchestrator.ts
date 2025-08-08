/**
 * TTS编排器 - 核心控制逻辑
 * 负责协调句子累积、批量发送和结果处理
 * 新增：智能任务上下文管理
 */
import { SentenceAccumulator, SegmentData } from './sentence-accumulator';
import { SegmentDatabase, SynthesisResult } from './database';
import { Env, TTSWatchParams, TTSWatchResponse, MediaContext } from './types';

export interface SynthesisRequest {
  sentences: {
    sequence: number;
    text: string;
    audioSample: string;
    speaker: string;
    startMs: number;
    endMs: number;
  }[];
  settings?: {
    language?: string;
    speed?: number;
  };
  // 新增：明确处理模式与任务ID
  mode: 'simple' | 'full';
  task_id?: string;
}

export interface SynthesisResponse {
  success: boolean;
  results: {
    sequence: number;
    audioKey: string;
    durationMs: number;
    success: boolean;
    error?: string;
  }[];
}

export class TTSOrchestrator {
  private accumulator: SentenceAccumulator;
  private database: SegmentDatabase;
  private env: Env;

  // 任务上下文管理
  private taskContexts: Map<string, MediaContext> = new Map();
  private initializedTasks: Set<string> = new Set();

  constructor(env: Env) {
    this.env = env;
    this.database = new SegmentDatabase(env.DB);
    this.accumulator = new SentenceAccumulator({
      batchSize: 3,
      timeoutMs: 10000,
    });

    console.log('🎭 TTS编排器初始化完成 (支持智能任务上下文管理)');
  }

  async synthesizeTranscription(params: TTSWatchParams): Promise<TTSWatchResponse> {
    const { transcription_id, output_prefix, voice_settings, media_context } = params;
    const startTime = Date.now();

    console.log(`🎭 开始TTS转录处理:`);
    console.log(`  - 转录ID: ${transcription_id}`);
    console.log(`  - 输出前缀: ${output_prefix}`);

    let processedCount = 0;
    let failedCount = 0;

    try {
      // 如果有媒体上下文，进行任务初始化
      if (media_context && !this.initializedTasks.has(media_context.task_id)) {
        await this.initializeTaskContext(media_context);
      }

      // 流式处理逻辑
      let lastProcessedSequence = 0;
      let consecutiveEmptyCount = 0;
      const maxEmptyCount = 5;

      while (true) {
        // 优先检查转录状态，决定是否可以安全退出
        const status = await this.database.checkTranscriptionStatus(transcription_id);
        if (status.isComplete) {
          const accEmpty = this.accumulator.isEmpty();
          if (accEmpty && status.processedSegments >= status.totalSegments) {
            console.log(`✅ 检测到转录已完成且无待处理，安全退出循环`);
            break;
          }
        }

        // 获取待处理的句子
        const segments = await this.database.fetchReadySegments(
          transcription_id,
          lastProcessedSequence,
          10
        );

        if (segments.length === 0) {
          consecutiveEmptyCount++;

          // 定时检查批次超时（无新句子也要刷新）
          if (this.accumulator.checkForTimeout()) {
            const timedOutBatch = this.accumulator.extractBatch();
            if (timedOutBatch.length > 0) {
              try {
                const results = await this.synthesizeBatch(
                  media_context?.task_id || 'default',
                  transcription_id,
                  timedOutBatch,
                  voice_settings
                );
                const successResults = results.filter(r => r.success);
                processedCount += successResults.length;
                failedCount += results.length - successResults.length;
                console.log(`⏰ 超时批次已发送: 成功 ${successResults.length}, 失败 ${results.length - successResults.length}`);
              } catch (error) {
                console.error('❌ 超时批次处理失败:', error);
                failedCount += timedOutBatch.length;
              }
            }
          }

          if (consecutiveEmptyCount >= maxEmptyCount) {
            // 如果长时间没有新句子，且已完成，则退出，否则继续等待
            if (status.isComplete && this.accumulator.isEmpty()) {
              console.log(`⏳ 长时间无新句子且转录完成，退出循环`);
              break;
            }
          }
          console.log(`⏳ 暂无新句子，等待中... (${consecutiveEmptyCount}/${maxEmptyCount})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        consecutiveEmptyCount = 0;

        // 处理句子批次
        for (const segment of segments) {
          const shouldDispatch = this.accumulator.accumulate(segment);

          if (shouldDispatch) {
            const batch = this.accumulator.extractBatch();
            if (batch.length > 0) {
              try {
                const results = await this.synthesizeBatch(
                  media_context?.task_id || 'default',
                  transcription_id,
                  batch,
                  voice_settings
                );

                // 更新统计
                const successResults = results.filter(r => r.success);
                processedCount += successResults.length;
                failedCount += results.length - successResults.length;

                console.log(`✅ 批次处理完成: 成功 ${successResults.length}, 失败 ${results.length - successResults.length}`);

              } catch (error) {
                console.error('❌ 批次处理失败:', error);
                failedCount += batch.length;
              }
            }
          }

          lastProcessedSequence = Math.max(lastProcessedSequence, segment.sequence);
        }
      }

      // 处理剩余未满批的句子（确保尾包 flush）
      const remaining = this.accumulator.extractRemaining();
      if (remaining.length > 0) {
        try {
          const results = await this.synthesizeBatch(
            media_context?.task_id || 'default',
            transcription_id,
            remaining,
            voice_settings
          );

          const successResults = results.filter(r => r.success);
          processedCount += successResults.length;
          failedCount += results.length - successResults.length;

          console.log(`✅ 尾包处理完成: 成功 ${successResults.length}, 失败 ${results.length - successResults.length}`);

        } catch (error) {
          console.error('❌ 尾包处理失败:', error);
          failedCount += remaining.length;
        }
      }

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const successRate = processedCount + failedCount > 0 ?
        `${Math.round((processedCount / (processedCount + failedCount)) * 100)}%` : '0%';

      console.log(`🎉 TTS转录处理完成:`);
      console.log(`  - 总耗时: ${totalTime}秒`);
      console.log(`  - 成功: ${processedCount}, 失败: ${failedCount}`);
      console.log(`  - 成功率: ${successRate}`);

      return {
        success: true,
        processed_count: processedCount,
        failed_count: failedCount,
        success_rate: successRate,
        total_time_s: totalTime,
        transcription_id
      };

    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ TTS转录处理失败:`, error);

      return {
        success: false,
        processed_count: processedCount,
        failed_count: failedCount + 1,
        success_rate: '0%',
        total_time_s: totalTime,
        transcription_id,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      // 尝试清理任务上下文资源
      if (media_context?.task_id) {
        await this.cleanupTask(media_context.task_id);
      }
    }
  }

  /**
   * 初始化任务上下文 - 一次性操作
   */
  private async initializeTaskContext(mediaContext: MediaContext): Promise<void> {
    const { task_id, user_id, audio_key, video_key, r2_domain } = mediaContext;

    console.log(`🎬 初始化任务上下文: ${task_id}`);
    console.log(`  - 用户ID: ${user_id}`);
    console.log(`  - 音频文件: ${audio_key}`);
    console.log(`  - 视频文件: ${video_key}`);

    try {
      // 调用TTS引擎的任务初始化接口
      const response: any = await this.fetchWithRetry(`${this.env.TTS_ENGINE_URL}/tasks/${task_id}/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id,
          audio_url: `https://${r2_domain}/${audio_key}`,
          video_url: `https://${r2_domain}/${video_key}`,
          enable_audio_separation: true
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS引擎任务初始化失败 ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`✅ 任务上下文初始化成功:`, result);

      // 缓存上下文并标记为已初始化
      this.taskContexts.set(task_id, mediaContext);
      this.initializedTasks.add(task_id);

    } catch (error) {
      console.error(`❌ 任务上下文初始化失败:`, error);
      throw error;
    }
  }

  /**
   * 发送批次到TTS引擎 - 使用任务级接口
   */
  private async synthesizeBatch(
    taskId: string,
    transcriptionId: string,
    segments: SegmentData[],
    voiceSettings?: any
  ): Promise<SynthesisResult[]> {
    if (segments.length === 0) {
      return [];
    }

    console.log(`🎤 发送批次到TTS引擎: ${segments.length} 个句子`);
    console.log(`📋 句子序号: ${segments.map(s => s.sequence).join(', ')}`);

    try {
      // 标记为处理中
      await this.database.markSegmentsProcessing(
        segments[0].sequence.toString(),
        segments.map(s => s.sequence)
      );

      // 构建批次请求
      const mode: 'simple' | 'full' = this.initializedTasks.has(taskId) ? 'full' : 'simple';
      const request: SynthesisRequest = {
        sentences: segments.map(segment => ({
          sequence: segment.sequence,
          text: segment.translation,
          audioSample: segment.audio_key,
          speaker: segment.speaker,
          startMs: segment.start_ms,
          endMs: segment.end_ms,
        })),
        settings: voiceSettings || {},
        mode,
        task_id: this.initializedTasks.has(taskId) ? taskId : undefined,
      };

      // 选择合适的API端点
      let apiEndpoint: string;
      if (this.initializedTasks.has(taskId)) {
        // 使用任务级接口（优化路径）
        apiEndpoint = `${this.env.TTS_ENGINE_URL}/tasks/${taskId}/synthesize`;
        console.log(`🚀 使用任务级接口: ${apiEndpoint}`);
      } else {
        // 使用传统接口（兼容路径）
        apiEndpoint = `${this.env.TTS_ENGINE_URL}/synthesize`;
        console.log(`🔄 使用传统接口: ${apiEndpoint}`);
      }

      // 发送到TTS引擎（带重试与退避）
      const response = await this.fetchWithRetry(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS引擎响应错误 ${response.status}: ${errorText}`);
      }

      const synthesisResponse: SynthesisResponse = await response.json();

      if (!synthesisResponse.success) {
        throw new Error(`TTS合成失败: ${synthesisResponse.results?.[0]?.error || '未知错误'}`);
      }

      // 转换结果格式
      const results: SynthesisResult[] = synthesisResponse.results.map(r => ({
        sequence: r.sequence,
        audioKey: r.audioKey,
        durationMs: r.durationMs,
        success: r.success,
        error: r.error,
      }));

      const successCount = results.filter(r => r.success).length;
      console.log(`✅ 批次合成完成: ${successCount}/${results.length} 成功`);

                    // 更新数据库状态
        await this.database.updateSynthesisResults(transcriptionId, results);

      return results;

    } catch (error) {
      console.error('❌ 批次合成失败:', error);

      // 标记批次为失败
      const errorResults: SynthesisResult[] = segments.map(s => ({
        sequence: s.sequence,
        audioKey: '',
        durationMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }));

             await this.database.updateSynthesisResults(transcriptionId, errorResults);

      return errorResults;
    }
  }

  /**
   * 清理任务资源
   */
  async cleanupTask(taskId: string): Promise<void> {
    console.log(`🧹 清理任务资源: ${taskId}`);

    try {
      // 如果任务已初始化，调用TTS引擎的清理接口
      if (this.initializedTasks.has(taskId)) {
        try {
          await fetch(`${this.env.TTS_ENGINE_URL}/tasks/${taskId}`, {
            method: 'DELETE',
          });
          console.log(`✅ TTS引擎任务资源已清理: ${taskId}`);
        } catch (error) {
          console.warn(`⚠️ TTS引擎任务清理警告: ${error}`);
        }
      }

      // 清理本地缓存
      this.taskContexts.delete(taskId);
      this.initializedTasks.delete(taskId);

      console.log(`✅ 本地任务资源已清理: ${taskId}`);
    } catch (error) {
      console.error(`❌ 任务资源清理失败: ${taskId}`, error);
    }
  }

  /**
   * 简单的带指数退避的fetch重试
   */
  private async fetchWithRetry(url: string, init: any, maxAttempts: number = 3, baseDelayMs: number = 500): Promise<any> {
    let attempt = 0;
    let lastErr: any;
    while (attempt < maxAttempts) {
      try {
        const res: any = await fetch(url, init);
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        }
        return res;
      } catch (err) {
        lastErr = err;
        attempt++;
        if (attempt >= maxAttempts) break;
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(`⚠️ 请求失败（第${attempt}次），${delay}ms后重试:`, err);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw lastErr;
  }

  /**
   * 清理所有资源
   */
  cleanup(): void {
    console.log('🧹 清理TTS编排器资源');

    // 清理所有任务
    const taskIds = Array.from(this.initializedTasks);
    for (const taskId of taskIds) {
      // 异步清理，不等待完成
      this.cleanupTask(taskId).catch(error => {
        console.error(`清理任务 ${taskId} 失败:`, error);
      });
    }

    // 清理累积器
    this.accumulator.clear();

    console.log('✅ TTS编排器资源清理完成');
  }
}