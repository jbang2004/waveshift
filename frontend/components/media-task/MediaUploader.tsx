'use client';

import { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMediaWorkflow } from '@/hooks/use-media-workflow';
import { Upload, Video, Volume2, FileText } from 'lucide-react';

interface MediaUploaderProps {
  onTaskCompleted?: (taskId: string) => void;
}

export default function MediaUploader({ onTaskCompleted }: MediaUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [targetLanguage, setTargetLanguage] = useState('chinese');
  const [style, setStyle] = useState('normal');
  
  const { 
    task,
    isCreating,
    isUploading,
    uploadProgress,
    isProcessing,
    progress,
    error,
    uploadError,
    processingError,
    createAndUploadTask,
    resetWorkflow
  } = useMediaWorkflow();

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 文件大小检查 (100MB)
    const maxSize = 100 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('文件大小不能超过100MB');
      return;
    }

    // 文件类型检查
    const supportedTypes = [
      'video/mp4', 'video/webm', 'video/mov', 'video/avi', 'video/x-matroska',
      'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/flac', 
      'audio/aac', 'audio/ogg'
    ];
    
    if (!supportedTypes.includes(file.type)) {
      alert('不支持的文件格式');
      return;
    }

    try {
      await createAndUploadTask(file, { targetLanguage, style });
      // onTaskCompleted 回调在工作流完成时触发
    } catch (err) {
      console.error('工作流处理失败:', err);
    }
  };

  const showResults = task?.status === 'completed';

  // 处理任务完成回调
  useEffect(() => {
    if (task?.status === 'completed' && task.id && onTaskCompleted) {
      onTaskCompleted(task.id);
    }
  }, [task?.status, task?.id, onTaskCompleted]);

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-6 w-6" />
          媒体处理工具
        </CardTitle>
        <CardDescription>
          上传视频文件进行音视频分离和转录处理
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {(error || uploadError || processingError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {error?.message || uploadError?.message || processingError?.message}
            </AlertDescription>
          </Alert>
        )}

        {!task || task.status === 'failed' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">目标语言</label>
                <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择目标语言" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chinese">中文</SelectItem>
                    <SelectItem value="english">英文</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">翻译风格</label>
                <Select value={style} onValueChange={setStyle}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择翻译风格" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="normal">普通</SelectItem>
                    <SelectItem value="classical">古典</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
              <div className="space-y-2">
                <p className="text-lg font-medium">点击上传文件</p>
                <p className="text-sm text-gray-500">
                  支持 MP4, WebM, MOV, AVI, MP3, WAV, M4A, FLAC, AAC, OGG
                </p>
                <p className="text-xs text-gray-400">
                  最大文件大小: 100MB
                </p>
              </div>
              <Button 
                onClick={handleFileSelect}
                disabled={isCreating || isUploading || isProcessing}
                className="mt-4"
              >
                {isCreating ? '创建中...' : 
                 isUploading ? '上传中...' :
                 isProcessing ? '处理中...' : '选择文件'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="video/*,audio/*"
                onChange={handleFileChange}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">处理状态</h3>
              <Button variant="outline" onClick={resetWorkflow}>
                重新开始
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {isCreating ? '创建任务' :
                   isUploading ? '上传文件' :
                   isProcessing ? '处理中' : '任务进度'}
                </span>
                <span>
                  {isUploading ? `${uploadProgress}%` : `${progress}%`}
                </span>
              </div>
              <Progress 
                value={isUploading ? uploadProgress : progress} 
                className="w-full" 
              />
              <p className="text-sm text-gray-600">
                状态: {
                  isCreating ? '创建任务中' :
                  isUploading ? '上传文件中' :
                  isProcessing ? '处理中' :
                  task?.status === 'completed' ? '已完成' :
                  task?.status === 'failed' ? '失败' :
                  task?.status || '等待中'
                }
              </p>
            </div>

            {showResults && (
              <div className="space-y-4 pt-4 border-t">
                <h3 className="text-lg font-medium">处理结果</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {task.videoUrl && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Video className="h-4 w-4" />
                          无声视频
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Button asChild className="w-full">
                          <a href={task.videoUrl} target="_blank" rel="noopener noreferrer">
                            播放/下载
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                  
                  {task.audioUrl && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Volume2 className="h-4 w-4" />
                          音频文件
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Button asChild className="w-full">
                          <a href={task.audioUrl} target="_blank" rel="noopener noreferrer">
                            播放/下载
                          </a>
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {task.transcription && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        转录结果
                      </CardTitle>
                      <CardDescription>
                        语言: {task.transcription.targetLanguage} | 
                        风格: {task.transcription.style} | 
                        片段数: {task.transcription.totalSegments}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {task.transcription.segments?.map((segment) => (
                          <div key={segment.id} className="border rounded p-3 space-y-1">
                            <div className="flex justify-between text-xs text-gray-500">
                              <span>#{segment.sequence}</span>
                              <span>{segment.start} - {segment.end}</span>
                              <span>{segment.speaker}</span>
                            </div>
                            <div className="text-sm">
                              <p><strong>原文:</strong> {segment.original}</p>
                              <p><strong>翻译:</strong> {segment.translation}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}