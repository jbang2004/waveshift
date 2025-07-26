import type { TranscriptItem } from './types';

/**
 * 累积器状态枚举
 */
export enum AccumulatorState {
  ACCUMULATING = "accumulating",  // 正在累积
  REUSING = "reusing"             // 已满MAX，只复用不累积
}


/**
 * 流式累积器：维护当前音频片段的处理状态
 */
export class StreamingAccumulator {
  public speaker: string;
  public timeRanges: number[][];              // 时间段数组 [[startMs, endMs], ...]
  public pendingSentences: TranscriptItem[]; // 待处理句子队列
  public sequenceStart: number;               // 起始序号
  public state: AccumulatorState;
  public generatedAudioKey?: string;          // 生成的音频文件路径
  public reusedSentences: TranscriptItem[];   // 复用音频的句子列表
  public isInProcessingQueue: boolean;        // 防止重复推入accumulators数组

  constructor(firstSentence: TranscriptItem) {
    this.speaker = firstSentence.speaker;
    this.timeRanges = [[firstSentence.startMs, firstSentence.endMs]];
    this.pendingSentences = [firstSentence];
    this.sequenceStart = firstSentence.sequence;
    this.state = AccumulatorState.ACCUMULATING;
    this.reusedSentences = [];
    this.isInProcessingQueue = false;
  }

  /**
   * 计算累积器的总时长（包含gaps）
   */
  getTotalDuration(gapDurationMs: number): number {
    const audioDuration = this.timeRanges.reduce((sum, [start, end]) => sum + (end - start), 0);
    const gapCount = Math.max(0, this.timeRanges.length - 1);
    return audioDuration + (gapCount * gapDurationMs);
  }

  /**
   * 添加句子到累积器，智能处理时间范围
   */
  addSentence(sentence: TranscriptItem, gapThresholdMs: number): void {
    if (this.state !== AccumulatorState.ACCUMULATING) {
      throw new Error("Cannot add sentence to non-accumulating accumulator");
    }

    // 检查间隔并决定如何合并时间范围
    const lastEnd = this.timeRanges[this.timeRanges.length - 1][1];
    const gap = sentence.startMs - lastEnd;

    if (gap <= gapThresholdMs) {
      // 小间隔：扩展最后一个时间范围
      this.timeRanges[this.timeRanges.length - 1][1] = sentence.endMs;
    } else {
      // 大间隔：添加新时间范围
      this.timeRanges.push([sentence.startMs, sentence.endMs]);
    }

    this.pendingSentences.push(sentence);
  }

  /**
   * 检查是否处于复用模式
   */
  isInReuseMode(): boolean {
    return this.state === AccumulatorState.REUSING;
  }

  /**
   * 生成片段ID
   */
  generateSegmentId(): string {
    return `sequence_${this.sequenceStart.toString().padStart(4, '0')}`;
  }

  /**
   * 生成音频文件路径
   */
  generateAudioKey(outputPrefix: string): string {
    const segmentId = this.generateSegmentId();
    return `${outputPrefix}/${segmentId}_${this.speaker}.wav`;
  }

  /**
   * 标记音频已生成，并转为复用模式
   */
  markAudioGenerated(audioKey: string): void {
    this.generatedAudioKey = audioKey;
    this.state = AccumulatorState.REUSING;
  }

  /**
   * 添加复用句子（不重新生成音频）
   */
  addReusedSentence(sentence: TranscriptItem): void {
    this.reusedSentences.push(sentence);
    console.log(`音频复用: ${this.generateSegmentId()}, 句子${sentence.sequence}`);
  }

  /**
   * 获取所有句子（包括复用的）
   */
  getAllSentences(): TranscriptItem[] {
    return [...this.pendingSentences, ...this.reusedSentences];
  }

}


/**
 * 音频切分配置参数
 */
export interface AudioSegmentConfig {
  gapDurationMs: number;
  maxDurationMs: number;
  minDurationMs: number;
  gapThresholdMultiplier: number;
}

/**
 * 音频切分处理器 - 流式处理的智能音频切片
 */
export class AudioSegmenter {
  private gapDurationMs: number;
  private maxDurationMs: number;
  private minDurationMs: number;
  private gapThresholdMs: number;
  
  // 跨批次状态保持 - 每个说话人的活跃复用累积器
  private activeSpeakerAccumulators: Map<string, StreamingAccumulator> = new Map();

  constructor(config: AudioSegmentConfig) {
    this.gapDurationMs = config.gapDurationMs;
    this.maxDurationMs = config.maxDurationMs;
    this.minDurationMs = config.minDurationMs;
    this.gapThresholdMs = config.gapDurationMs * config.gapThresholdMultiplier;

    console.log(`AudioSegmenter初始化: Gap=${this.gapDurationMs}ms, Max=${this.maxDurationMs}ms`);
  }

  /**
   * 流式处理转录数据，生成音频切分计划
   */
  processTranscriptsStreaming(transcripts: TranscriptItem[]): StreamingAccumulator[] {
    const accumulators: StreamingAccumulator[] = [];
    let currentAccumulator: StreamingAccumulator | null = null;

    // 提取有效语音句子
    const validSentences = transcripts.filter(
      item => item.content_type === 'speech' && item.startMs < item.endMs
    );

    console.log(`开始处理 ${validSentences.length} 个语音句子`);
    
    // 批次开始时预处理所有不兼容的累积器
    if (validSentences.length > 0) {
      const firstSpeaker = validSentences[0].speaker;
      
      // 1. 预处理：清理所有与当前批次不兼容的累积器
      const incompatibleSpeakers: string[] = [];
      for (const [speaker, accumulator] of this.activeSpeakerAccumulators) {
        if (speaker !== firstSpeaker) {
          incompatibleSpeakers.push(speaker);
          
          // 使用统一的说话人切换处理逻辑
          if (accumulator.state === AccumulatorState.ACCUMULATING) {
            this.finalizeAccumulator(accumulator, accumulators);
            console.log(`预处理不兼容累积器: ${accumulator.generateSegmentId()}, ` +
                        `speaker=${speaker} → firstSpeaker=${firstSpeaker}, ` +
                        `时长=${accumulator.getTotalDuration(this.gapDurationMs)}ms`);
          } else if (accumulator.state === AccumulatorState.REUSING && 
                     accumulator.reusedSentences.length > 0 &&
                     !accumulator.isInProcessingQueue) {
            accumulators.push(accumulator);
            console.log(`预处理不兼容复用累积器: ${accumulator.generateSegmentId()}, ` +
                        `复用句子数=${accumulator.reusedSentences.length}, ` +
                        `speaker=${speaker} → firstSpeaker=${firstSpeaker}`);
          }
        }
      }
      
      // 2. 清理已处理的不兼容累积器
      for (const speaker of incompatibleSpeakers) {
        this.activeSpeakerAccumulators.delete(speaker);
      }
      
      // 3. 恢复兼容的累积器（如果有的话）
      if (this.activeSpeakerAccumulators.has(firstSpeaker)) {
        currentAccumulator = this.activeSpeakerAccumulators.get(firstSpeaker)!;
        currentAccumulator.isInProcessingQueue = false;
        console.log(`恢复兼容累积器: ${currentAccumulator.generateSegmentId()}, ` +
                    `speaker=${firstSpeaker}, ` +
                    `状态=${currentAccumulator.state}, ` +
                    `已有audioKey=${!!currentAccumulator.generatedAudioKey}`);
      }
      
      if (incompatibleSpeakers.length > 0) {
        console.log(`预处理完成: 处理了${incompatibleSpeakers.length}个不兼容累积器`);
      }
    }

    for (const sentence of validSentences) {
      // 阶段1：说话人切换检查
      if (currentAccumulator && currentAccumulator.speaker !== sentence.speaker) {
        // 说话人切换，结束当前累积
        if (currentAccumulator.state === AccumulatorState.ACCUMULATING) {
          // 累积中的需要MIN检查
          this.finalizeAccumulator(currentAccumulator, accumulators);
        } else if (currentAccumulator.state === AccumulatorState.REUSING && 
                   currentAccumulator.reusedSentences.length > 0 &&
                   !currentAccumulator.isInProcessingQueue) {
          // REUSING状态且有复用句子的也需要处理
          accumulators.push(currentAccumulator);
          console.log(`说话人切换时处理复用累积器: ${currentAccumulator.generateSegmentId()}, ` +
                      `复用句子数=${currentAccumulator.reusedSentences.length}, ` +
                      `${currentAccumulator.speaker} → ${sentence.speaker}`);
        }
        
        // 移除说话人切换时的活跃累积器
        if (this.activeSpeakerAccumulators.has(currentAccumulator.speaker)) {
          this.activeSpeakerAccumulators.delete(currentAccumulator.speaker);
          console.log(`说话人切换，移除活跃累积器: ${currentAccumulator.speaker} -> ${sentence.speaker}`);
        }
        currentAccumulator = null;
      }

      // 阶段2：处理当前句子
      if (!currentAccumulator) {
        // 创建新累积器
        currentAccumulator = new StreamingAccumulator(sentence);
      } else if (currentAccumulator.isInReuseMode()) {
        // 复用模式：直接复用，不累积
        currentAccumulator.addReusedSentence(sentence);
      } else {
        // 累积模式：正常累积
        currentAccumulator.addSentence(sentence, this.gapThresholdMs);
      }

      // 阶段3：MAX检查（只在累积模式下）
      if (currentAccumulator.state === AccumulatorState.ACCUMULATING &&
          currentAccumulator.getTotalDuration(this.gapDurationMs) >= this.maxDurationMs) {
        
        // 达到MAX，立即处理
        accumulators.push(currentAccumulator);
        currentAccumulator.isInProcessingQueue = true; // 标记已推入
        
        console.log(`累积器达到MAX: ${currentAccumulator.generateSegmentId()}, ` +
                    `duration=${currentAccumulator.getTotalDuration(this.gapDurationMs)}ms, ` +
                    `sentences=${currentAccumulator.pendingSentences.length}`);
        
        // 转为复用模式（实际audioKey将在处理时设置）
        currentAccumulator.state = AccumulatorState.REUSING;
        console.log(`转为复用模式: speaker=${currentAccumulator.speaker}`);
        
        // 立即保存REUSING状态累积器，避免后续丢失
        this.activeSpeakerAccumulators.set(currentAccumulator.speaker, currentAccumulator);
        console.log(`保存活跃复用累积器: ${currentAccumulator.generateSegmentId()}, ` +
                    `speaker=${currentAccumulator.speaker}, ` +
                    `等待audioKey生成后完整激活`);
      }
    }

    // 批次结束处理：继续累积而非强制结束
    if (currentAccumulator) {
      if (currentAccumulator.state === AccumulatorState.ACCUMULATING) {
        // 保存到活跃映射，等待后续延续（不进行MIN检查）
        this.activeSpeakerAccumulators.set(currentAccumulator.speaker, currentAccumulator);
        console.log(`批次结束，保存累积器: ${currentAccumulator.generateSegmentId()}, ` +
                    `speaker=${currentAccumulator.speaker}, ` +
                    `当前时长=${currentAccumulator.getTotalDuration(this.gapDurationMs)}ms, ` +
                    `句子数=${currentAccumulator.pendingSentences.length}`);
      } else if (currentAccumulator.state === AccumulatorState.REUSING && 
                 currentAccumulator.reusedSentences.length > 0 &&
                 !currentAccumulator.isInProcessingQueue) {
        // REUSING状态且有复用句子且未推入时，需要处理
        accumulators.push(currentAccumulator);
        console.log(`添加最终复用累积器: ${currentAccumulator.generateSegmentId()}, ` +
                    `复用句子数=${currentAccumulator.reusedSentences.length}`);
      }
    }
    

    console.log(`处理完成，生成 ${accumulators.length} 个音频片段`);
    return accumulators;
  }

  /**
   * 说话人切换时的MIN检查
   */
  private finalizeAccumulator(
    accumulator: StreamingAccumulator, 
    accumulators: StreamingAccumulator[]
  ): void {
    const duration = accumulator.getTotalDuration(this.gapDurationMs);
    
    if (duration < this.minDurationMs) {
      // < MIN: 丢弃，不生成audio_key
      console.log(`丢弃过短片段: ${accumulator.generateSegmentId()}, ` +
                  `时长=${duration}ms < 最小时长=${this.minDurationMs}ms`);
      return;
    }
    
    // ≥ MIN: 满足最小时长，加入处理队列
    accumulators.push(accumulator);
    console.log(`累积器满足最小时长: ${accumulator.generateSegmentId()}, ` +
                `时长=${duration}ms`);
  }

  
  /**
   * 激活audioKey已生成的REUSING累积器
   */
  activateGeneratedAccumulator(speaker: string, audioKey: string): void {
    const accumulator = this.activeSpeakerAccumulators.get(speaker);
    if (accumulator && accumulator.state === AccumulatorState.REUSING) {
      accumulator.generatedAudioKey = audioKey;
      console.log(`激活复用累积器: ${accumulator.generateSegmentId()}, ` +
                  `speaker=${speaker}, ` +
                  `audioKey=${audioKey}`);
    }
    
  }

  /**
   * 转录结束时强制处理所有剩余累积器
   */
  finalizeAllRemainingAccumulators(): StreamingAccumulator[] {
    const finalAccumulators: StreamingAccumulator[] = [];
    
    console.log(`转录结束，处理剩余累积器: ${this.activeSpeakerAccumulators.size}个`);
    
    for (const [speaker, accumulator] of this.activeSpeakerAccumulators) {
      if (accumulator.state === AccumulatorState.ACCUMULATING) {
        // 使用finalizeAccumulator进行MIN检查
        this.finalizeAccumulator(accumulator, finalAccumulators);
        console.log(`强制处理累积器: ${accumulator.generateSegmentId()}, ` +
                    `speaker=${speaker}, ` +
                    `时长=${accumulator.getTotalDuration(this.gapDurationMs)}ms`);
      } else if (accumulator.state === AccumulatorState.REUSING && 
                 accumulator.reusedSentences.length > 0) {
        // REUSING状态且有复用句子的也需要处理
        finalAccumulators.push(accumulator);
        console.log(`强制处理复用累积器: ${accumulator.generateSegmentId()}, ` +
                    `复用句子数=${accumulator.reusedSentences.length}`);
      }
    }
    
    // 清空活跃累积器映射
    this.activeSpeakerAccumulators.clear();
    console.log(`转录结束处理完成，生成${finalAccumulators.length}个最终音频片段`);
    
    return finalAccumulators;
  }
}