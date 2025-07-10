import { useState, useEffect, useCallback, useRef } from 'react';
import { Subtitle } from '@/types';

// Helper function to convert milliseconds to HH:MM:SS string
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

interface UseRealtimeSubtitlesProps {
  taskId: string | null;
  isTranscribing: boolean;
  onNewSubtitle?: (subtitle: Subtitle) => void;
  onTranscriptionComplete?: () => void;
}

export function useRealtimeSubtitles({
  taskId,
  isTranscribing,
  onNewSubtitle,
  onTranscriptionComplete
}: UseRealtimeSubtitlesProps) {
  const [realtimeSubtitles, setRealtimeSubtitles] = useState<Subtitle[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const processedSegmentIds = useRef<Set<number>>(new Set());

  // 清理连接
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  // 建立SSE连接监听新字幕
  const startListening = useCallback(() => {
    if (!taskId || !isTranscribing || eventSourceRef.current) {
      return;
    }

    const es = new EventSource(`/api/workflow/${taskId}/status`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // 处理新片段
        if (data.type === 'new_segments' && data.segments) {
          const newSubtitles: Subtitle[] = data.segments
            .filter((segment: any) => !processedSegmentIds.current.has(segment.sentenceIndex))
            .map((segment: any) => {
              processedSegmentIds.current.add(segment.sentenceIndex);
              
              const subtitle: Subtitle = {
                id: segment.sentenceIndex.toString(),
                startTime: formatTime(segment.startMs),
                endTime: formatTime(segment.endMs),
                text: segment.rawText,
                translation: segment.transText || "",
                speaker: `说话人 ${segment.speakerId}`, // ✅ 修复：使用正确的字段名
              };

              // 通知新字幕
              onNewSubtitle?.(subtitle);
              
              return subtitle;
            });

          if (newSubtitles.length > 0) {
            setRealtimeSubtitles(prev => {
              const combined = [...prev, ...newSubtitles];
              // 按 ID 排序
              return combined.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            });
          }
        }

        // 处理转录完成
        if (data.status === 'completed') {
          onTranscriptionComplete?.();
          cleanup();
        }

      } catch (err) {
        console.error('Error parsing SSE message:', err);
        setError('Failed to parse message');
      }
    };

    es.onerror = (err) => {
      console.error('SSE connection error:', err);
      setError('Connection error');
      setIsConnected(false);
      
      // 🔥 修复：先清理当前连接，防止重复连接
      cleanup();
      
      // 自动重连（增加延迟避免频繁重连）
      setTimeout(() => {
        if (isTranscribing && taskId && !eventSourceRef.current) {
          startListening();
        }
      }, 3000); // 增加到3秒延迟
    };

  }, [taskId, isTranscribing, onNewSubtitle, onTranscriptionComplete, cleanup]);

  // 重置状态
  const reset = useCallback(() => {
    cleanup();
    setRealtimeSubtitles([]);
    setError(null);
    processedSegmentIds.current.clear();
  }, [cleanup]);

  // 效果：开始/停止监听
  useEffect(() => {
    if (isTranscribing && taskId) {
      startListening();
    } else {
      cleanup();
    }

    return cleanup;
  }, [isTranscribing, taskId, startListening, cleanup]);

  return {
    realtimeSubtitles,
    isConnected,
    error,
    reset,
    totalCount: realtimeSubtitles.length
  };
}