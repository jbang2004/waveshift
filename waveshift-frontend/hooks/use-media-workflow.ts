/**
 * 媒体处理工作流 Hook
 * 提供文件上传、处理和状态监听功能
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { MediaTask, Transcription, TranscriptionSegment } from '@/db/schema-media';

// 实时字幕类型定义（从use-realtime-subtitles.ts迁移）
export interface Subtitle {
  id: string;
  startTime: string;
  endTime: string;
  text: string;
  translation: string;
  speaker: string;
}

// 时间格式转换函数
const formatTime = (ms: number): string => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// 媒体任务类型，包含转录信息
export interface MediaTaskWithTranscription extends MediaTask {
  transcription?: Transcription & {
    segments: TranscriptionSegment[];
  };
}

// 上传进度信息
interface UploadProgressInfo {
  progress: number; // 百分比进度
  loaded: number; // 已上传字节数
  total: number; // 总字节数
  speed: number; // 上传速度 (bytes/s)
  remainingTime: number; // 预计剩余时间 (seconds)
  startTime: number; // 开始上传时间戳
}

// Hook 状态接口
interface MediaWorkflowState {
  // 任务状态
  task: MediaTaskWithTranscription | null;
  
  // 上传状态
  isCreating: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadProgressInfo: UploadProgressInfo | null; // 详细进度信息
  uploadComplete: boolean;
  
  // 处理状态
  isProcessing: boolean;
  processingComplete: boolean;
  progress: number;
  
  // 🔥 新增：实时字幕状态
  realtimeSubtitles: Subtitle[];
  isTranscribing: boolean;
  showSkeletons: boolean;
  
  // 结果状态
  videoPreviewUrl: string | null;
  
  // 错误状态
  error: Error | null;
  uploadError: Error | null;
  processingError: Error | null;
  
  // 任务 ID
  taskId: string | null;
}

// Hook 操作接口
interface MediaWorkflowActions {
  createAndUploadTask: (
    file: File, 
    options?: { targetLanguage?: string; style?: string }
  ) => Promise<void>;
  resetWorkflow: () => void;
}


export function useMediaWorkflow(): MediaWorkflowState & MediaWorkflowActions {
  const { user } = useAuth();
  
  const [task, setTask] = useState<MediaTaskWithTranscription | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressInfo, setUploadProgressInfo] = useState<UploadProgressInfo | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 🔥 新增：实时字幕状态
  const [realtimeSubtitles, setRealtimeSubtitles] = useState<Subtitle[]>([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [showSkeletons, setShowSkeletons] = useState(false);
  const [processedSegmentIds, setProcessedSegmentIds] = useState<Set<number>>(new Set());
  
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  
  const [error, setError] = useState<Error | null>(null);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [processingError, setProcessingError] = useState<Error | null>(null);
  
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  const cleanupEventSource = useCallback(() => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
  }, [eventSource]);

  const resetWorkflow = useCallback(() => {
    cleanupEventSource();
    setTask(null);
    setTaskId(null);
    
    setIsCreating(false);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadProgressInfo(null);
    setUploadComplete(false);
    
    setIsProcessing(false);
    setProcessingComplete(false);
    setProgress(0);
    
    // 🔥 重置实时字幕状态
    setRealtimeSubtitles([]);
    setIsTranscribing(false);
    setShowSkeletons(false);
    setProcessedSegmentIds(new Set());
    
    setVideoPreviewUrl(null);
    
    setError(null);
    setUploadError(null);
    setProcessingError(null);
  }, [cleanupEventSource]);

  const startStatusMonitoring = useCallback((taskId: string, skipTranscribingPhase: boolean = false) => {
    if (!user) return;

    const es = new EventSource(`/api/workflow/${taskId}/status`);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 🔥 处理new_segments事件（实时字幕）
        if (data.type === 'new_segments' && data.segments) {
          const newSubtitles: Subtitle[] = data.segments
            .filter((segment: any) => !processedSegmentIds.has(segment.sentenceIndex))
            .map((segment: any) => {
              const subtitle: Subtitle = {
                id: segment.sentenceIndex.toString(),
                startTime: formatTime(segment.startMs),
                endTime: formatTime(segment.endMs),
                text: segment.rawText,
                translation: segment.transText || "",
                speaker: `说话人 ${segment.speakerId}`,
              };
              
              return subtitle;
            });

          if (newSubtitles.length > 0) {
            // 更新处理过的segment IDs
            setProcessedSegmentIds(prev => {
              const newSet = new Set(prev);
              newSubtitles.forEach(sub => newSet.add(parseInt(sub.id)));
              return newSet;
            });
            
            // 添加新字幕并排序
            setRealtimeSubtitles(prev => {
              const combined = [...prev, ...newSubtitles];
              return combined.sort((a, b) => parseInt(a.id) - parseInt(b.id));
            });
            
            console.log(`📨 收到${newSubtitles.length}个新字幕片段`);
          }
          return; // new_segments事件不需要处理其他逻辑
        }
        
        // 🔥 处理任务状态更新
        if (data.error) {
          setError(new Error(data.error));
          setIsProcessing(false);
          es.close();
          return;
        }

        setTask(data);
        setProgress(data.progress || 0);

        if (data.status === 'transcribing') {
          // 🔥 进入转录阶段：显示字幕组件和骨架屏
          setIsTranscribing(true);
          setShowSkeletons(true);
          setIsProcessing(true);
        } else if (data.status === 'completed') {
          // 🔥 转录完成：结束进度条，保持字幕显示
          setIsTranscribing(false);
          setShowSkeletons(false);
          setIsProcessing(false);
          setProcessingComplete(true);
          setProgress(100);
          
          if (data.videoUrl) {
            setVideoPreviewUrl(data.videoUrl);
          }
          
          es.close();
        } else if (data.status === 'failed') {
          setError(new Error(data.error || 'Task failed'));
          setIsTranscribing(false);
          setIsProcessing(false);
          es.close();
        } else if (data.status === 'separating' || data.status === 'processing') {
          setIsProcessing(true);
        } else if (data.status === 'uploaded') {
          setIsUploading(false);
          setUploadComplete(true);
        }
      } catch (err) {
        console.error('Error parsing SSE message:', err);
      }
    };

    es.onerror = (err) => {
      console.error('EventSource error:', err);
      setError(new Error('Connection error'));
      setIsProcessing(false);
      es.close();
    };

    setEventSource(es);
  }, [user]);


  const uploadFileWithPresignedUrl = async (
    file: File,
    taskId: string,
    objectName: string,
    onProgress: (progress: number) => void
  ): Promise<string> => {
    try {

      const presignedResponse = await fetch('/api/upload/presigned-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          objectName,
          fileSize: file.size,
          mimeType: file.type,
          expiresIn: 3600,
        }),
      });

      if (!presignedResponse.ok) {
        const errorData = await presignedResponse.json() as { error?: string };
        throw new Error(errorData.error || '获取预签名URL失败');
      }

      const { presignedUrl, publicUrl } = await presignedResponse.json() as {
        presignedUrl: string;
        publicUrl: string;
        expiresAt: string;
      };

      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const startTime = Date.now();
        const progressHistory: Array<{ time: number; loaded: number }> = [];

        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            const currentTime = Date.now();
            
            progressHistory.push({ time: currentTime, loaded: event.loaded });
            
            const maxHistoryTime = 10 * 1000;
            while (progressHistory.length > 1 && 
                   currentTime - progressHistory[0].time > maxHistoryTime) {
              progressHistory.shift();
            }
            
            let speed = 0;
            if (progressHistory.length >= 2) {
              const oldestRecord = progressHistory[0];
              const latestRecord = progressHistory[progressHistory.length - 1];
              const timeDiff = (latestRecord.time - oldestRecord.time) / 1000;
              const bytesDiff = latestRecord.loaded - oldestRecord.loaded;
              speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
            }
            
            const remainingBytes = event.total - event.loaded;
            const remainingTime = speed > 0 ? remainingBytes / speed : 0;
            
            const progressInfo: UploadProgressInfo = {
              progress,
              loaded: event.loaded,
              total: event.total,
              speed,
              remainingTime,
              startTime
            };
            
            setUploadProgressInfo(progressInfo);
            onProgress(progress);
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status === 200) {
            try {
              await fetch('/api/upload/confirm-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, objectName, fileSize: file.size }),
              });
            } catch (confirmError) {
              console.warn('数据库状态更新失败，但文件已成功上传:', confirmError);
            }
            
            resolve(publicUrl);
          } else {
            reject(new Error(`上传失败: HTTP ${xhr.status} ${xhr.statusText}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('上传网络错误'));
        });

        xhr.addEventListener('timeout', () => {
          reject(new Error('上传超时'));
        });

        xhr.open('PUT', presignedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.timeout = 10 * 60 * 1000;
        xhr.send(file);
      });
      
    } catch (error) {
      console.error('预签名URL上传失败:', error);
      throw error;
    }
  };

  const createAndUploadTask = useCallback(async (
    file: File,
    options: { targetLanguage?: string; style?: string } = {}
  ) => {
    if (!user?.id) {
      setError(new Error('User not authenticated'));
      return;
    }

    resetWorkflow();
    setIsCreating(true);

    try {
      const createResponse = await fetch('/api/workflow/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          targetLanguage: options.targetLanguage || 'chinese',
          style: options.style || 'normal',
        }),
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json() as { error?: string };
        throw new Error(errorData.error || 'Failed to create task');
      }

      const result = await createResponse.json() as { taskId: string; objectName: string };
      const { taskId: newTaskId, objectName } = result;
      setTaskId(newTaskId);
      setProgress(10);

      setIsCreating(false);
      setIsUploading(true);
      
      const publicUrl = await uploadFileWithPresignedUrl(file, newTaskId, objectName, setUploadProgress);
      
      setIsUploading(false);
      setUploadComplete(true);
      setProgress(30);
      setVideoPreviewUrl(publicUrl);

      setIsProcessing(true);
      setProcessingError(null);
      await new Promise(resolve => setTimeout(resolve, 500));

      const processResponse = await fetch(`/api/workflow/${newTaskId}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetLanguage: options.targetLanguage || 'chinese',
          style: options.style || 'normal',
        }),
      });

      if (!processResponse.ok) {
        const errorData = await processResponse.json() as { error?: string };
        console.error('Process API error:', errorData);
        throw new Error(errorData.error || 'Failed to start processing');
      }

      setProgress(50);
      startStatusMonitoring(newTaskId);

    } catch (err: any) {
      console.error('工作流创建或处理失败:', err);
      const errorObj = err instanceof Error ? err : new Error(String(err));
      
      if (isCreating) {
        setError(errorObj);
        setIsCreating(false);
      } else if (isUploading) {
        setUploadError(errorObj);
        setIsUploading(false);
      } else {
        setProcessingError(errorObj);
        setIsProcessing(false);
      }
    }
  }, [user, resetWorkflow, startStatusMonitoring, isCreating, isUploading]);

  useEffect(() => {
    return () => {
      cleanupEventSource();
    };
  }, [cleanupEventSource]);

  return {
    task,
    isCreating,
    isUploading,
    uploadProgress,
    uploadProgressInfo,
    uploadComplete,
    isProcessing,
    processingComplete,
    progress,
    // 🔥 导出实时字幕状态
    realtimeSubtitles,
    isTranscribing,
    showSkeletons,
    videoPreviewUrl,
    error,
    uploadError,
    processingError,
    taskId,
    createAndUploadTask,
    resetWorkflow,
  };
}