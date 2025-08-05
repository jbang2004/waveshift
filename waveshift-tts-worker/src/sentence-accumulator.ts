/**
 * 句子累积器 - 智能批量控制
 * 负责收集句子并决定何时发送批次到TTS引擎
 */

export interface SegmentData {
  sequence: number;
  original: string;
  translation: string;
  audio_key: string;
  speaker: string;
  start_ms: number;
  end_ms: number;
}

export interface AccumulatorConfig {
  batchSize: number;
  timeoutMs: number;
  maxWaitMs: number;
}

export class SentenceAccumulator {
  private sentences: SegmentData[] = [];
  private lastAccumulateTime: number = 0;
  private readonly config: AccumulatorConfig;

  constructor(config: Partial<AccumulatorConfig> = {}) {
    this.config = {
      batchSize: config.batchSize || 3,
      timeoutMs: config.timeoutMs || 2000,
      maxWaitMs: config.maxWaitMs || 5000,
    };
    
    console.log(`🎯 句子累积器初始化: batchSize=${this.config.batchSize}, timeout=${this.config.timeoutMs}ms`);
  }

  /**
   * 累积一个句子
   * @param segment 句子数据
   * @returns 是否应该立即发送批次
   */
  accumulate(segment: SegmentData): boolean {
    this.sentences.push(segment);
    this.lastAccumulateTime = Date.now();
    
    console.log(`📝 累积句子 ${segment.sequence}: "${segment.translation.substring(0, 30)}..." (当前: ${this.sentences.length}/${this.config.batchSize})`);
    
    return this.shouldDispatch();
  }

  /**
   * 判断是否应该发送批次
   */
  private shouldDispatch(): boolean {
    // 达到批次大小
    if (this.sentences.length >= this.config.batchSize) {
      console.log(`🚀 批次已满，准备发送 ${this.sentences.length} 个句子`);
      return true;
    }

    // 超时检查
    if (this.sentences.length > 0 && this.isTimedOut()) {
      console.log(`⏰ 批次超时，发送 ${this.sentences.length} 个句子`);
      return true;
    }

    return false;
  }

  /**
   * 检查是否超时
   */
  private isTimedOut(): boolean {
    if (this.sentences.length === 0) return false;
    
    const elapsed = Date.now() - this.lastAccumulateTime;
    return elapsed >= this.config.timeoutMs;
  }

  /**
   * 强制检查是否应该发送（用于轮询）
   */
  checkForTimeout(): boolean {
    if (this.sentences.length > 0 && this.isTimedOut()) {
      console.log(`⏰ 轮询检查：批次超时，准备发送 ${this.sentences.length} 个句子`);
      return true;
    }
    return false;
  }

  /**
   * 提取批次（清空缓冲区）
   */
  extractBatch(): SegmentData[] {
    if (this.sentences.length === 0) {
      return [];
    }

    const batch = this.sentences.splice(0, this.config.batchSize);
    console.log(`📤 提取批次: ${batch.length} 个句子 (序号: ${batch.map(s => s.sequence).join(', ')})`);
    
    return batch;
  }

  /**
   * 提取所有剩余句子
   */
  extractRemaining(): SegmentData[] {
    if (this.sentences.length === 0) {
      return [];
    }

    const remaining = [...this.sentences];
    this.sentences = [];
    console.log(`🔚 提取剩余句子: ${remaining.length} 个 (序号: ${remaining.map(s => s.sequence).join(', ')})`);
    
    return remaining;
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      pending: this.sentences.length,
      batchSize: this.config.batchSize,
      lastAccumulate: this.lastAccumulateTime,
      timeoutMs: this.config.timeoutMs,
      nextSequences: this.sentences.map(s => s.sequence),
    };
  }

  /**
   * 清空累积器
   */
  clear() {
    const cleared = this.sentences.length;
    this.sentences = [];
    this.lastAccumulateTime = 0;
    console.log(`🧹 清空累积器: 丢弃 ${cleared} 个句子`);
  }

  /**
   * 是否为空
   */
  isEmpty(): boolean {
    return this.sentences.length === 0;
  }
}