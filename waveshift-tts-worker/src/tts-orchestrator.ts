/**
 * TTS编排器 - 核心控制逻辑
 * 负责协调句子累积、批量发送和结果处理
 */

import { SentenceAccumulator, SegmentData } from './sentence-accumulator';
import { SegmentDatabase, SynthesisResult } from './database';
import { Env, TTSWatchParams, TTSWatchResponse } from './types';

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
  error?: string;
}

export class TTSOrchestrator {
  private accumulator: SentenceAccumulator;
  private database: SegmentDatabase;
  private env: Env;

  constructor(env: Env) {
    this.env = env;
    this.accumulator = new SentenceAccumulator({
      batchSize: 3,
      timeoutMs: 2000,
      maxWaitMs: 5000,
    });
    this.database = new SegmentDatabase(env.DB);
    
    console.log('🎭 TTS编排器初始化完成');
  }

  /**
   * 主要的合成转录接口
   */
  async synthesizeTranscription(params: TTSWatchParams): Promise<TTSWatchResponse> {
    const { transcription_id, output_prefix, voice_settings } = params;
    const startTime = Date.now();
    
    console.log(`🚀 开始TTS转录合成: ${transcription_id}`);
    console.log(`📁 输出前缀: ${output_prefix}`);
    console.log(`🎛️ 语音设置:`, voice_settings);

    let processedCount = 0;
    let failedCount = 0;
    let lastSequence = 0;
    
    try {
      // 主处理循环
      while (true) {
        // 检查转录状态
        const status = await this.database.checkTranscriptionStatus(transcription_id);
        
        // 获取新的句子
        const segments = await this.database.fetchReadySegments(
          transcription_id, 
          lastSequence,
          10 // 每次最多获取10个句子
        );

        // 处理新句子
        if (segments.length > 0) {
          console.log(`📥 获取到 ${segments.length} 个新句子 (${segments[0].sequence}-${segments[segments.length-1].sequence})`);
          
          for (const segment of segments) {
            if (this.accumulator.accumulate(segment)) {
              // 发送批次
              const batch = this.accumulator.extractBatch();
              const results = await this.synthesizeBatch(batch, voice_settings);
              
              // 更新数据库
              await this.database.updateSynthesisResults(transcription_id, results);
              
              // 统计结果
              results.forEach(r => {
                if (r.success) processedCount++;
                else failedCount++;
              });
            }
          }
          
          lastSequence = Math.max(...segments.map(s => s.sequence));
        }

        // 检查超时发送
        if (this.accumulator.checkForTimeout()) {
          const batch = this.accumulator.extractBatch();
          if (batch.length > 0) {
            const results = await this.synthesizeBatch(batch, voice_settings);
            await this.database.updateSynthesisResults(transcription_id, results);
            
            results.forEach(r => {
              if (r.success) processedCount++;
              else failedCount++;
            });
          }
        }

        // 检查是否完成
        if (status.isComplete && segments.length === 0 && this.accumulator.isEmpty()) {
          console.log(`🏁 转录处理完成，准备结束`);
          break;
        }

        // 无新数据时等待
        if (segments.length === 0) {
          console.log(`⏳ 暂无新句子，等待2秒...`);
          await this.sleep(2000);
        }
      }

      // 处理剩余句子
      const remaining = this.accumulator.extractRemaining();
      if (remaining.length > 0) {
        console.log(`🔚 处理剩余 ${remaining.length} 个句子`);
        const results = await this.synthesizeBatch(remaining, voice_settings);
        await this.database.updateSynthesisResults(transcription_id, results);
        
        results.forEach(r => {
          if (r.success) processedCount++;
          else failedCount++;
        });
      }

      // 计算结果
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      const totalCount = processedCount + failedCount;
      const successRate = totalCount > 0 ? ((processedCount / totalCount) * 100).toFixed(1) : '0.0';

      console.log(`✅ TTS转录合成完成:`);
      console.log(`  - 处理句子数: ${processedCount}`);
      console.log(`  - 失败句子数: ${failedCount}`);
      console.log(`  - 成功率: ${successRate}%`);
      console.log(`  - 总耗时: ${totalTime}秒`);

      return {
        success: true,
        processed_count: processedCount,
        failed_count: failedCount,
        success_rate: `${successRate}%`,
        total_time_s: totalTime,
        transcription_id,
      };

    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ TTS转录合成失败:`, error);
      
      return {
        success: false,
        processed_count: processedCount,
        failed_count: failedCount,
        success_rate: '0%',
        total_time_s: totalTime,
        transcription_id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 发送批次到TTS引擎
   */
  private async synthesizeBatch(
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
        segments[0].sequence.toString(), // 简化处理，使用第一个句子的序号
        segments.map(s => s.sequence)
      );

      // 构建请求
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
      };

      // 发送到TTS引擎
      const response = await fetch(`${this.env.TTS_ENGINE_URL}/synthesize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS引擎响应错误 ${response.status}: ${errorText}`);
      }

      const synthesisResponse: SynthesisResponse = await response.json();

      if (!synthesisResponse.success) {
        throw new Error(`TTS合成失败: ${synthesisResponse.error}`);
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

      return results;

    } catch (error) {
      console.error(`❌ 批次合成失败:`, error);
      
      // 返回失败结果
      return segments.map(segment => ({
        sequence: segment.sequence,
        audioKey: '',
        durationMs: 0,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  /**
   * 获取处理状态
   */
  async getProcessingStatus(transcriptionId: string) {
    const stats = await this.database.getProcessingStats(transcriptionId);
    const accumulatorStatus = this.accumulator.getStatus();
    
    return {
      database: stats,
      accumulator: accumulatorStatus,
      isActive: !this.accumulator.isEmpty(),
    };
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.accumulator.clear();
    console.log('🧹 TTS编排器清理完成');
  }

  /**
   * 睡眠工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}