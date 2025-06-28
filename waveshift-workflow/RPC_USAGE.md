# Separate Worker RPC 接口使用指南

## 概述

Separate Worker 现在支持两种调用方式：
1. **HTTP 接口** - 用于前端应用和外部服务
2. **RPC 接口** - 用于 Worker 间的高性能类型安全通信

## RPC 接口优势

✅ **类型安全** - 完整的 TypeScript 类型支持  
✅ **高性能** - 零延迟的 Worker 间通信  
✅ **简洁 API** - 直接方法调用，无需构造 HTTP 请求  
✅ **错误处理** - 原生 Promise/async-await 支持  

## 配置 Service Binding

在调用方的 `wrangler.toml` 中添加：

```toml
[[services]]
binding = "SEPARATE_SERVICE"
service = "separate-worker"
environment = "production"
```

## 类型定义

```typescript
interface SeparationOptions {
  startTime?: number;
  endTime?: number;
  audioFormat?: 'mp3' | 'wav';
  videoFormat?: 'mp4' | 'webm';
  autoTranscribe?: boolean;
  transcriptionOptions?: {
    targetLanguage?: string;
    style?: string;
  };
}

interface SeparationResult {
  success: boolean;
  taskId?: string;
  videoUrl?: string;
  audioUrl?: string;
  transcription?: {
    taskId: string;
    status: TranscriptionStatus;
    statusUrl: string;
    resultUrl: string;
    estimatedCompletion: string;
  };
  error?: string;
}
```

## RPC 方法列表

### 1. 分离音视频

```typescript
async separateVideo(
  videoData: ArrayBuffer,
  filename?: string,
  options?: SeparationOptions
): Promise<SeparationResult>
```

### 2. 查询转录状态

```typescript
async getTranscriptionStatus(taskId: string): Promise<{
  taskId: string;
  status: TranscriptionStatus;
  progress?: number;
  error?: string;
}>
```

### 3. 获取转录结果

```typescript
async getTranscriptionResult(taskId: string): Promise<TranscriptionResult | null>
```

### 4. 列出转录任务

```typescript
async listTranscriptions(userId?: string, limit?: number): Promise<TranscriptionTask[]>
```

### 5. 健康检查

```typescript
async healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  services: {
    container: boolean;
    transcription: boolean;
    database: boolean;
    storage: boolean;
  };
}>
```

## 使用示例

### 基本音视频分离

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // 获取视频数据
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const videoData = await videoFile.arrayBuffer();
    
    // RPC 调用分离服务
    const result = await env.SEPARATE_SERVICE.separateVideo(
      videoData,
      videoFile.name,
      {
        autoTranscribe: true,
        transcriptionOptions: {
          targetLanguage: 'chinese',
          style: 'normal'
        }
      }
    );
    
    return Response.json(result);
  }
}
```

### 带时间裁剪的分离

```typescript
const result = await env.SEPARATE_SERVICE.separateVideo(
  videoData,
  'input.mp4',
  {
    startTime: 30,    // 从30秒开始
    endTime: 120,     // 到120秒结束
    audioFormat: 'mp3',
    videoFormat: 'mp4',
    autoTranscribe: true
  }
);

if (result.success) {
  console.log('视频URL:', result.videoUrl);
  console.log('音频URL:', result.audioUrl);
  console.log('转录任务ID:', result.transcription?.taskId);
}
```

### 查询转录进度

```typescript
const status = await env.SEPARATE_SERVICE.getTranscriptionStatus(taskId);

switch (status.status) {
  case 'processing':
    console.log(`转录进行中... 进度: ${status.progress}%`);
    break;
  case 'completed':
    const result = await env.SEPARATE_SERVICE.getTranscriptionResult(taskId);
    console.log('转录完成:', result);
    break;
  case 'failed':
    console.error('转录失败:', status.error);
    break;
}
```

### 批量查询任务

```typescript
const tasks = await env.SEPARATE_SERVICE.listTranscriptions(userId, 20);

for (const task of tasks) {
  console.log(`任务 ${task.id}: ${task.status} - ${task.created_at}`);
}
```

### 健康检查

```typescript
const health = await env.SEPARATE_SERVICE.healthCheck();

if (health.status === 'healthy') {
  console.log('所有服务运行正常');
} else {
  console.log('服务状态异常:', health.services);
}
```

## 错误处理

RPC 调用返回结构化的错误信息：

```typescript
try {
  const result = await env.SEPARATE_SERVICE.separateVideo(videoData);
  
  if (!result.success) {
    console.error('分离失败:', result.error);
    return Response.json({ error: result.error }, { status: 400 });
  }
  
  // 处理成功结果
  return Response.json(result);
  
} catch (error) {
  console.error('RPC 调用异常:', error);
  return Response.json({ error: 'Internal server error' }, { status: 500 });
}
```

## 性能对比

| 方法 | 延迟 | 类型安全 | 错误处理 | 代码复杂度 |
|------|------|----------|----------|------------|
| HTTP | ~5-10ms | 无 | JSON 响应解析 | 高 |
| RPC | ~0-1ms | 完整 | 原生 TypeScript | 低 |

## 最佳实践

### 1. 类型安全
```typescript
// ✅ 推荐：使用 RPC 获得完整类型检查
const result: SeparationResult = await env.SEPARATE_SERVICE.separateVideo(data);

// ❌ 避免：HTTP 调用需要手动类型断言
const response = await fetch('/separate', { ... });
const result = await response.json() as SeparationResult;
```

### 2. 错误处理
```typescript
// ✅ 推荐：结构化错误处理
const result = await env.SEPARATE_SERVICE.separateVideo(data);
if (!result.success) {
  throw new Error(result.error);
}

// ❌ 避免：HTTP 状态码检查
if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}
```

### 3. 性能优化
```typescript
// ✅ 推荐：并行 RPC 调用
const [status1, status2, status3] = await Promise.all([
  env.SEPARATE_SERVICE.getTranscriptionStatus(taskId1),
  env.SEPARATE_SERVICE.getTranscriptionStatus(taskId2),
  env.SEPARATE_SERVICE.getTranscriptionStatus(taskId3)
]);

// ❌ 避免：串行调用
const status1 = await env.SEPARATE_SERVICE.getTranscriptionStatus(taskId1);
const status2 = await env.SEPARATE_SERVICE.getTranscriptionStatus(taskId2);
const status3 = await env.SEPARATE_SERVICE.getTranscriptionStatus(taskId3);
```

## 迁移指南

### 从 HTTP 迁移到 RPC

**旧方式 (HTTP):**
```typescript
const response = await fetch('https://separate-worker.example.com/separate', {
  method: 'POST',
  body: formData
});
const result = await response.json();
```

**新方式 (RPC):**
```typescript
const result = await env.SEPARATE_SERVICE.separateVideo(videoData, filename, options);
```

### 保持 HTTP 兼容性

如果需要同时支持 HTTP 和 RPC，可以：

```typescript
// 检测调用方式
if (typeof env.SEPARATE_SERVICE?.separateVideo === 'function') {
  // 使用 RPC
  return await env.SEPARATE_SERVICE.separateVideo(data);
} else {
  // 降级到 HTTP
  return await fetch('/separate', { method: 'POST', body: formData });
}
```

## 总结

RPC 接口提供了更高效、类型安全的 Worker 间通信方式，特别适合：

- 微服务架构中的内部 API 调用
- 需要高性能的批量操作
- 复杂的数据处理流水线
- 对类型安全要求较高的场景

对于公开 API 和前端调用，仍然保留 HTTP 接口作为标准入口。