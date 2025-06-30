
### 服务集成模式

官方推荐的集成模式强调**服务绑定（Service Bindings）优先**，这种方式实现了零延迟的 Worker 间通信，支持类型安全的 RPC 调用，且无需经过公网。对于异步处理，推荐使用基于队列的通信模式，确保消息的可靠传递和服务解耦。

### 环境变量与绑定管理

Cloudflare 推荐通过声明式配置管理所有服务绑定：

```toml
# 完整的服务绑定配置
[[d1_databases]]
binding = "DB"
database_name = "video-metadata"
database_id = "your-database-id"

[[r2_buckets]]
binding = "STORAGE"
bucket_name = "video-uploads"

[[workflows]]
binding = "VIDEO_PROCESSING"
name = "video-processing-workflow"
class_name = "VideoProcessingWorkflow"

[[queues.consumers]]
queue = "video-events"

[vars]
CLOUDFLARE_ACCOUNT_ID = "your-account-id"
STREAM_CUSTOMER_CODE = "your-stream-customer-code"
```

### D1 任务管理模式

D1 数据库采用专门设计的模式来管理视频处理任务：

```sql
-- 核心表结构
CREATE TABLE video_processing_tasks (
  id TEXT PRIMARY KEY,
  video_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  workflow_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT, -- JSON 元数据
  error_message TEXT,
  retry_count INTEGER DEFAULT 0
);

-- 性能优化索引
CREATE INDEX idx_tasks_status ON video_processing_tasks(status);
CREATE INDEX idx_tasks_created ON video_processing_tasks(created_at);
```

### Workflows 编排策略

Cloudflare Workflows 提供持久化执行能力，每个步骤支持独立配置：

```javascript
export class VideoProcessingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    // 带自定义重试配置的步骤
    const result = await step.do("process-video", {
      retries: {
        limit: 3,
        delay: "30s",
        backoff: "exponential"
      }
    }, async () => {
      return await this.processVideo();
    });
  }
}
```

## 视频上传、存储、处理的完整流程

### 上传流程优化

视频上传采用智能分片策略：

```javascript
class VideoUploader {
  constructor(workerEndpoint) {
    this.workerEndpoint = workerEndpoint;
    this.chunkSize = 50 * 1024 * 1024; // 50MB 分片
  }

  async uploadVideo(file) {
    if (file.size <= this.chunkSize) {
      return this.simpleUpload(file);
    } else {
      return this.multipartUpload(file);
    }
  }
}
```

### 存储架构设计

R2 存储桶配置支持多种访问模式：
- **公共桶**：已知路径的只读访问（GET/HEAD）
- **预签名 URL**：临时的操作特定访问（GET、PUT、DELETE、POST）
- **Access 集成**：组织级访问控制
- **CORS 配置**：严格的跨域请求策略


### JWT 认证模式

推荐的 JWT 验证流程：

```javascript
export default {
  async fetch(request, env, ctx) {
    // 验证 Cloudflare Access JWT
    const jwt = request.headers.get('CF-Access-JWT-Assertion');
    
    if (!jwt) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    // 验证 JWT 签名和声明
    const isValid = await verifyAccessJWT(jwt, env);
    
    if (!isValid) {
      return new Response('Invalid token', { status: 403 });
    }
    
    // 继续处理请求
    return handleAuthenticatedRequest(request, env);
  }
}
```

### 预签名 URL 安全策略

预签名 URL 的安全实践：
- **过期时间**：通常设置 1 小时，平衡安全性和用户体验
- **操作限制**：明确指定允许的 HTTP 方法
- **内容验证**：在 URL 中包含内容类型和大小限制
- **IP 限制**：可选的客户端 IP 验证

### 速率限制与 DDoS 防护

多层防御配置建议：
- **登录端点**：每 IP 每小时 3-5 次尝试
- **API 端点**：基于用户 ID 或会话令牌的限制
- **上传端点**：基于文件大小和频率的限制
- **地理限制**：根据业务需求限制特定地区访问

## 性能优化与扩展性

### Workers 性能优化策略

**性能优化的核心指标是将平均 CPU 时间控制在 30ms 以下**：

- **Isolates 架构优势**：比 Node.js 容器快 100 倍启动，少 10 倍内存使用
- **并发连接**：每个 Worker 调用最多 6 个同时连接
- **流式响应**：减少内存使用和持续时间计费
- **Service Bindings**：零额外成本的 Worker 间通信

### 缓存层次化设计

三层缓存架构优化性能：

1. **Cache API**（边缘层）
   - HTTP 响应缓存
   - 自定义缓存键
   - 区域性分布

2. **Workers KV**（全局层）
   - 3 倍更快的热读取
   - 最终一致性（~60 秒全球传播）
   - 区域缓存优化

3. **微缓存策略**（动态内容）
   - 小于 60 秒的短期缓存
   - 平衡新鲜度和性能

### D1 数据库优化

D1 性能提升数据（2024-2025）：
- **复杂查询**：速度提升 20 倍
- **批量写入**：1000 行批处理提升 6.8 倍
- **对比优势**：比无服务器 Postgres 快 3.2 倍

优化技术：
```sql
-- 高效索引策略
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_customer_date 
  ON orders(customer_id, created_date);

-- 定期优化
PRAGMA optimize;
```

## 完整的代码示例

### Worker 预签名 URL 生成

```javascript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function onRequestPost(context) {
  const { request, env } = context;
  const { filename, contentType } = await request.json();

  const R2 = new S3Client({
    region: 'auto',
    endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  const key = `uploads/${crypto.randomUUID()}-${filename}`;
  
  const command = new PutObjectCommand({
    Bucket: env.STORAGE.name,
    Key: key,
    ContentType: contentType,
  });

  const presignedUrl = await getSignedUrl(R2, command, { expiresIn: 3600 });

  return new Response(JSON.stringify({
    uploadUrl: presignedUrl,
    key: key,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 视频处理 Workflow

```javascript
export class VideoProcessingWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { videoId, r2Key } = event.payload;

    // 步骤 1：验证视频
    const videoData = await step.do('validate-video', async () => {
      const video = await this.env.DB.prepare(
        'SELECT * FROM videos WHERE id = ?'
      ).bind(videoId).first();
      
      if (!video) {
        throw new Error(`Video ${videoId} not found`);
      }
      
      return video;
    });

    // 步骤 2：生成缩略图
    const thumbnails = await step.do('generate-thumbnails', async () => {
      return await this.generateThumbnails(r2Key);
    });

    // 步骤 3：更新数据库
    await step.do('update-database', async () => {
      await this.env.DB.prepare(`
        UPDATE videos 
        SET status = 'ready', thumbnail_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(thumbnails[0], videoId).run();
    });

    return { videoId, status: 'completed' };
  }
}
```

### React 视频上传组件

```jsx
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

export default function VideoUpload() {
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');

  const onDrop = useCallback(async (acceptedFiles) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploadStatus('uploading');

    try {
      // 获取预签名 URL
      const { uploadUrl, key } = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      }).then(res => res.json());

      // 直接上传到 R2
      await fetch(uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      setUploadStatus('success');
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv'] },
    maxSize: 5 * 1024 * 1024 * 1024, // 5GB
  });

  return (
    <div className="upload-container">
      <div {...getRootProps()} className="dropzone">
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>拖放视频到这里...</p>
        ) : (
          <p>拖放视频或点击选择文件</p>
        )}
      </div>
      
      {uploadStatus === 'success' && (
        <div className="success-message">上传成功！</div>
      )}
    </div>
  );
}
```

通过遵循这些官方推荐的架构模式和最佳实践，可以在 Cloudflare 平台上构建高性能、可扩展且成本效益的全栈视频应用。平台的持续演进，特别是 `@opennextjs/cloudflare` 的引入和各项服务的性能提升，为开发者提供了更强大和灵活的构建能力。