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

// R2 配置
const R2_CUSTOM_DOMAIN = process.env.NEXT_PUBLIC_R2_CUSTOM_DOMAIN as string;
const R2_ENDPOINT = process.env.R2_ENDPOINT as string;
const R2_BUCKET_NAME = process.env.NEXT_PUBLIC_R2_BUCKET_NAME as string;

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
        } else if (update.status === 'separating' || update.status === 'transcribing' || update.status === 'processing') {
          setIsProcessing(true);
        } else if (update.status === 'uploaded') {
          // 上传完成，等待处理开始
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


  // 使用Worker分段上传实现官方推荐的上传方案
  const uploadFileWithWorkerMultipart = async (
    file: File,
    taskId: string,
    objectName: string,
    onProgress: (progress: number) => void
  ): Promise<string> => {
    try {
      const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk
      const MAX_CONCURRENT_UPLOADS = 8; // 最大并发上传数（基于官方建议优化）
      const MAX_RETRIES = 3; // 每个分片最大重试次数

      // 基于HTTP状态码判断是否可重试（官方推荐）
      const isRetriableError = (status: number): boolean => {
        // 基于HTTP标准的可重试状态码
        return [408, 429, 500, 502, 503, 504].includes(status);
      };

      // 1. 初始化分段上传（官方API格式）
      const initUrl = new URL('/api/upload/multipart', window.location.origin);
      initUrl.searchParams.set('action', 'mpu-create');
      
      const initResponse = await fetch(initUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          objectName,
        }),
      });

      if (!initResponse.ok) {
        const errorData = await initResponse.json() as { error?: string };
        throw new Error(errorData.error || '初始化分段上传失败');
      }

      const { uploadId, key: objectKey } = await initResponse.json() as {
        uploadId: string;
        key: string;
      };

      console.log('分段上传初始化成功:', { uploadId, objectKey });

      // 2. 计算分片
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
      const chunks: { partNumber: number; start: number; end: number; blob: Blob }[] = [];
      
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);
        
        chunks.push({
          partNumber: i + 1,
          start,
          end,
          blob
        });
      }

      console.log(`文件分片完成: ${totalChunks} 个分片，每片约 ${(CHUNK_SIZE / 1024 / 1024).toFixed(1)}MB`);

      // 3. 分片上传状态跟踪
      const uploadedParts: { partNumber: number; etag: string }[] = [];
      const failedParts: number[] = [];
      let completedChunks = 0;

      // 4. 分片上传函数（官方API格式 + 智能重试）
      const uploadChunk = async (chunk: { partNumber: number; start: number; end: number; blob: Blob }): Promise<void> => {
        for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
          try {
            // 使用URL参数传递参数（官方模式）
            const uploadUrl = new URL('/api/upload/multipart', window.location.origin);
            uploadUrl.searchParams.set('action', 'mpu-uploadpart');
            uploadUrl.searchParams.set('uploadId', uploadId);
            uploadUrl.searchParams.set('partNumber', chunk.partNumber.toString());
            uploadUrl.searchParams.set('key', objectKey);
            uploadUrl.searchParams.set('taskId', taskId);
            
            const response = await fetch(uploadUrl.toString(), {
              method: 'PUT',
              body: chunk.blob, // 直接传递blob数据
            });

            if (!response.ok) {
              const error: any = new Error(`分片 ${chunk.partNumber} 上传失败: ${response.status}`);
              error.status = response.status;
              throw error;
            }

            const result = await response.json() as { etag: string };
            
            // 记录成功上传的分片
            uploadedParts.push({
              partNumber: chunk.partNumber,
              etag: result.etag
            });

            completedChunks++;
            const progress = Math.round((completedChunks / totalChunks) * 100);
            onProgress(progress);

            console.log(`分片 ${chunk.partNumber}/${totalChunks} 上传成功 (${progress}%)`);
            return; // 成功，退出重试循环

          } catch (error: any) {
            const isLastAttempt = attempt === MAX_RETRIES + 1;
            const shouldRetry = !isLastAttempt && isRetriableError(error.status);
            
            console.error(`分片 ${chunk.partNumber} 上传失败 (尝试 ${attempt}/${MAX_RETRIES + 1}):`, error.message);
            
            if (!shouldRetry) {
              // 不可重试的错误或已达最大重试次数
              failedParts.push(chunk.partNumber);
              throw error;
            }
            
            // 指数退避延迟重试
            const baseDelay = Math.pow(2, attempt - 1) * 1000;
            const jitter = Math.random() * 500; // 添加抖动避免请求冲突
            await new Promise(resolve => setTimeout(resolve, baseDelay + jitter));
          }
        }
      };

      // 5. 高效并发上传分片（官方推荐的并发模式）
      const uploadChunksWithConcurrency = async (
        chunks: { partNumber: number; start: number; end: number; blob: Blob }[], 
        maxConcurrency: number = MAX_CONCURRENT_UPLOADS
      ): Promise<void> => {
        const executing: Promise<any>[] = [];
        
        for (const chunk of chunks) {
          // 创建上传Promise，包含完成后的清理逻辑
          const promise = uploadChunk(chunk).then(() => {
            // 从执行队列中移除已完成的Promise
            const index = executing.indexOf(promise);
            if (index > -1) {
              executing.splice(index, 1);
            }
          });
          
          executing.push(promise);
          
          // 当达到最大并发数时，等待任一分片完成
          if (executing.length >= maxConcurrency) {
            await Promise.race(executing);
          }
        }
        
        // 等待所有剩余的分片完成
        await Promise.all(executing);
      };

      // 执行并发上传
      await uploadChunksWithConcurrency(chunks);

      // 检查是否有失败的分片
      if (failedParts.length > 0) {
        throw new Error(`${failedParts.length} 个分片上传失败: ${failedParts.join(', ')}`);
      }

      console.log(`所有分片上传完成，开始合并...`);

      // 6. 完成分段上传（官方API格式）
      const sortedParts = uploadedParts.sort((a, b) => a.partNumber - b.partNumber);
      
      const completeUrl = new URL('/api/upload/multipart', window.location.origin);
      completeUrl.searchParams.set('action', 'mpu-complete');
      completeUrl.searchParams.set('uploadId', uploadId);
      completeUrl.searchParams.set('key', objectKey);
      completeUrl.searchParams.set('taskId', taskId);
      
      const completeResponse = await fetch(completeUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parts: sortedParts, // 官方格式：只传递parts数组
        }),
      });

      if (!completeResponse.ok) {
        const errorData = await completeResponse.json() as { error?: string };
        throw new Error(errorData.error || '完成分段上传失败');
      }

      const { publicUrl, etag } = await completeResponse.json() as { publicUrl: string; etag: string };
      
      console.log('分段上传完全成功:', { publicUrl, etag });
      return publicUrl;
      
    } catch (error) {
      console.error('Worker分段上传失败:', error);
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

      // 2. 使用预签名URL直接上传文件到R2
      setIsCreating(false);
      setIsUploading(true);
      
      const publicUrl = await uploadFileWithWorkerMultipart(file, newTaskId, objectName, setUploadProgress);
      
      setIsUploading(false);
      setUploadComplete(true);
      
      // 3. 数据库状态已在分段上传完成API中更新，无需额外调用
      
      setProgress(30);

      // 4. 设置视频预览URL
      console.log('Direct upload successful, public URL:', publicUrl);
      setVideoPreviewUrl(publicUrl);

      // 4. 触发工作流处理
      setIsProcessing(true);
      setProcessingError(null);

      // 短暂等待确保上传状态已更新
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