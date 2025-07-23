import type { TranscriptItem } from './types';

/**
 * 累积器状态枚举
 */
export enum AccumulatorState {
  ACCUMULATING = "accumulating",
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
  public isAudioGenerated: boolean;           // 音频生成标记
  public reusedSentences: TranscriptItem[];   // 复用音频的句子列表

  constructor(firstSentence: TranscriptItem) {
    this.speaker = firstSentence.speaker;
    this.timeRanges = [[firstSentence.startMs, firstSentence.endMs]];
    this.pendingSentences = [firstSentence];
    this.sequenceStart = firstSentence.sequence;
    this.state = AccumulatorState.ACCUMULATING;
    this.isAudioGenerated = false;
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
   * 检查是否可以复用已生成的音频
   */
  canReuseAudio(): boolean {
    return this.state === AccumulatorState.ACCUMULATING && 
           this.isAudioGenerated && 
           this.generatedAudioKey !== undefined;
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
   * 标记音频已生成，支持后续复用
   */
  markAudioGenerated(audioKey: string): void {
    this.generatedAudioKey = audioKey;
    this.isAudioGenerated = true;
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
   * 返回需要处理的累积器列表
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
      // 检查是否需要发射当前累积器
      const decision = SegmentationDecision.shouldBreakAccumulation(currentAccumulator, sentence);

      if (decision.shouldBreak) {
        if (currentAccumulator) {
          accumulators.push(currentAccumulator);
        }
        currentAccumulator = null;
      }

      // 添加当前句子到累积器
      if (!currentAccumulator) {
        currentAccumulator = new StreamingAccumulator(sentence);
      } else {
        // 检查是否可以复用已生成的音频
        if (currentAccumulator.canReuseAudio()) {
          // 🔄 实现音频复用逻辑：直接添加到复用列表，无需重新生成音频
          currentAccumulator.addReusedSentence(sentence);
        } else {
          // 正常添加句子到累积器
          currentAccumulator.addSentence(sentence, this.gapThresholdMs);
        }
      }

      // 检查是否满载并需要处理
      if (this.isAccumulatorFull(currentAccumulator)) {
        accumulators.push(currentAccumulator);
        // 🔄 保持累积器以供同说话人句子复用（不重置）
        // 标记音频将被生成，支持后续复用
        // 注意：在这里不重置currentAccumulator，保持复用能力
      }
    }

    // 处理最后的累积器
    if (currentAccumulator && currentAccumulator.pendingSentences.length > 0) {
      accumulators.push(currentAccumulator);
    }

    console.log(`✅ 流式处理完成，生成 ${accumulators.length} 个音频片段计划`);
    return accumulators;
  }

  /**
   * 检查累积器是否满载且需要处理
   * 🔧 修复：考虑音频复用状态
   */
  private isAccumulatorFull(accumulator: StreamingAccumulator | null): boolean {
    if (!accumulator || accumulator.state !== AccumulatorState.ACCUMULATING) {
      return false;
    }

    // 如果已生成音频，可以继续复用，不需要重新处理
    if (accumulator.isAudioGenerated) {
      return false;
    }

    // 如果未达到最大时长，继续累积
    if (accumulator.getTotalDuration(this.gapDurationMs) < this.maxDurationMs) {
      return false;
    }

    // 达到最大时长且未生成音频，需要处理
    return true;
  }

  /**
   * 检查片段是否符合最小时长要求
   */
  shouldKeepSegment(accumulator: StreamingAccumulator): boolean {
    const totalDuration = accumulator.getTotalDuration(this.gapDurationMs);
    
    // 如果只有一个句子且时长过短，丢弃
    if (accumulator.pendingSentences.length === 1 && totalDuration < this.minDurationMs) {
      console.warn(`🗑️ 丢弃过短单句片段: speaker=${accumulator.speaker}, ` +
                   `计算时长=${totalDuration}ms < 最小时长=${this.minDurationMs}ms`);
      return false;
    }

    return true;
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