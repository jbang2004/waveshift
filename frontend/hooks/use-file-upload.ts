/**
 * 通用的文件上传 Hook
 * 支持分块上传、进度监控、错误重试等功能
 */

import { useState, useCallback } from 'react';

// 上传配置接口
export interface UploadConfig {
  chunkSize?: number;
  maxConcurrent?: number;
  retryAttempts?: number;
  apiPath?: string;
}

// 上传状态接口
export interface UploadState {
  isUploading: boolean;
  progress: number;
  error: Error | null;
  completed: boolean;
}

// 上传操作接口
export interface UploadActions {
  uploadFile: (file: File, objectName: string) => Promise<void>;
  resetUpload: () => void;
}

// 上传分块接口
interface UploadPart {
  partNumber: number;
  etag: string;
}

const DEFAULT_CONFIG: Required<UploadConfig> = {
  chunkSize: 5 * 1024 * 1024, // 5MB
  maxConcurrent: 3,
  retryAttempts: 3,
  apiPath: '/api/r2-presigned-url',
};

export function useFileUpload(config: UploadConfig = {}): UploadState & UploadActions {
  const uploadConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [completed, setCompleted] = useState(false);

  // 重置上传状态
  const resetUpload = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
    setCompleted(false);
  }, []);

  // 上传单个分块
  const uploadChunk = useCallback(async (
    chunk: Blob,
    partNumber: number,
    uploadId: string,
    objectName: string,
    retryCount = 0
  ): Promise<UploadPart> => {
    try {
      // 获取分块上传URL
      const urlResponse = await fetch(uploadConfig.apiPath, {
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
      if (retryCount < uploadConfig.retryAttempts) {
        console.warn(`分块 ${partNumber} 上传失败，正在重试 ${retryCount + 1}/${uploadConfig.retryAttempts}`);
        // 指数退避重试
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
        return uploadChunk(chunk, partNumber, uploadId, objectName, retryCount + 1);
      }
      throw error;
    }
  }, [uploadConfig.apiPath, uploadConfig.retryAttempts]);

  // 主要的文件上传函数
  const uploadFile = useCallback(async (file: File, objectName: string) => {
    if (isUploading) {
      throw new Error('Upload already in progress');
    }

    resetUpload();
    setIsUploading(true);

    let uploadId = '';

    try {
      // 1. 初始化分块上传
      const initiateResponse = await fetch(uploadConfig.apiPath, {
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
      for (let start = 0; start < file.size; start += uploadConfig.chunkSize) {
        const end = Math.min(start + uploadConfig.chunkSize, file.size);
        chunks.push(file.slice(start, end));
      }

      // 3. 并发上传分块
      const uploadedParts: UploadPart[] = new Array(chunks.length);
      let completedChunks = 0;

      const updateProgress = () => {
        const currentProgress = Math.round((completedChunks / chunks.length) * 100);
        setProgress(currentProgress);
      };

      // 控制并发的分块上传函数
      const uploadChunkWithIndex = async (chunkIndex: number) => {
        const chunk = chunks[chunkIndex];
        const partNumber = chunkIndex + 1;

        try {
          const uploadedPart = await uploadChunk(chunk, partNumber, uploadId, objectName);
          uploadedParts[chunkIndex] = uploadedPart;
          completedChunks++;
          updateProgress();
        } catch (error) {
          console.error(`分块 ${partNumber} 上传失败:`, error);
          throw error;
        }
      };

      // 分批并发上传
      for (let i = 0; i < chunks.length; i += uploadConfig.maxConcurrent) {
        const batch = [];
        for (let j = i; j < Math.min(i + uploadConfig.maxConcurrent, chunks.length); j++) {
          batch.push(uploadChunkWithIndex(j));
        }
        await Promise.all(batch);
      }

      // 4. 完成分块上传
      const completeResponse = await fetch(uploadConfig.apiPath, {
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

      // 上传成功
      setProgress(100);
      setCompleted(true);
      setIsUploading(false);

    } catch (error) {
      // 上传失败时中止分块上传
      if (uploadId) {
        try {
          await fetch(uploadConfig.apiPath, {
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

      const errorObj = error instanceof Error ? error : new Error(String(error));
      setError(errorObj);
      setIsUploading(false);
      throw errorObj;
    }
  }, [isUploading, resetUpload, uploadConfig, uploadChunk]);

  return {
    // 状态
    isUploading,
    progress,
    error,
    completed,
    
    // 操作
    uploadFile,
    resetUpload,
  };
}

/**
 * 简化的媒体文件上传 Hook
 * 专门用于媒体文件的上传，包含文件类型验证
 */
export function useMediaFileUpload(config: UploadConfig = {}) {
  const upload = useFileUpload(config);
  
  // 支持的媒体文件类型
  const supportedTypes = [
    'video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/x-matroska',
    'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/flac', 'audio/aac', 'audio/ogg'
  ];

  const uploadMediaFile = useCallback(async (file: File, objectName: string) => {
    // 文件类型验证
    if (!supportedTypes.includes(file.type)) {
      throw new Error(`不支持的文件格式: ${file.type}`);
    }

    // 文件大小验证 (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('文件大小不能超过100MB');
    }

    return upload.uploadFile(file, objectName);
  }, [upload.uploadFile]);

  return {
    ...upload,
    uploadMediaFile,
    supportedTypes,
  };
}