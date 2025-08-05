/**
 * 优雅的数据库接口 - 专注TTS相关的D1操作
 */

import { SegmentData } from './sentence-accumulator';

export interface SynthesisResult {
  sequence: number;
  audioKey: string;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface TranscriptionStatus {
  isComplete: boolean;
  totalSegments: number;
  processedSegments: number;
}

export class SegmentDatabase {
  constructor(private db: D1Database) {}

  /**
   * 获取准备好进行TTS处理的句子
   */
  async fetchReadySegments(
    transcriptionId: string, 
    afterSequence: number,
    limit: number = 10
  ): Promise<SegmentData[]> {
    try {
      console.log(`🔍 查询准备就绪的句子: transcriptionId=${transcriptionId}, afterSequence=${afterSequence}, limit=${limit}`);
      
      const stmt = this.db.prepare(`
        SELECT sequence, original, translation, audio_key, speaker, start_ms, end_ms
        FROM transcription_segments 
        WHERE transcription_id = ? 
          AND sequence > ?
          AND audio_key IS NOT NULL 
          AND audio_key != ''
          AND (tts_status IS NULL OR tts_status = 'pending')
          AND translation IS NOT NULL
          AND translation != ''
        ORDER BY sequence ASC 
        LIMIT ?
      `);
      
      const result = await stmt.bind(transcriptionId, afterSequence, limit).all();
      
      if (!result.success) {
        throw new Error(`查询失败: ${result.error}`);
      }
      
      const segments = result.results.map(row => ({
        sequence: row.sequence as number,
        original: (row.original as string) || '',
        translation: ((row.translation as string) || '').trim(),
        audio_key: row.audio_key as string,
        speaker: (row.speaker as string) || 'unknown',
        start_ms: row.start_ms as number,
        end_ms: row.end_ms as number,
      }));
      
      console.log(`✅ 查询完成: 找到 ${segments.length} 个待处理句子`);
      if (segments.length > 0) {
        const sequences = segments.map(s => s.sequence);
        console.log(`📋 句子序号: ${sequences.join(', ')}`);
      }
      
      return segments;
      
    } catch (error) {
      console.error(`❌ 查询准备就绪的句子失败:`, error);
      return [];
    }
  }

  /**
   * 批量标记句子为处理中状态
   */
  async markSegmentsProcessing(
    transcriptionId: string, 
    sequences: number[]
  ): Promise<boolean> {
    if (sequences.length === 0) return true;
    
    try {
      console.log(`🔄 标记句子为处理中: ${sequences.join(', ')}`);
      
      const updates = sequences.map(sequence => 
        this.db.prepare(`
          UPDATE transcription_segments 
          SET tts_status = 'processing'
          WHERE transcription_id = ? AND sequence = ?
        `).bind(transcriptionId, sequence)
      );
      
      const results = await this.db.batch(updates);
      const allSuccess = results.every(r => r.success);
      
      if (allSuccess) {
        console.log(`✅ 成功标记 ${sequences.length} 个句子为处理中`);
      } else {
        console.error(`❌ 部分句子标记失败`);
      }
      
      return allSuccess;
      
    } catch (error) {
      console.error(`❌ 标记句子处理状态失败:`, error);
      return false;
    }
  }

  /**
   * 批量更新TTS合成结果
   */
  async updateSynthesisResults(
    transcriptionId: string, 
    results: SynthesisResult[]
  ): Promise<boolean> {
    if (results.length === 0) return true;
    
    try {
      console.log(`💾 更新TTS合成结果: ${results.length} 个句子`);
      
      const updates = results.map(result => {
        if (result.success) {
          return this.db.prepare(`
            UPDATE transcription_segments 
            SET tts_audio_key = ?, 
                tts_status = 'completed',
                tts_duration_ms = ?,
                tts_processing_time_ms = ?
            WHERE transcription_id = ? AND sequence = ?
          `).bind(
            result.audioKey,
            result.durationMs,
            Date.now(), // 简化处理时间
            transcriptionId, 
            result.sequence
          );
        } else {
          return this.db.prepare(`
            UPDATE transcription_segments 
            SET tts_status = 'failed',
                tts_error = ?
            WHERE transcription_id = ? AND sequence = ?
          `).bind(
            result.error || 'synthesis_failed',
            transcriptionId, 
            result.sequence
          );
        }
      });
      
      const batchResults = await this.db.batch(updates);
      const allSuccess = batchResults.every(r => r.success);
      
      if (allSuccess) {
        const successCount = results.filter(r => r.success).length;
        const failCount = results.length - successCount;
        console.log(`✅ 批量更新完成: 成功 ${successCount}, 失败 ${failCount}`);
      } else {
        console.error(`❌ 批量更新部分失败`);
      }
      
      return allSuccess;
      
    } catch (error) {
      console.error(`❌ 更新TTS合成结果失败:`, error);
      return false;
    }
  }

  /**
   * 检查转录是否完成
   */
  async checkTranscriptionStatus(transcriptionId: string): Promise<TranscriptionStatus> {
    try {
      // 检查是否有标记为最后片段的记录
      const lastSegmentStmt = this.db.prepare(`
        SELECT COUNT(*) as total_count,
               SUM(CASE WHEN is_last = 1 THEN 1 ELSE 0 END) as last_count
        FROM transcription_segments 
        WHERE transcription_id = ?
      `);
      
      const result = await lastSegmentStmt.bind(transcriptionId).first();
      
      if (!result) {
        return { isComplete: false, totalSegments: 0, processedSegments: 0 };
      }
      
      const totalSegments = result.total_count as number;
      const hasLastSegment = (result.last_count as number) > 0;
      
      // 计算已处理的句子数
      const processedStmt = this.db.prepare(`
        SELECT COUNT(*) as processed_count
        FROM transcription_segments 
        WHERE transcription_id = ? 
          AND tts_status IN ('completed', 'failed')
      `);
      
      const processedResult = await processedStmt.bind(transcriptionId).first();
      const processedSegments = (processedResult?.processed_count as number) || 0;
      
      return {
        isComplete: hasLastSegment,
        totalSegments,
        processedSegments,
      };
      
    } catch (error) {
      console.error(`❌ 检查转录状态失败:`, error);
      return { isComplete: false, totalSegments: 0, processedSegments: 0 };
    }
  }

  /**
   * 获取转录处理统计
   */
  async getProcessingStats(transcriptionId: string) {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN tts_status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN tts_status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN tts_status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN tts_status IS NULL OR tts_status = 'pending' THEN 1 ELSE 0 END) as pending
        FROM transcription_segments 
        WHERE transcription_id = ?
      `);
      
      const result = await stmt.bind(transcriptionId).first();
      
      return {
        total: (result?.total as number) || 0,
        completed: (result?.completed as number) || 0,
        failed: (result?.failed as number) || 0,
        processing: (result?.processing as number) || 0,
        pending: (result?.pending as number) || 0,
      };
      
    } catch (error) {
      console.error(`❌ 获取处理统计失败:`, error);
      return { total: 0, completed: 0, failed: 0, processing: 0, pending: 0 };
    }
  }
}