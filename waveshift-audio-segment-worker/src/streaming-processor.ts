import type { TranscriptItem, Env, AudioSegment } from './types';
import { 
  AudioSegmenter, 
  StreamingAccumulator, 
  type AudioSegmentConfig 
} from './audio-segmenter';

/**
 * 处理请求接口
 */
export interface ProcessRequest {
  audioData: Uint8Array;
  transcripts: TranscriptItem[];
  outputPrefix: string;
  transcriptionId?: string;  // 用于实时更新D1
}

/**
 * 处理响应接口
 */
export interface ProcessResponse {
  success: boolean;
  segments?: AudioSegment[];
  sentenceToSegmentMap?: Record<number, string>;
  error?: string;
}

/**
 * 流式音频处理器 - 支持实时D1更新
 * 核心业务逻辑处理类，负责音频切分和实时数据库更新
 */
export class StreamingProcessor {
  private db: D1Database;  // D1数据库实例
  private segmenter?: AudioSegmenter;  // 懒加载音频切分器实例
  private segmentConfig?: AudioSegmentConfig;  // 缓存配置，避免重复计算
  private enableDenoising: boolean = false;  // 是否启用降噪
  private denoiseContainer?: DurableObjectNamespace;  // 降噪容器
  
  constructor(
    private container: DurableObjectNamespace,
    private r2Bucket: R2Bucket,
    private env: Env,
    db: D1Database,
    options?: {
      enableDenoising?: boolean;
      denoiseContainer?: DurableObjectNamespace;
    }
  ) {
    this.db = db;
    if (options) {
      this.enableDenoising = options.enableDenoising || false;
      this.denoiseContainer = options.denoiseContainer;
    }
  }
  
  /**
   * 处理转录数据，生成音频片段并实时更新D1
   */
  async processTranscripts(request: ProcessRequest): Promise<ProcessResponse> {
    console.log(`StreamingProcessor处理: ${request.transcripts.length}个句子`);
    
    try {
      // 1. 懒加载配置和音频切分器
      if (!this.segmentConfig) {
        this.segmentConfig = {
          gapDurationMs: parseInt(this.env.GAP_DURATION_MS || '500'),
          maxDurationMs: parseInt(this.env.MAX_DURATION_MS || '12000'),
          minDurationMs: parseInt(this.env.MIN_DURATION_MS || '1000'),
          gapThresholdMultiplier: parseInt(this.env.GAP_THRESHOLD_MULTIPLIER || '3')
        };
        console.log(`音频配置: Gap=${this.segmentConfig.gapDurationMs}ms, Max=${this.segmentConfig.maxDurationMs}ms`);
      }
      
      if (!this.segmenter) {
        this.segmenter = new AudioSegmenter(this.segmentConfig);
        console.log(`创建音频切分器实例`);
      }
      
      const accumulators = this.segmenter.processTranscriptsStreaming(request.transcripts);
      
      if (accumulators.length === 0) {
        return { success: true, segments: [], sentenceToSegmentMap: {} };
      }
      
      // 2. 处理每个累积器
      const segments: AudioSegment[] = [];
      const sentenceToSegmentMap: Record<number, string> = {};
      
      for (const accumulator of accumulators) {
        // 🔧 移除重复检查：时长决策已在processTranscriptsStreaming的finalizeAccumulator中处理
        // 进入这里的accumulators都是已经通过时长检查的有效累积器
        console.log(`处理累积器: ${accumulator.generateSegmentId()}, ` +
                    `时长=${accumulator.getTotalDuration(this.segmentConfig.gapDurationMs)}ms`);
        
        // 处理纯复用累积器
        if (await this.processPureReuseAccumulator(accumulator, request.transcriptionId, sentenceToSegmentMap, '[V2] ')) {
          continue;
        }
        
        // 生成新音频：处理有待生成句子的累积器
        if (accumulator.pendingSentences.length > 0) {
          // 生成新音频：处理并实时更新
          const segment = await this.processAndUploadSegment(
            accumulator,
            request.audioData,
            request.outputPrefix,
            request.transcriptionId!,
            this.segmentConfig.gapDurationMs
          );
          
          if (segment) {
            segments.push(segment);
            
            // 更新句子映射（待处理句子）
            accumulator.pendingSentences.forEach(s => {
              sentenceToSegmentMap[s.sequence] = segment.segmentId;
            });
            
            // 也需要处理复用句子的映射
            if (accumulator.reusedSentences.length > 0) {
              console.log(`映射复用句子: ${accumulator.reusedSentences.length}个`);
              accumulator.reusedSentences.forEach(s => {
                sentenceToSegmentMap[s.sequence] = segment.segmentId;
              });
            }
          }
        }
      }
      
      console.log(`处理完成: 生成${segments.length}个音频片段`);
      
      return {
        success: true,
        segments,
        sentenceToSegmentMap
      };
      
    } catch (error) {
      console.error(`处理失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 处理并上传音频片段，同时实时更新D1
   */
  private async processAndUploadSegment(
    accumulator: StreamingAccumulator,
    audioData: Uint8Array,
    outputPrefix: string,
    transcriptionId: string,
    gapDurationMs: number
  ): Promise<AudioSegment | null> {
    // 🔧 修复：参数验证
    if (!outputPrefix || !outputPrefix.trim()) {
      console.error(`❌ outputPrefix为空或无效: "${outputPrefix}"`);
      return null;
    }
    
    const segmentId = accumulator.generateSegmentId();
    // 🔧 修复：使用统一的URL格式（包含speaker）
    const relativeAudioKey = `${outputPrefix}/${segmentId}_${accumulator.speaker}.wav`;
    
    // 🔧 修复：生成完整的R2公共URL
    const r2PublicDomain = this.env.R2_PUBLIC_DOMAIN;
    const fullAudioUrl = r2PublicDomain 
      ? `https://${r2PublicDomain}/${relativeAudioKey}`
      : relativeAudioKey; // fallback to relative path
    
    try {
      console.log(`🎵 生成音频片段: ${segmentId}`);
      
      // 1. 生成音频数据
      const segmentData = await this.generateSegmentAudio(
        accumulator,
        audioData,
        gapDurationMs
      );
      
      // 🧠 1.5. 可选降噪处理
      let finalAudioData = segmentData;
      if (this.enableDenoising && this.denoiseContainer) {
        finalAudioData = await this.denoiseAudio(segmentData, segmentId);
      }
      
      // 2. 上传到R2（使用相对路径）
      console.log(`📤 上传音频到R2: ${relativeAudioKey}`);
      await this.r2Bucket.put(relativeAudioKey, finalAudioData, {
        httpMetadata: {
          contentType: 'audio/wav'
        }
      });
      
      // 3. 🔥 实时更新D1中相关句子的audio_key（使用完整URL）
      await this.updateSentencesAudioKey(
        transcriptionId,
        accumulator.pendingSentences,
        fullAudioUrl
      );
      
      console.log(`💾 D1更新完成: ${accumulator.pendingSentences.length}个句子 → ${fullAudioUrl}`);
      
      // 4. 标记音频已生成（使用完整URL）
      accumulator.markAudioGenerated(fullAudioUrl);
      
      // 🔧 关键修复：激活AudioSegmenter中对应的活跃累积器
      this.segmenter!.activateGeneratedAccumulator(accumulator.speaker, fullAudioUrl);
      
      // 🔧 关键修复：同时处理复用句子的D1更新
      if (accumulator.reusedSentences.length > 0) {
        console.log(`🔄 [V2] 同时更新复用句子的audio_key: ${accumulator.reusedSentences.length}个句子`);
        await this.updateSentencesAudioKey(
          transcriptionId,
          accumulator.reusedSentences,
          fullAudioUrl
        );
      }
      
      // 5. 构建返回结果
      const segment: AudioSegment = {
        segmentId,
        audioKey: fullAudioUrl, // 🔧 修复：返回完整URL
        speaker: accumulator.speaker,
        startMs: accumulator.timeRanges[0][0],
        endMs: accumulator.timeRanges[accumulator.timeRanges.length - 1][1],
        durationMs: accumulator.getTotalDuration(gapDurationMs),
        sentences: accumulator.pendingSentences.map(s => ({
          sequence: s.sequence,
          original: s.original,
          translation: s.translation
        }))
      };
      
      console.log(`✅ 音频片段处理完成: ${segmentId}, ` +
                  `时长=${segment.durationMs}ms, ` +
                  `句子数=${segment.sentences.length}`);
      
      return segment;
      
    } catch (error) {
      console.error(`❌ 处理音频片段失败: ${segmentId}`, error);
      return null;
    }
  }
  
  /**
   * 批量更新句子的audio_key - 实时更新
   */
  private async updateSentencesAudioKey(
    transcriptionId: string,
    sentences: Array<{sequence: number}>,
    audioKey: string
  ): Promise<void> {
    if (sentences.length === 0) return;
    
    try {
      // 使用事务批量更新
      const statements = sentences.map(s => 
        this.db.prepare(`
          UPDATE transcription_segments 
          SET audio_key = ?
          WHERE transcription_id = ? AND sequence = ?
        `).bind(audioKey, transcriptionId, s.sequence)
      );
      
      await this.db.batch(statements);
      
      const sequences = sentences.map(s => s.sequence).join(',');
      console.log(`💾 实时更新D1: audio_key="${audioKey}" → sequences=[${sequences}]`);
      
    } catch (error) {
      console.error(`❌ 更新audio_key失败:`, error);
      throw error;
    }
  }
  
  /**
   * 处理纯复用累积器 - 提取的通用逻辑
   */
  private async processPureReuseAccumulator(
    accumulator: StreamingAccumulator,
    transcriptionId: string | undefined,
    sentenceToSegmentMap: Record<number, string>,
    logPrefix: string = ''
  ): Promise<boolean> {
    if (accumulator.pendingSentences.length === 0 && accumulator.reusedSentences.length > 0) {
      console.log(`🔄 ${logPrefix}处理纯复用累积器: ${accumulator.generateSegmentId()}, ` +
                  `复用句子数=${accumulator.reusedSentences.length}, ` +
                  `复用audio_key=${accumulator.generatedAudioKey}`);
      
      if (!accumulator.generatedAudioKey) {
        console.error(`❌ 纯复用累积器缺少audioKey: ${accumulator.generateSegmentId()}`);
        return true;
      }
      
      // 直接更新D1中的复用句子
      if (transcriptionId) {
        await this.updateSentencesAudioKey(
          transcriptionId,
          accumulator.reusedSentences,
          accumulator.generatedAudioKey
        );
      }
      
      // 更新句子映射
      accumulator.reusedSentences.forEach(s => {
        sentenceToSegmentMap[s.sequence] = accumulator.generateSegmentId();
      });
      
      return true;
    }
    return false;
  }
  
  /**
   * 生成音频片段（调用Container）
   */
  private async generateSegmentAudio(
    accumulator: StreamingAccumulator,
    audioData: Uint8Array,
    gapDurationMs: number
  ): Promise<ArrayBuffer> {
    const timeRanges = accumulator.timeRanges;
    
    // 获取Container实例
    const containerId = this.container.idFromName('audio-segment');
    const container = this.container.get(containerId);
    
    // 调用Container处理
    const response = await container.fetch('https://audio-segment/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Time-Ranges': JSON.stringify(timeRanges),
        'X-Gap-Duration': gapDurationMs.toString()
      },
      body: audioData
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Container处理失败: ${response.status} - ${error}`);
    }
    
    return await response.arrayBuffer();
  }

  /**
   * 🚀 新增：处理转录完全结束时的剩余累积器
   * 当整个转录流程完全结束时调用，处理所有未达到MAX但可能满足MIN的累积器
   */
  async finalizeTranscription(
    request: Omit<ProcessRequest, 'transcripts'>
  ): Promise<ProcessResponse> {
    console.log(`🎬 开始处理转录结束的剩余累积器`);
    
    try {
      // 确保segmenter已初始化
      if (!this.segmenter) {
        console.log(`📭 segmenter未初始化，无需处理剩余累积器`);
        return { success: true, segments: [], sentenceToSegmentMap: {} };
      }

      // 获取所有剩余的累积器
      const remainingAccumulators = this.segmenter.finalizeAllRemainingAccumulators();
      
      if (remainingAccumulators.length === 0) {
        console.log(`📭 没有剩余累积器需要处理`);
        return { success: true, segments: [], sentenceToSegmentMap: {} };
      }

      // 处理每个剩余累积器
      const segments: AudioSegment[] = [];
      const sentenceToSegmentMap: Record<number, string> = {};
      
      for (const accumulator of remainingAccumulators) {
        console.log(`🎵 处理剩余累积器: ${accumulator.generateSegmentId()}, ` +
                    `时长=${accumulator.getTotalDuration(this.segmentConfig!.gapDurationMs)}ms`);
        
        // 处理纯复用累积器
        if (await this.processPureReuseAccumulator(accumulator, request.transcriptionId, sentenceToSegmentMap, '[结束] ')) {
          continue;
        }
        
        // 🔥 生成新音频：处理有待生成句子的累积器
        if (accumulator.pendingSentences.length > 0) {
          const segment = await this.processAndUploadSegment(
            accumulator,
            request.audioData,
            request.outputPrefix,
            request.transcriptionId!,
            this.segmentConfig!.gapDurationMs
          );
          
          if (segment) {
            segments.push(segment);
            
            // 更新句子映射（待处理句子）
            accumulator.pendingSentences.forEach(s => {
              sentenceToSegmentMap[s.sequence] = segment.segmentId;
            });
            
            // 🔄 也需要处理复用句子的映射
            if (accumulator.reusedSentences.length > 0) {
              console.log(`🔄 [结束] 映射复用句子: ${accumulator.reusedSentences.length}个`);
              accumulator.reusedSentences.forEach(s => {
                sentenceToSegmentMap[s.sequence] = segment.segmentId;
              });
            }
          }
        }
      }
      
      console.log(`✅ 转录结束处理完成: 生成${segments.length}个最终音频片段`);
      
      return {
        success: true,
        segments,
        sentenceToSegmentMap
      };
      
    } catch (error) {
      console.error(`❌ 转录结束处理失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 调用降噪容器处理音频
   */
  private async denoiseAudio(audioData: ArrayBuffer, segmentId: string): Promise<ArrayBuffer> {
    try {
      console.log(`🧠 开始降噪处理: ${segmentId}`);
      
      // 获取降噪容器的DO实例
      const id = this.denoiseContainer!.idFromName('denoise-processor');
      const denoiseStub = this.denoiseContainer!.get(id);
      
      // 调用降噪容器
      const response = await denoiseStub.fetch('https://container.internal/', {
        method: 'POST',
        headers: {
          'Content-Type': 'audio/wav',
          'X-Segment-Id': segmentId,
          'X-Enable-Streaming': 'true'
        },
        body: audioData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`降噪容器返回错误 ${response.status}: ${errorText}`);
      }
      
      const denoisedData = await response.arrayBuffer();
      console.log(`✅ 降噪完成: ${segmentId}, 输入=${audioData.byteLength} bytes, 输出=${denoisedData.byteLength} bytes`);
      
      return denoisedData;
      
    } catch (error) {
      console.error(`❌ 降噪失败，使用原始音频: ${segmentId}`, error);
      // 失败时返回原始音频
      return audioData;
    }
  }
}