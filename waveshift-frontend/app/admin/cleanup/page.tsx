'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Trash2, AlertTriangle, BarChart3, RefreshCw } from 'lucide-react';

interface DataStats {
  users: number;
  mediaTasks: number;
  transcriptions: number;
  transcriptionSegments: number;
  ttsTasks: number;
  ttsSegments: number;
}

interface R2Stats {
  totalFiles: number;
  totalSize: number;
  filesByType: Record<string, number>;
  filesByUser: Record<string, number>;
  largestFiles: Array<{
    key: string;
    size: number;
    uploaded: string;
  }>;
}

interface CleanupOptions {
  clearMediaTasks: boolean;
  clearTranscriptions: boolean;
  clearTTSTasks: boolean;
  clearUsers: boolean;
  clearR2Files: boolean;
}

export default function AdminCleanupPage() {
  const [stats, setStats] = useState<DataStats | null>(null);
  const [r2Stats, setR2Stats] = useState<R2Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingR2, setLoadingR2] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    results?: {
      clearedTables: string[];
      warnings: string[];
      errors: string[];
    };
    verification?: {
      mediaTasksCount: number;
      transcriptionsCount: number;
      segmentsCount: number;
      usersCount: number;
    };
    nextSteps?: string[];
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [options, setOptions] = useState<CleanupOptions>({
    clearMediaTasks: true,
    clearTranscriptions: true,
    clearTTSTasks: true,
    clearUsers: false,
    clearR2Files: false,
  });

  // 获取当前数据统计
  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/admin/cleanup');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json() as { success: boolean; stats?: DataStats; error?: string };
      if (data.success && data.stats) {
        setStats(data.stats);
      } else {
        throw new Error(data.error || '获取统计数据失败');
      }
    } catch (err) {
      console.error('获取统计数据错误:', err);
      setError(err instanceof Error ? err.message : '获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  // 执行清理操作
  const handleCleanup = async () => {
    if (!confirm('确定要执行数据清理操作吗？此操作不可逆！')) {
      return;
    }

    setCleaning(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options }),
      });

      const data = await response.json() as {
        success: boolean;
        error?: string;
        results?: {
          clearedTables: string[];
          warnings: string[];
          errors: string[];
        };
        verification?: {
          mediaTasksCount: number;
          transcriptionsCount: number;
          segmentsCount: number;
          usersCount: number;
        };
        nextSteps?: string[];
      };
      
      if (data.success) {
        setResult(data);
        // 清理后重新获取统计
        await fetchStats();
        if (options.clearR2Files) {
          await fetchR2Stats();
        }
      } else {
        throw new Error(data.error || '清理操作失败');
      }
    } catch (err) {
      console.error('清理操作错误:', err);
      setError(err instanceof Error ? err.message : '清理操作失败');
    } finally {
      setCleaning(false);
    }
  };

  // 获取R2存储统计
  const fetchR2Stats = async () => {
    setLoadingR2(true);
    
    try {
      const response = await fetch('/api/admin/r2-stats');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json() as { success: boolean; stats?: R2Stats; error?: string };
      if (data.success && data.stats) {
        setR2Stats(data.stats);
      } else {
        throw new Error(data.error || '获取R2统计数据失败');
      }
    } catch (err) {
      console.error('获取R2统计数据错误:', err);
      setError(err instanceof Error ? err.message : '获取R2统计数据失败');
    } finally {
      setLoadingR2(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchR2Stats();
  }, []);

  const getTotalRecords = () => {
    if (!stats) return 0;
    return stats.users + stats.mediaTasks + stats.transcriptions + 
           stats.transcriptionSegments + stats.ttsTasks + stats.ttsSegments;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">数据清理管理</h1>
        <p className="text-muted-foreground">
          清空 WaveShift 平台的数据库和存储，为新的测试做准备
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* 当前数据统计 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            当前数据统计
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
              className="ml-auto"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              刷新
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              加载统计数据...
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.users}</div>
                <div className="text-sm text-muted-foreground">用户</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.mediaTasks}</div>
                <div className="text-sm text-muted-foreground">媒体任务</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.transcriptions}</div>
                <div className="text-sm text-muted-foreground">转录任务</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.transcriptionSegments}</div>
                <div className="text-sm text-muted-foreground">转录片段</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.ttsTasks}</div>
                <div className="text-sm text-muted-foreground">TTS任务</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{stats.ttsSegments}</div>
                <div className="text-sm text-muted-foreground">TTS片段</div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              无法获取统计数据
            </div>
          )}
          
          {stats && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <div className="text-lg font-semibold">
                总记录数: {getTotalRecords()}
              </div>
              <div className="text-sm text-muted-foreground">
                最后更新: {new Date().toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 清理选项 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>清理选项</CardTitle>
          <CardDescription>
            选择要清理的数据类型。建议按顺序清理以避免外键冲突。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="clearMediaTasks" className="font-medium">
                媒体任务
              </Label>
              <p className="text-sm text-muted-foreground">
                清理所有媒体处理任务记录
              </p>
            </div>
            <Switch
              id="clearMediaTasks"
              checked={options.clearMediaTasks}
              onCheckedChange={(checked) => 
                setOptions(prev => ({ ...prev, clearMediaTasks: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="clearTranscriptions" className="font-medium">
                转录数据
              </Label>
              <p className="text-sm text-muted-foreground">
                清理转录任务和所有转录片段
              </p>
            </div>
            <Switch
              id="clearTranscriptions"
              checked={options.clearTranscriptions}
              onCheckedChange={(checked) => 
                setOptions(prev => ({ ...prev, clearTranscriptions: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="clearTTSTasks" className="font-medium">
                TTS数据
              </Label>
              <p className="text-sm text-muted-foreground">
                清理TTS任务、片段和声音模型
              </p>
            </div>
            <Switch
              id="clearTTSTasks"
              checked={options.clearTTSTasks}
              onCheckedChange={(checked) => 
                setOptions(prev => ({ ...prev, clearTTSTasks: checked }))
              }
            />
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="clearUsers" className="font-medium text-red-600">
                  用户数据
                </Label>
                <p className="text-sm text-muted-foreground">
                  ⚠️ 危险操作：清理所有用户账户
                </p>
              </div>
              <Switch
                id="clearUsers"
                checked={options.clearUsers}
                onCheckedChange={(checked) => 
                  setOptions(prev => ({ ...prev, clearUsers: checked }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label htmlFor="clearR2Files" className="font-medium text-red-600">
                R2存储文件
              </Label>
              <p className="text-sm text-muted-foreground">
                ⚠️ 清理所有存储的媒体文件（不可恢复）
              </p>
              {r2Stats && (
                <div className="mt-2 text-xs space-y-1">
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">
                      文件数: <span className="font-medium text-foreground">{r2Stats.totalFiles}</span>
                    </span>
                    <span className="text-muted-foreground">
                      总大小: <span className="font-medium text-foreground">{formatBytes(r2Stats.totalSize)}</span>
                    </span>
                  </div>
                  {Object.keys(r2Stats.filesByType).length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">类型:</span>
                      {Object.entries(r2Stats.filesByType).map(([type, count]) => (
                        <Badge key={type} variant="secondary" className="text-xs">
                          {type}: {count}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchR2Stats}
                disabled={loadingR2}
              >
                {loadingR2 ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
              <Switch
                id="clearR2Files"
                checked={options.clearR2Files}
                onCheckedChange={(checked) => 
                  setOptions(prev => ({ ...prev, clearR2Files: checked }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 执行清理按钮 */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <Button
            onClick={handleCleanup}
            disabled={cleaning || (getTotalRecords() === 0 && (!r2Stats || r2Stats.totalFiles === 0))}
            variant="destructive"
            size="lg"
            className="w-full"
          >
            {cleaning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                执行清理中...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                执行数据清理
              </>
            )}
          </Button>
          
          {getTotalRecords() === 0 && (!r2Stats || r2Stats.totalFiles === 0) && (
            <p className="text-center text-sm text-muted-foreground mt-2">
              数据库和存储都已经是空的，无需清理
            </p>
          )}
        </CardContent>
      </Card>

      {/* 清理结果 */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-600">清理操作完成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.results && result.results.clearedTables.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">已清理的表:</h4>
                <div className="flex flex-wrap gap-2">
                  {result.results.clearedTables.map((table: string) => (
                    <Badge key={table} variant="outline">
                      {table}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.results && result.results.warnings.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-yellow-600">警告:</h4>
                <ul className="text-sm space-y-1">
                  {result.results.warnings.map((warning: string, index: number) => (
                    <li key={index} className="text-yellow-600">• {warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.results && result.results.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-red-600">错误:</h4>
                <ul className="text-sm space-y-1">
                  {result.results.errors.map((error: string, index: number) => (
                    <li key={index} className="text-red-600">• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.verification && (
              <div>
                <h4 className="font-medium mb-2">验证结果:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>媒体任务: {result.verification.mediaTasksCount}</div>
                  <div>转录任务: {result.verification.transcriptionsCount}</div>
                  <div>转录片段: {result.verification.segmentsCount}</div>
                  <div>用户数量: {result.verification.usersCount}</div>
                </div>
              </div>
            )}

            {result.nextSteps && result.nextSteps.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">后续步骤:</h4>
                <ul className="text-sm space-y-1">
                  {result.nextSteps.map((step: string, index: number) => (
                    <li key={index}>• {step}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}