import { useState, useEffect, useRef } from 'react';

interface HLSPlayerState {
  isGenerating: boolean;
  hlsPlaylistUrl: string | null;
  canPlay: boolean;
  generatingError: Error | null;
  isVideoCompleted: boolean;
}

interface HLSPlayerActions {
  startGenerating: (taskId: string) => Promise<void>;
  resetHLSState: () => void;
}

// Note: 这个hook暂时禁用外部后端调用，因为新架构中TTS功能已集成到workflow中
// 如果需要TTS功能，应该通过内部API路由实现

export function useHLSPlayer(): HLSPlayerState & HLSPlayerActions {
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [hlsPlaylistUrl, setHlsPlaylistUrl] = useState<string | null>(null);
  const [canPlay, setCanPlay] = useState<boolean>(false);
  const [generatingError, setGeneratingError] = useState<Error | null>(null);
  const [isVideoCompleted, setIsVideoCompleted] = useState<boolean>(false);
  
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const resetHLSState = () => {
    setIsGenerating(false);
    setHlsPlaylistUrl(null);
    setCanPlay(false);
    setGeneratingError(null);
    setIsVideoCompleted(false);
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const startGenerating = async (taskId: string) => {
    if (!taskId) {
      setGeneratingError(new Error('任务 ID 缺失，无法触发 TTS'));
      return;
    }

    setIsGenerating(true);
    setGeneratingError(null);
    setCanPlay(false);

    try {
      // TODO: 在新架构中，TTS功能应该通过内部API路由实现
      // 目前暂时跳过外部API调用，直接开始轮询状态
      console.log('TTS功能暂未在新架构中实现，跳过外部API调用');

      // 开始轮询任务状态，检查HLS播放列表是否可用
      pollIntervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/tasks/${taskId}/status`);
          if (!response.ok) {
            console.error("轮询任务状态失败:", response.statusText);
            return;
          }

          const taskData = await response.json() as any;

          // 检查是否有HLS播放列表URL
          if (taskData.hlsPlaylistUrl && !canPlay) {
            setHlsPlaylistUrl(taskData.hlsPlaylistUrl);
            setCanPlay(true);
            // 注意：这里不设置 isGenerating 为 false，保持生成中状态
          }

          // 检查任务是否完全完成
          if (taskData.status === 'completed') {
            setIsVideoCompleted(true);
            setIsGenerating(false);
            
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }

          // 检查是否出错
          if (taskData.status === 'error') {
            setGeneratingError(new Error('视频生成过程中出现错误'));
            setIsGenerating(false);
            
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } catch (error) {
          console.error("轮询过程中出错:", error);
        }
      }, 2000); // 每2秒轮询一次

    } catch (error: any) {
      setGeneratingError(error instanceof Error ? error : new Error(String(error)));
      setIsGenerating(false);
    }
  };

  // 清理定时器
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    isGenerating,
    hlsPlaylistUrl,
    canPlay,
    generatingError,
    isVideoCompleted,
    startGenerating,
    resetHLSState,
  };
} 