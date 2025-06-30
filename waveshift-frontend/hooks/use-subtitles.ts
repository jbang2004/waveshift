import { useState, useEffect, useRef, useCallback } from 'react';
import { Subtitle } from '@/types';
import useSWR from 'swr';

// Helper function to convert milliseconds to HH:MM:SS string
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// SWR fetcher function
const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) {
    throw new Error('Failed to fetch');
  }
  return res.json();
});

interface UseSubtitlesProps {
  loadCondition: boolean; 
  // We might not need loadCondition anymore if fetching is triggered by a button
  // Or it could be used to show the panel initially if some conditions are met
  // For now, I'll keep it but the primary loading will be via fetchSubtitles
  initialTaskId?: string; // Optional: if a task_id is known on load
}

export function useSubtitles({ loadCondition, initialTaskId }: UseSubtitlesProps) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [showSubtitles, setShowSubtitles] = useState<boolean>(false);
  const [editingSubtitleId, setEditingSubtitleId] = useState<string | null>(null);
  const [isLoadingSubtitles, setIsLoadingSubtitles] = useState<boolean>(false);
  const [subtitleError, setSubtitleError] = useState<string | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const panelClosedByUserRef = useRef<boolean>(false);

  // 使用 SWR 进行数据获取
  const { data, error, isLoading, mutate } = useSWR(
    currentTaskId ? `/api/subtitles/${currentTaskId}` : null,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  // 当数据变化时更新本地状态
  useEffect(() => {
    const dataArray = (data as any)?.sentences || data;
    if (dataArray && Array.isArray(dataArray)) {
      const formattedSubtitles: Subtitle[] = dataArray.map((row: any) => ({
        id: row.id.toString(),
        startTime: formatTime(row.startMs),
        endTime: formatTime(row.endMs),
        text: row.rawText,
        translation: row.transText || "",
        speaker: `说话人 ${row.speakerId}`, // 格式化说话人信息
      }));

      setSubtitles(formattedSubtitles);
      setShowSubtitles(true);
      panelClosedByUserRef.current = false;
    } else if (dataArray && dataArray.length === 0) {
      setSubtitles([]);
      setShowSubtitles(true);
      setSubtitleError("No subtitles found for this task.");
    }
  }, [data]);

  // 处理错误
  useEffect(() => {
    if (error) {
      setSubtitleError(`Error fetching subtitles: ${error.message}`);
      setShowSubtitles(false);
    } else {
      setSubtitleError(null);
    }
  }, [error]);

  // 处理加载状态
  useEffect(() => {
    setIsLoadingSubtitles(isLoading);
  }, [isLoading]);

  const fetchSubtitles = useCallback(async (taskId: string, targetLanguageCode: string) => {
    if (!taskId) {
      setSubtitleError("Task ID is required to fetch subtitles.");
      return;
    }
    
    setCurrentTaskId(taskId);
    setSubtitleError(null);
    
    // SWR 会自动处理数据获取
  }, []);
  
  // Optional: Load initial subtitles if taskId is provided and conditions met
  useEffect(() => {
    if (loadCondition && initialTaskId && !showSubtitles && subtitles.length === 0 && !panelClosedByUserRef.current) {
      // For now, this won't auto-fetch. Fetching is manual via the button.
      // If auto-fetch on load is desired, call fetchSubtitles here with a default/known target language.
      // setShowSubtitles(true); // This would just show an empty panel if we don't fetch.
    }
  }, [loadCondition, initialTaskId, showSubtitles, subtitles.length]);

  const updateSubtitleTranslation = async (id: string, newTranslation: string, syncToDatabase: boolean = true) => {
    // 立即更新UI
    setSubtitles(prevSubtitles =>
      prevSubtitles.map(sub =>
        sub.id === id ? { ...sub, translation: newTranslation } : sub
      )
    );
    
    // 根据参数决定是否同步更新数据库
    if (syncToDatabase && currentTaskId) {
      try {
        const response = await fetch(`/api/subtitles/${currentTaskId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sentenceId: parseInt(id),
            newTranslation,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update subtitle');
        }

        // 可选：重新验证数据
        mutate();
      } catch (err) {
        console.error('数据库更新异常:', err);
        // 回滚 UI 更新
        setSubtitles(prevSubtitles =>
          prevSubtitles.map(sub =>
            sub.id === id ? { ...sub, translation: sub.translation } : sub
          )
        );
      }
    }
  };

  const toggleEditMode = (id: string) => {
    setEditingSubtitleId(prevId => (prevId === id ? null : id));
  };

  const closeSubtitlesPanel = () => {
    setShowSubtitles(false);
    panelClosedByUserRef.current = true;
  };
  
  const resetSubtitlesState = () => { // Renamed to avoid conflict if used elsewhere
    setSubtitles([]);
    setShowSubtitles(false);
    setEditingSubtitleId(null);
    setIsLoadingSubtitles(false);
    setSubtitleError(null);
    setCurrentTaskId(null);
    panelClosedByUserRef.current = false;
  }

  return {
    subtitles,
    showSubtitles,
    editingSubtitleId,
    isLoadingSubtitles,
    subtitleError,
    fetchSubtitles, // Expose the new fetch function
    updateSubtitleTranslation,
    toggleEditMode,
    closeSubtitlesPanel,
    resetSubtitlesState, // Expose the reset function
  };
} 