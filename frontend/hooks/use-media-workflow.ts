/**
 * 统一的媒体处理工作流 Hook
 * 合并了原来的 use-media-task 和 use-video-upload 的功能
 * 提供完整的文件上传、处理和状态监听功能
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import type { MediaTask, Transcription, TranscriptionSegment } from '@/db/schema-media';

// 扩展的媒体任务类型，包含转录信息
export interface MediaTaskWithTranscription extends MediaTask {
  transcription?: Transcription & {
    segments: TranscriptionSegment[];
  };
}

// Hook 状态接口
interface MediaWorkflowState {
  // 任务状态
  task: MediaTaskWithTranscription | null;
  
  // 上传状态
  isCreating: boolean;
  isUploading: boolean;
  uploadProgress: number;
  uploadComplete: boolean;
  
  // 处理状态
  isProcessing: boolean;
  processingComplete: boolean;
  progress: number;
  
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

// 分块上传配置
const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
const MAX_CONCURRENT_UPLOADS = 3;
const RETRY_ATTEMPTS = 3;
const R2_CUSTOM_DOMAIN = process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN as string;
const MULTIPART_API_PATH = '/api/r2-presigned-url';

// 上传分块接口
interface UploadPart {
  partNumber: number;
  etag: string;
}

export function useMediaWorkflow(): MediaWorkflowState & MediaWorkflowActions {
  const { user } = useAuth();
  
  // 任务状态
  const [task, setTask] = useState<MediaTaskWithTranscription | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  
  // 上传状态
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  
  // 处理状态
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingComplete, setProcessingComplete] = useState(false);
  const [progress, setProgress] = useState(0);
  
  // 结果状态
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  
  // 错误状态
  const [error, setError] = useState<Error | null>(null);
  const [uploadError, setUploadError] = useState<Error | null>(null);
  const [processingError, setProcessingError] = useState<Error | null>(null);
  
  // SSE 连接
  const [eventSource, setEventSource] = useState<EventSource | null>(null);

  // 清理 EventSource 连接
  const cleanupEventSource = useCallback(() => {
    if (eventSource) {
      eventSource.close();
      setEventSource(null);
    }
  }, [eventSource]);

  // 重置所有状态
  const resetWorkflow = useCallback(() => {
    cleanupEventSource();
    setTask(null);
    setTaskId(null);
    
    setIsCreating(false);
    setIsUploading(false);
    setUploadProgress(0);
    setUploadComplete(false);
    
    setIsProcessing(false);
    setProcessingComplete(false);
    setProgress(0);
    
    setVideoPreviewUrl(null);
    
    setError(null);
    setUploadError(null);
    setProcessingError(null);
  }, [cleanupEventSource]);

  // 开始 SSE 状态监听
  const startStatusMonitoring = useCallback((taskId: string) => {
    if (!user) return;

    const es = new EventSource(`/api/workflow/${taskId}/status`);

    es.onmessage = (event) => {
      try {
        const update = JSON.parse(event.data);
        
        if (update.error) {
          setError(new Error(update.error));
          setIsProcessing(false);
          es.close();
          return;
        }

        setTask(update);
        setProgress(update.progress || 0);

        // 根据状态更新处理状态
        if (update.status === 'completed') {
          setIsProcessing(false);
          setProcessingComplete(true);
          setProgress(100);
          
          // 设置视频预览URL
          if (update.videoUrl) {
            setVideoPreviewUrl(update.videoUrl);
          }
          
          es.close();
        } else if (update.status === 'failed') {
          setError(new Error(update.error || 'Task failed'));
          setIsProcessing(false);
          es.close();
        } else if (update.status === 'separating' || update.status === 'transcribing') {
          setIsProcessing(true);
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

  // 上传单个分块
  const uploadChunk = async (
    chunk: Blob,
    partNumber: number,
    uploadId: string,
    objectName: string,
    retryCount = 0
  ): Promise<UploadPart> => {
    try {
      // 获取分块上传URL
      const urlResponse = await fetch(MULTIPART_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'getPartUrl',
          objectName,
          uploadId,
          partNumber
        }),
      });

      if (!urlResponse.ok) {
        throw new Error(`获取分块上传URL失败: ${urlResponse.statusText}`);
      }

      const { partUrl } = await urlResponse.json() as { partUrl: string };

      // 上传分块
      const uploadResponse = await fetch(partUrl, {
        method: 'PUT',
        body: chunk,
        headers: {
          'Content-Type': 'application/octet-stream'
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`分块上传失败: ${uploadResponse.statusText}`);
      }

      const etag = uploadResponse.headers.get('ETag');
      if (!etag) {
        throw new Error('上传响应中缺少ETag');
      }

      return {
        partNumber,
        etag: etag.replace(/^"(.+)"$/, '$1') // 移除首尾引号
      };
    } catch (error) {
      if (retryCount < RETRY_ATTEMPTS) {
        console.warn(`分块 ${partNumber} 上传失败，正在重试 ${retryCount + 1}/${RETRY_ATTEMPTS}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount))); // 指数退避
        return uploadChunk(chunk, partNumber, uploadId, objectName, retryCount + 1);
      }
      throw error;
    }
  };

  // 分块上传文件
  const uploadFileInChunks = async (
    file: File,
    objectName: string,
    onProgress: (progress: number) => void
  ): Promise<void> => {
    let uploadId = '';

    try {
      // 1. 初始化分块上传
      const initiateResponse = await fetch(MULTIPART_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initiate',
          objectName
        }),
      });

      if (!initiateResponse.ok) {
        throw new Error('初始化分块上传失败');
      }

      const { uploadId: newUploadId } = await initiateResponse.json() as { uploadId: string };
      uploadId = newUploadId;

      // 2. 分割文件为块
      const chunks: Blob[] = [];
      for (let start = 0; start < file.size; start += CHUNK_SIZE) {
        const end = Math.min(start + CHUNK_SIZE, file.size);
        chunks.push(file.slice(start, end));
      }

      // 3. 并发上传分块
      const uploadedParts: UploadPart[] = new Array(chunks.length);
      let completedChunks = 0;

      // 使用 Promise 控制并发
      const uploadChunkWithIndex = async (chunkIndex: number) => {
        const chunk = chunks[chunkIndex];
        const partNumber = chunkIndex + 1;

        try {
          const uploadedPart = await uploadChunk(chunk, partNumber, uploadId, objectName);
          uploadedParts[chunkIndex] = uploadedPart;
          completedChunks++;
          
          // 更新进度
          const progress = Math.round((completedChunks / chunks.length) * 100);
          onProgress(progress);
        } catch (error) {
          console.error(`分块 ${partNumber} 上传失败:`, error);
          throw error;
        }
      };

      // 分批并发上传
      for (let i = 0; i < chunks.length; i += MAX_CONCURRENT_UPLOADS) {
        const batch = [];
        for (let j = i; j < Math.min(i + MAX_CONCURRENT_UPLOADS, chunks.length); j++) {
          batch.push(uploadChunkWithIndex(j));
        }
        await Promise.all(batch);
      }

      // 4. 完成分块上传
      const completeResponse = await fetch(MULTIPART_API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          objectName,
          uploadId,
          parts: uploadedParts.sort((a, b) => a.partNumber - b.partNumber)
        }),
      });

      if (!completeResponse.ok) {
        throw new Error('完成分块上传失败');
      }

    } catch (error) {
      // 上传失败时中止分块上传
      if (uploadId) {
        try {
          await fetch(MULTIPART_API_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'abort',
              objectName,
              uploadId
            }),
          });
        } catch (abortError) {
          console.error('中止分块上传失败:', abortError);
        }
      }
      throw error;
    }
  };

  // 创建并上传任务的主要函数
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
      // 1. 创建任务并获取上传信息
      const createResponse = await fetch('/api/workflow/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
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

      // 2. 上传文件
      setIsCreating(false);
      setIsUploading(true);
      await uploadFileInChunks(file, objectName, setUploadProgress);
      setIsUploading(false);
      setUploadComplete(true);
      setProgress(30);

      // 3. 生成公开 URL
      const publicUrl = `${R2_CUSTOM_DOMAIN}/${objectName}`;
      setVideoPreviewUrl(publicUrl);

      // 4. 触发工作流处理
      setIsProcessing(true);
      setProcessingError(null);

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
        throw new Error(errorData.error || 'Failed to start processing');
      }

      setProgress(50);

      // 5. 开始SSE实时状态监听
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

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanupEventSource();
    };
  }, [cleanupEventSource]);

  return {
    // 状态
    task,
    isCreating,
    isUploading,
    uploadProgress,
    uploadComplete,
    isProcessing,
    processingComplete,
    progress,
    videoPreviewUrl,
    error,
    uploadError,
    processingError,
    taskId,
    
    // 操作
    createAndUploadTask,
    resetWorkflow,
  };
}