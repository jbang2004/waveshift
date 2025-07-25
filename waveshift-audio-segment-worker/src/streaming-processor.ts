import type { TranscriptItem } from './types';

/**
 * 累积器状态枚举
 */
export enum AccumulatorState {
  ACCUMULATING = "accumulating",  // 正在累积
  REUSING = "reusing"             // 🔧 新增：已满MAX，只复用不累积
}

/**
 * 切分决策结果
 */
export interface BreakDecision {
  shouldBreak: boolean;
  reason: string;
}

/**
 * 流式累积器：维护当前音频片段的处理状态
 * TypeScript 版本的 Python StreamingAccumulator
 */
export class StreamingAccumulator {
  public speaker: string;
  public timeRanges: number[][];              // 时间段数组 [[startMs, endMs], ...]
  public pendingSentences: TranscriptItem[]; // 待处理句子队列
  public sequenceStart: number;               // 起始序号
  public state: AccumulatorState;
  public generatedAudioKey?: string;          // 生成的音频文件路径
  public reusedSentences: TranscriptItem[];   // 复用音频的句子列表

  constructor(firstSentence: TranscriptItem) {
    this.speaker = firstSentence.speaker;
    this.timeRanges = [[firstSentence.startMs, firstSentence.endMs]];
    this.pendingSentences = [firstSentence];
    this.sequenceStart = firstSentence.sequence;
    this.state = AccumulatorState.ACCUMULATING;
    this.reusedSentences = [];
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
   * 🔧 简化：只要状态为REUSING就可以复用
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
   * 🔧 关键：达到MAX后转为REUSING状态
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
    console.log(`🔄 音频复用: segment_id=${this.generateSegmentId()}, 句子${sentence.sequence}直接映射`);
  }

  /**
   * 获取所有句子（包括复用的）
   */
  getAllSentences(): TranscriptItem[] {
    return [...this.pendingSentences, ...this.reusedSentences];
  }

  /**
   * 增加说话人属性检查
   */
  belongsToSpeaker(speaker: string): boolean {
    return this.speaker === speaker;
  }
}

/**
 * 音频切分决策逻辑
 */
export class SegmentationDecision {
  /**
   * 统一的累积中断决策
   */
  static shouldBreakAccumulation(accumulator: StreamingAccumulator | null, sentence: TranscriptItem): BreakDecision {
    if (!accumulator) {
      return { shouldBreak: false, reason: "no_accumulator" };
    }

    // 说话人变化
    if (sentence.speaker !== accumulator.speaker) {
      return { shouldBreak: true, reason: "speaker_change" };
    }

    return { shouldBreak: false, reason: "continue_accumulation" };
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
 * TypeScript 版本的 Python AudioSegmenter
 */
export class AudioSegmenter {
  private gapDurationMs: number;
  private maxDurationMs: number;
  private minDurationMs: number;
  private gapThresholdMs: number;

  constructor(config: AudioSegmentConfig) {
    this.gapDurationMs = config.gapDurationMs;
    this.maxDurationMs = config.maxDurationMs;
    this.minDurationMs = config.minDurationMs;
    this.gapThresholdMs = config.gapDurationMs * config.gapThresholdMultiplier;

    console.log(`🎵 AudioSegmenter初始化 - Gap:${this.gapDurationMs}ms, ` +
                `Max:${this.maxDurationMs}ms, Min:${this.minDurationMs}ms, ` +
                `GapThreshold:${this.gapThresholdMs}ms`);
  }

  /**
   * 流式处理转录数据，生成音频切分计划
   * 🔧 第一性原理重构：极简的三阶段逻辑
   */
  processTranscriptsStreaming(transcripts: TranscriptItem[]): StreamingAccumulator[] {
    const accumulators: StreamingAccumulator[] = [];
    let currentAccumulator: StreamingAccumulator | null = null;

    // 提取有效语音句子
    const validSentences = transcripts.filter(
      item => item.content_type === 'speech' && item.startMs < item.endMs
    );

    console.log(`🎬 开始流式处理 ${validSentences.length} 个语音句子`);

    for (const sentence of validSentences) {
      // 🎯 阶段1：说话人切换检查
      if (currentAccumulator && !currentAccumulator.belongsToSpeaker(sentence.speaker)) {
        // 说话人切换，结束当前累积
        if (currentAccumulator.state === AccumulatorState.ACCUMULATING) {
          // 只有累积中的才需要判断MIN
          this.finalizeAccumulator(currentAccumulator, accumulators);
        }
        // 复用中的不需要再处理（已经在accumulators中）
        currentAccumulator = null;
      }

      // 🎯 阶段2：处理当前句子
      if (!currentAccumulator) {
        // 创建新累积器
        currentAccumulator = new StreamingAccumulator(sentence);
      } else if (currentAccumulator.isInReuseMode()) {
        // 🔄 复用模式：直接复用，不累积
        currentAccumulator.addReusedSentence(sentence);
      } else {
        // 📊 累积模式：正常累积
        currentAccumulator.addSentence(sentence, this.gapThresholdMs);
      }

      // 🎯 阶段3：MAX检查（只在累积模式下）
      if (currentAccumulator.state === AccumulatorState.ACCUMULATING &&
          currentAccumulator.getTotalDuration(this.gapDurationMs) >= this.maxDurationMs) {
        
        // 达到MAX，立即处理
        accumulators.push(currentAccumulator);
        
        console.log(`🎯 累积器达到MAX，加入处理队列: segment_id=${currentAccumulator.generateSegmentId()}, ` +
                    `duration=${currentAccumulator.getTotalDuration(this.gapDurationMs)}ms, ` +
                    `sentences=${currentAccumulator.pendingSentences.length}`);
        
        // 🔥 关键：转为复用模式（实际audioKey将在处理时设置）
        currentAccumulator.state = AccumulatorState.REUSING;
        console.log(`🔄 转为复用模式: speaker=${currentAccumulator.speaker}`);
      }
    }

    // 处理最后的累积器
    if (currentAccumulator && currentAccumulator.state === AccumulatorState.ACCUMULATING) {
      this.finalizeAccumulator(currentAccumulator, accumulators);
    }

    console.log(`✅ 流式处理完成，生成 ${accumulators.length} 个音频片段计划`);
    return accumulators;
  }

  /**
   * 🔧 简化：说话人切换时的MIN检查
   */
  private finalizeAccumulator(
    accumulator: StreamingAccumulator, 
    accumulators: StreamingAccumulator[]
  ): void {
    const duration = accumulator.getTotalDuration(this.gapDurationMs);
    
    if (duration < this.minDurationMs) {
      // < MIN: 丢弃，不生成audio_key
      console.log(`🗑️ 丢弃过短片段: ${accumulator.generateSegmentId()}, ` +
                  `时长=${duration}ms < 最小时长=${this.minDurationMs}ms`);
      return;
    }
    
    // ≥ MIN: 满足最小时长，加入处理队列
    accumulators.push(accumulator);
    console.log(`✅ 累积器满足最小时长，加入处理队列: ${accumulator.generateSegmentId()}, ` +
                `时长=${duration}ms`);
  }

  // 🔧 移除不再需要的辅助方法，逻辑已内联到主流程

  /**
   * 检查片段是否符合最小时长要求
   * 🔧 保留此方法用于向后兼容，但在新的延迟决策逻辑中已被finalizeAccumulator替代
   */
  shouldKeepSegment(accumulator: StreamingAccumulator): boolean {
    const totalDuration = accumulator.getTotalDuration(this.gapDurationMs);
    return totalDuration >= this.minDurationMs;
  }

  /**
   * 生成句子到片段的映射关系
   * 🔄 修复：考虑复用句子映射
   */
  generateSentenceToSegmentMap(accumulators: StreamingAccumulator[]): Record<number, string> {
    const sentenceToSegmentMap: Record<number, string> = {};

    for (const accumulator of accumulators) {
      const segmentId = accumulator.generateSegmentId();
      
      // 映射待处理句子（需要生成音频的）
      for (const sentence of accumulator.pendingSentences) {
        sentenceToSegmentMap[sentence.sequence] = segmentId;
      }
      
      // 🔄 映射复用句子（使用已生成的音频）
      for (const sentence of accumulator.reusedSentences) {
        sentenceToSegmentMap[sentence.sequence] = segmentId;
      }
    }

    return sentenceToSegmentMap;
  }
}