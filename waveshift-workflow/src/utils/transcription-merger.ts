/**
 * 转录片段实时合并处理工具
 * 
 * 功能：
 * 1. 实时接收转录片段
 * 2. 根据合并规则进行智能合并
 * 3. 只处理speech类型片段
 * 4. 合并完成后立即存储到D1
 */

import { Env } from '../types/env.d';
import { storeTranscriptionSegment } from './database';

// 转录片段类型定义
export interface TranscriptionSegment {
  sequence: number;
  start_ms: number;
  end_ms: number;
  content_type: string;
  speaker: string;
  original_text: string;
  translated_text: string;
  is_first?: boolean; // 是否是音频的第一个片段
  is_last?: boolean; // 是否是音频的最后一个片段
}

// 实时合并状态管理
export interface RealtimeMergeState {
  transcriptionId: string;
  currentGroup: TranscriptionSegment | null;  // 当前待合并的片段组
  lastStoredSequence: number;  // 已存储的序列号
  targetLanguage: string;
  isFirstSegmentStored: boolean;  // 是否已存储第一个片段
}

/**
 * 检查两个片段是否可以合并
 * 
 * 合并规则：
 * 1. 相同说话人
 * 2. 前一句的结束与后一句的开始相邻少于等于1秒
 * 3. 其中一句的长度少于5秒
 * 4. 合并后长度不超过10秒
 */
export function canMerge(prev: TranscriptionSegment, curr: TranscriptionSegment): boolean {
  // 规则1: 必须是相同说话人
  if (prev.speaker !== curr.speaker) {
    return false;
  }
  
  // 规则2: 时间间隔必须 <= 1秒
  const gap = curr.start_ms - prev.end_ms;
  if (gap > 1000) {
    return false;
  }
  
  // 规则3: 至少一句长度 < 5秒
  const prevDuration = prev.end_ms - prev.start_ms;
  const currDuration = curr.end_ms - curr.start_ms;
  if (prevDuration >= 5000 && currDuration >= 5000) {
    return false;
  }
  
  // 规则4: 合并后总长度不能 > 10秒
  const mergedDuration = curr.end_ms - prev.start_ms;
  if (mergedDuration > 10000) {
    return false;
  }
  
  return true;
}

/**
 * 合并两个转录片段
 * 
 * @param prev 前一个片段
 * @param curr 当前片段
 * @param targetLanguage 目标语言，用于决定文本连接方式
 * @returns 合并后的片段
 */
export function mergeSegments(
  prev: TranscriptionSegment, 
  curr: TranscriptionSegment, 
  targetLanguage: string
): TranscriptionSegment {
  // 根据目标语言决定文本连接方式
  const separator = targetLanguage === 'chinese' ? '' : ' ';
  
  return {
    sequence: prev.sequence, // 保持第一个片段的序列号
    start_ms: prev.start_ms,
    end_ms: curr.end_ms,
    content_type: prev.content_type,
    speaker: prev.speaker,
    original_text: `${prev.original_text}${separator}${curr.original_text}`.trim(),
    translated_text: `${prev.translated_text}${separator}${curr.translated_text}`.trim()
  };
}

/**
 * 存储单个片段到D1数据库
 * 
 * @param env 环境变量
 * @param transcriptionId 转录ID
 * @param segment 要存储的片段
 * @param finalSequence 最终序列号
 * @param isFirst 是否是第一个片段
 * @param isLast 是否是最后一个片段
 */
export async function storeSegmentToD1(
  env: Env, 
  transcriptionId: string, 
  segment: TranscriptionSegment,
  finalSequence: number,
  isFirst: boolean = false,
  isLast: boolean = false
): Promise<void> {
  const segmentWithFlags = {
    ...segment,
    is_first: isFirst,
    is_last: isLast
  };
  
  await storeTranscriptionSegment(env, transcriptionId, segmentWithFlags, finalSequence);
  
  // 🔥 添加实时通知机制：立即通知前端有新的转录片段
  console.log(`📡 存储片段完成，即将通知前端: sequence=${finalSequence}, speaker=${segment.speaker}, is_first=${isFirst}, is_last=${isLast}`);
}

/**
 * 实时处理单个转录片段
 * 
 * 核心逻辑：
 * 1. 只处理speech类型片段
 * 2. 判断是否可以与当前组合并
 * 3. 合并或存储当前组并开始新组
 * 
 * @param env 环境变量
 * @param state 实时合并状态
 * @param segment 新接收的片段
 */
export async function processSegmentRealtime(
  env: Env, 
  state: RealtimeMergeState, 
  segment: TranscriptionSegment
): Promise<void> {
  // 规则：只处理speech类型片段
  if (segment.content_type !== 'speech') {
    // 如果有待合并的组，先存储
    if (state.currentGroup) {
      const isFirst = !state.isFirstSegmentStored;
      await storeSegmentToD1(env, state.transcriptionId, state.currentGroup, ++state.lastStoredSequence, isFirst, false);
      state.currentGroup = null;
      if (isFirst) {
        state.isFirstSegmentStored = true;
      }
    }
    
    console.log(`⏭️  跳过非speech片段: type=${segment.content_type}, speaker=${segment.speaker}`);
    return;
  }
  
  if (!state.currentGroup) {
    // 开始新的合并组
    state.currentGroup = { ...segment };
    console.log(`🆕 开始新合并组: 说话人=${segment.speaker}, 时长=${segment.end_ms - segment.start_ms}ms`);
  } else {
    // 检查是否可以合并
    if (canMerge(state.currentGroup, segment)) {
      // 执行合并
      const beforeMerge = state.currentGroup.end_ms - state.currentGroup.start_ms;
      state.currentGroup = mergeSegments(state.currentGroup, segment, state.targetLanguage);
      const afterMerge = state.currentGroup.end_ms - state.currentGroup.start_ms;
      
      console.log(`🔗 合并片段: ${state.currentGroup.sequence} + ${segment.sequence}, 时长: ${beforeMerge}ms → ${afterMerge}ms`);
    } else {
      // 无法合并，存储当前组并开始新组
      const isFirst = !state.isFirstSegmentStored;
      await storeSegmentToD1(env, state.transcriptionId, state.currentGroup, ++state.lastStoredSequence, isFirst, false);
      state.currentGroup = { ...segment };
      if (isFirst) {
        state.isFirstSegmentStored = true;
      }
      
      console.log(`💾 存储组并开始新组: 说话人=${segment.speaker}, 已存储序列=${state.lastStoredSequence}`);
    }
  }
}


/**
 * 初始化实时合并状态
 * 
 * @param transcriptionId 转录ID
 * @param targetLanguage 目标语言
 * @returns 初始化的状态对象
 */
export function initRealtimeMergeState(transcriptionId: string, targetLanguage: string): RealtimeMergeState {
  return {
    transcriptionId,
    currentGroup: null,
    lastStoredSequence: 0,
    targetLanguage,
    isFirstSegmentStored: false
  };
}