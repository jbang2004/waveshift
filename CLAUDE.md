# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个媒体处理平台，包含五个主要组件：

1. **waveshift-frontend**: Next.js 前端应用，提供用户界面和媒体处理工作流
2. **waveshift-workflow**: 工作流编排服务，协调各个处理步骤
3. **waveshift-ffmpeg-worker**: 音视频分离服务，使用 Cloudflare Workers + Cloudflare Containers + Rust + FFMPEG
4. **waveshift-transcribe-worker**: 基于 Gemini API 的音频转录和翻译服务
5. **waveshift-audio-segment-worker**: 音频切分服务，基于转录时间轴智能分割音频片段 (新增)

## 开发命令

### 根目录统一命令
```bash
# 🚀 推荐部署方式
npm run deploy:smart     # 智能部署 - 只部署有更改的服务
npm run deploy:docker    # GitHub Actions Docker 部署 - 适用于容器服务

# 其他部署选项  
npm run deploy:all       # 完整部署 - 部署所有服务

# 开发模式
npm run dev:all          # 启动所有服务开发模式
npm run dev:frontend     # 只启动前端
npm run dev:workflow     # 只启动工作流服务
npm run dev:ffmpeg       # 只启动FFmpeg服务
npm run dev:transcribe   # 只启动转录服务
npm run dev:audio        # 只启动音频切分服务
```

### 前端应用 (waveshift-frontend)
```bash
cd waveshift-frontend

# 本地开发
npm run dev              # 启动开发服务器 (http://localhost:3001)

# 构建和部署 - 重要：使用正确的OpenNext构建流程
npm run deploy           # 执行 opennextjs-cloudflare build && opennextjs-cloudflare deploy

# 数据库管理
npm run db:generate      # 生成数据库迁移
npm run db:migrate       # 应用数据库迁移
npm run db:studio        # 打开数据库管理界面

# 类型检查和代码质量
npm run type-check       # TypeScript 类型检查
npm run lint             # ESLint 代码检查
```

### 工作流服务 (waveshift-workflow)
```bash
cd waveshift-workflow

# 本地开发
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 构建和部署
npm run build            # TypeScript 编译
npm run deploy           # 部署到 Cloudflare Workers
```

### 音视频处理服务 (waveshift-ffmpeg-worker) ⚠️ 需要 Docker
```bash
cd waveshift-ffmpeg-worker

# 本地开发 (需要 Docker)
# 终端1: 构建并运行容器
docker build -t ffmpeg-container .
docker run -p 8080:8080 ffmpeg-container

# 终端2: 运行 Cloudflare Worker
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 🚀 推荐部署方式：使用 GitHub Actions Container 部署
# 从根目录运行：
npm run deploy:docker    # 触发 GitHub Actions Container 部署 (使用本地 Dockerfile)

# 本地部署 (需要本地 Docker 环境)
npm run deploy           # 构建容器并部署 Worker
```

### AI 转录服务 (waveshift-transcribe-worker)
```bash
cd waveshift-transcribe-worker

# 本地开发
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 构建和部署
npm run build            # TypeScript 编译
npm run deploy           # 部署到 Cloudflare Workers

# 配置 API 密钥
wrangler secret put GEMINI_API_KEY
```

### 音频切分服务 (waveshift-audio-segment-worker) ⚠️ 新增
```bash
cd waveshift-audio-segment-worker

# 本地开发 (需要 Docker)
# 终端1: 构建并运行容器
docker build -t audio-segment-container .
docker run -p 8080:8080 audio-segment-container

# 终端2: 运行 Cloudflare Worker
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 🚀 推荐部署方式：使用 GitHub Actions Container 部署
# 从根目录运行：
npm run deploy:audio     # 部署音频切分服务

# 本地部署 (需要本地 Docker 环境)
npm run deploy           # 构建容器并部署 Worker

# 配置环境变量
# GAP_DURATION_MS=500            # 句子间gap静音时长
# MAX_DURATION_MS=12000          # 最大片段时长（包含gap）
# MIN_DURATION_MS=1000           # 最小保留时长
# GAP_THRESHOLD_MULTIPLIER=3     # 间隔检测倍数
```

## 架构说明

### 音频切分服务架构 ⭐ **新增功能**
- **技术栈**: TypeScript Worker + Rust 容器 + FFMPEG + Cloudflare R2
- **核心功能**: 基于转录时间轴智能分割音频片段，生成独立的音频文件
- **流式处理**: 实时处理转录数据，避免重复查询数据库
- **智能合并**: 根据说话人、时间间隔、片段长度自动合并短句
- **参数化配置**: 通过环境变量灵活控制切分策略
- **请求流程**:
  1. Workflow 提供音频文件和转录数据
  2. Worker 通过 Durable Object 转发请求到 Rust 容器  
  3. 容器基于时间轴使用 FFMPEG 切分音频
  4. 切分后的文件上传到 R2 存储
  5. 返回切分结果和文件 URL 映射
- **切分策略**:
  - **Gap静音填充**: 在句子间隙填充静音，确保播放连贯性
  - **最大时长限制**: 防止单个片段过长影响播放体验  
  - **最小时长过滤**: 过滤掉过短的孤立片段，保留连续对话
  - **说话人连续性**: 相同说话人的连续语句智能合并

### Gemini 转录服务架构
- **技术栈**: TypeScript + Cloudflare Workers + Google Gemini API
- **核心功能**: 音频/视频文件转录和多语言翻译
- **流式处理**: 支持长时间音频处理，避免超时问题
- **文件格式**: 支持 MP3, WAV, M4A, FLAC, AAC, OGG, WebM, MP4, MOV
- **API 端点**:
  - `POST /transcribe`: 转录音频/视频文件
  - `GET /health`: 健康检查
  - `GET /`: API 文档

### Wifski 音视频分离架构
- **技术栈**: TypeScript Worker + Rust 容器 + FFMPEG + Cloudflare R2
- **请求流程**:
  1. 用户上传视频到 `/` (Worker 提供 `public/index.html`)
  2. 前端 POST 到 `/separate` 端点
  3. Worker 通过 Durable Object 转发请求到 Rust 容器
  4. 容器使用 FFMPEG 分离音视频
  5. 处理后的文件上传到 R2 存储
  6. 返回 R2 URL 供前端播放和下载

### 关键组件
- **waveshift-audio-segment-worker/src/index.ts**: 音频切分服务 Worker 入口点 (新增)
- **waveshift-audio-segment-worker/container/src/main.rs**: Rust 音频切分服务器 (新增)
- **waveshift-transcribe-worker/src/index.ts**: 转录服务 Worker 入口点
- **waveshift-transcribe-worker/src/gemini-client.ts**: Gemini API 客户端，支持流式响应
- **waveshift-ffmpeg-worker/src/index.ts**: FFmpeg Worker 入口点，处理路由和容器管理
- **waveshift-ffmpeg-worker/container/src/main.rs**: Rust 服务器，执行 FFMPEG 命令
- **waveshift-workflow/src/utils/transcription-merger.ts**: 转录片段实时合并和标记逻辑
- **waveshift-workflow/src/utils/database.ts**: 数据库操作，包含 is_first/is_last 标记函数
- **waveshift-workflow/src/sep-trans.ts**: 主工作流，协调音视频分离、转录、音频切分的完整流程

## 技术细节

### Gemini 转录服务
- **流式响应**: 使用 `generateContentStream()` 替代 `generateContent()` 避免超时
- **CPU 时间限制**: 免费计划 10ms，付费计划可配置到 5 分钟 (300,000ms)
- **文件大小限制**: 最大 100MB
- **并发控制**: 通过 `MAX_CONCURRENT_REQUESTS` 环境变量配置
- **支持的翻译**: 中英文转录和翻译，支持普通和古典翻译风格

### 转录片段标记系统 ⭐ **新增功能**
- **实时合并**: 根据说话人、时间间隔、片段长度智能合并转录片段
- **开始标记**: `is_first=1` 标记音频的第一个有效语音片段
- **结束标记**: `is_last=1` 使用延迟更新策略确保准确标记最后一个片段
- **标记逻辑**: 
  1. 存储阶段：所有片段 `is_last=0`
  2. 完成阶段：SQL查询最大序号并更新 `is_last=1`
  3. 确保每个转录只有一个开始和一个结束片段
- **应用场景**: 视频预览、摘要生成、循环播放、分段导出

### Wifski 音视频分离
- **FFMPEG 命令**:
  - 无声视频: `ffmpeg -i input.mp4 -an -c:v copy silent_video.mp4`
  - 音频提取: `ffmpeg -i input.mp4 -vn -c:a copy audio.aac`
- **处理选项**: 支持按时间裁剪 (start_time/end_time)
- **输出格式**: MP4 (无声视频) 和 MP3 (音频)
- **容器管理**: 5分钟不活动后自动休眠，最多 3 个容器实例

### R2 存储集成
- **文件结构**: `videos/{uuid}-silent.mp4` 和 `audio/{uuid}-audio.aac`
- **公共访问**: 通过公共 R2 URL 提供文件访问
- **所需环境变量**:
  - `CLOUDFLARE_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET_NAME`
  - `R2_PUBLIC_DOMAIN`

## 性能和限制

### Gemini 转录服务文件大小建议
| 文件大小 | 处理时间 | 成功率 | 计划建议 |
|---------|---------|--------|---------|
| < 1MB | < 10秒 | 99% | 免费/付费计划均支持 |
| 1-5MB | 10-30秒 | 90% | 建议付费计划 |
| 5-10MB | 30-60秒 | 50% | 需要付费计划 |
| > 10MB | > 60秒 | 10% | 建议分段处理 |

### Wifski 处理限制
- **最大上传**: 100MB (前端强制限制)
- **临时文件**: 上传到 R2 后立即清理
- **安全措施**: 文件名清理防止路径注入攻击

## 故障排除

### 前端应用常见问题

1. **500内部服务器错误 (API路由失败)**
   - **症状**: 文件上传失败，返回 `{"error":"Failed to create media task"}`
   - **根本原因**: 通常是OpenNext构建流程错误或数据库表缺失
   - **解决方案**: 
     ```bash
     # 1. 确认使用正确的构建命令
     npm run deploy  # 应该执行 opennextjs-cloudflare build
     
     # 2. 初始化数据库表
     curl -X GET https://your-worker.workers.dev/api/setup
     curl -X POST https://your-worker.workers.dev/api/init-media-tables
     
     # 3. 检查部署是否成功
     ls -la .open-next/  # 应该存在且包含最新代码
     ```
   - **详细排查**: 参见 `frontend/TROUBLESHOOTING.md`

2. **构建失败或代码修改未生效**
   - **原因**: 使用了 `next build` 而非 `opennextjs-cloudflare build`
   - **解决**: 清理缓存并重新构建
     ```bash
     rm -rf .next .open-next
     npm run deploy
     ```

3. **数据库外键约束失败**
   - **错误**: `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`
   - **原因**: 缺少必要的数据库表或用户数据
   - **解决**: 运行数据库初始化脚本

4. **JWT认证失败**
   - **症状**: 有cookie但仍返回401
   - **原因**: JWT_SECRET变更导致现有token失效
   - **解决**: 用户重新登录

### Gemini 转录服务常见错误
1. **`curl: (56) Failure when receiving data from the peer`**
   - 原因: CPU 时间限制或网络超时
   - 解决: 使用更小文件或升级到付费计划

2. **API 密钥错误**
   ```bash
   wrangler secret put GEMINI_API_KEY
   ```

3. **文件格式不支持**
   - 检查 MIME 类型是否在支持列表中

### FFmpeg Worker 容器部署常见问题 🆘

#### ❌ **容器启动崩溃问题** (2025-07 已解决)
- **症状**: 
  ```
  Error checking 8080: The container is not running, consider calling start()
  ❌ FFmpeg Container error: Error: Container crashed while checking for ports, 
  did you setup the entrypoint correctly?
  ```
- **根本原因**:
  1. **镜像选择不当**: `jrottenberg/ffmpeg:7.1-ubuntu2404` Ubuntu镜像过重 (~2GB)
  2. **启动缓慢**: Ubuntu基础镜像在云环境启动时间长
  3. **配置误删**: 错误移除了有效的 `instance_type` 字段

- **✅ 解决方案**:
  ```json
  // 1. 切换到轻量级Alpine镜像
  "containers": [{
    "name": "waveshift-ffmpeg-container", 
    "class_name": "FFmpegContainer",
    "image": "./Dockerfile",
    "instance_type": "standard",  // ✅ 有效字段，不要删除
    "max_instances": 3
  }]
  ```
  
  ```dockerfile
  # 2. 优化Dockerfile使用Alpine FFmpeg
  FROM rust:alpine AS builder
  RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static
  RUN rustup target add x86_64-unknown-linux-musl
  RUN cargo build --release --target x86_64-unknown-linux-musl --locked
  
  FROM alfg/ffmpeg  # ✅ Alpine Linux + FFmpeg (仅106MB)
  RUN apk add --no-cache ca-certificates
  COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/separate-container ./
  ```

- **关键改进效果**:
  - **镜像大小**: ~2GB → ~106MB (减少70%)
  - **启动时间**: ~30秒 → ~2-3秒
  - **稳定性**: Alpine云原生设计，更适合容器环境
  - **编译兼容**: musl静态链接确保Alpine兼容性

#### ❌ **VALIDATE_INPUT 错误** (已解决)
- **症状**: 部署时报错 `Error creating application due to a misconfiguration - VALIDATE_INPUT`
- **根本原因**: 
  1. 使用外部镜像注册表 (如 GHCR)
  2. 配置格式不符合 Cloudflare Container 标准
  3. 使用了不支持的配置字段

- **✅ 解决方案**:
  ```json
  // ❌ 错误配置
  "containers": [{
    "image": "ghcr.io/user/image:latest",  // 外部镜像
    "instance_type": "standard",           // 不支持
    "autoscaling": {...}                   // 不支持
  }]
  
  // ✅ 正确配置  
  "containers": [{
    "name": "waveshift-ffmpeg-container",
    "class_name": "FFmpegContainer",
    "image": "./Dockerfile",               // 本地 Dockerfile
    "max_instances": 3                     // 标准字段
  }]
  ```

- **关键要点**:
  - ✅ 必须使用本地 Dockerfile: `"image": "./Dockerfile"`
  - ✅ Cloudflare 会自动构建和部署容器
  - ✅ 避免外部镜像注册表 (GHCR, Docker Hub 等)
  - ✅ 只使用官方支持的配置字段
  - ✅ 确保 `class_name` 与 Durable Object 类名匹配

#### 🔧 **Container 配置最佳实践**
1. **wrangler.jsonc 标准格式**:
   ```json
   {
     "containers": [{
       "name": "service-container",
       "class_name": "ServiceContainer", 
       "image": "./Dockerfile",
       "max_instances": 3
     }],
     "durable_objects": {
       "bindings": [{
         "name": "CONTAINER_BINDING",
         "class_name": "ServiceContainer"
       }]
     },
     "migrations": [{
       "tag": "v1",
       "new_sqlite_classes": ["ServiceContainer"]
     }]
   }
   ```

2. **Worker 代码结构**:
   ```typescript
   import { Container } from '@cloudflare/containers';
   
   export class ServiceContainer extends Container {
     override defaultPort = 8080;
     override sleepAfter = '5m';
   }
   ```

3. **GitHub Actions 部署**:
   - 移除 Docker 构建步骤
   - 直接使用 `wrangler deploy`
   - Cloudflare 会处理容器构建

### Service Binding 故障排除 🚨 **重要**

#### ❌ **"force-delete" 错误 (2025-07 已解决)**
- **症状**: 
  ```javascript
  {error: 'Failed to process media task', details: 'this worker has been deleted via a force-delete'}
  ```
- **根本原因**:
  1. **Service Binding 缓存失效**: Worker删除/重建后，Service Binding 引用过期
  2. **级联依赖失败**: 一个服务删除导致整个链条的Service Binding失效
  3. **缓存污染**: Cloudflare 边缘缓存保存了已删除Worker的引用

- **✅ 解决方案 - 按序重新部署**:
  ```bash
  # 🔄 必须按依赖顺序重新部署所有相关服务
  
  # 1. 重新部署基础服务
  cd waveshift-audio-segment-worker && npm run deploy
  cd ../waveshift-ffmpeg-worker && npm run deploy
  cd ../waveshift-transcribe-worker && npm run deploy
  
  # 2. 重新部署依赖服务 (刷新Service Binding)
  cd ../waveshift-workflow && npm run deploy
  
  # 3. 重新部署前端 (刷新对workflow的binding)
  cd ../waveshift-frontend && npm run deploy
  ```

- **⚠️ 关键原理**:
  - **Service Binding 机制**: 每个Worker在部署时会缓存其绑定服务的引用
  - **缓存失效**: 当被绑定的服务删除时，缓存引用变为无效
  - **手动刷新**: 只有重新部署依赖方才能刷新Service Binding缓存
  - **边缘一致性**: 需要等待Cloudflare全球边缘节点同步(~30秒)

#### 🔧 **Service Binding 最佳实践**
1. **避免删除Worker**: 
   - ✅ 使用 `wrangler deploy` 更新现有Worker
   - ❌ 避免 `wrangler delete` 后重新创建
   - ✅ 迁移DO时使用新的migration tag而非删除

2. **依赖顺序部署**:
   ```bash
   # 正确的部署顺序 (从底层到顶层)
   audio-segment → ffmpeg → transcribe → workflow → frontend
   ```

3. **故障检测命令**:
   ```bash
   # 检查Service Binding状态
   wrangler tail waveshift-workflow --format pretty
   
   # 查看具体错误信息
   curl -X POST "https://waveshift-frontend.xxx.workers.dev/api/workflow/test/process" \
        -H "Content-Type: application/json" \
        -d '{"targetLanguage":"chinese"}'
   ```

4. **预防措施**:
   - 📋 使用GitHub Actions统一部署，避免手动删除
   - 🔄 定期验证Service Binding连通性
   - 📊 监控Worker间调用的成功率和延迟

### 数据库字段同步问题 🔄

#### ❌ **D1与项目字段名不匹配错误**
- **症状**: 
  ```sql
  Error: no such column: original_text
  Error: no such column: translated_text
  ```
- **根本原因**: D1数据库使用`original`/`translation`，项目代码使用`original_text`/`translated_text`

- **✅ 解决方案 - 统一字段名**:
  ```bash
  # 1. 确认D1实际字段结构
  wrangler d1 execute waveshift-database --command "PRAGMA table_info(transcription_segments);"
  
  # 2. 更新项目代码字段名
  # frontend/db/schema-media.ts
  original: text('original').notNull(),
  translation: text('translation').notNull(),
  
  # 3. 更新所有SQL查询
  # workflow/src/utils/database.ts
  INSERT INTO transcription_segments (..., original, translation, ...)
  ```

- **检查清单**:
  - [ ] `waveshift-frontend/db/schema-media.ts`: Drizzle schema定义
  - [ ] `waveshift-frontend/app/api/setup/route.ts`: 建表SQL语句  
  - [ ] `waveshift-workflow/src/utils/database.ts`: 插入/查询SQL
  - [ ] `waveshift-workflow/src/sep-trans.ts`: 数据处理逻辑

### Durable Object 迁移问题 🔄

#### ❌ **"Cannot apply new-sqlite-class migration" 错误**
- **症状**:
  ```
  Cannot apply new-sqlite-class migration to class 'AudioSegmentContainer' 
  that is already depended on by existing Durable Objects
  ```
- **根本原因**: DO命名空间已存在，无法应用新的SQLite类迁移

- **✅ 解决方案 - 增量迁移**:
  ```json
  // wrangler.jsonc - 使用新的migration tag
  "migrations": [{
    "tag": "v10",  // 递增版本号
    "new_sqlite_classes": ["AudioSegmentContainer"]
  }]
  ```

- **迁移历史跟踪**:
  ```bash
  # 查看当前迁移状态
  wrangler d1 migrations list waveshift-database
  
  # 查看DO命名空间
  wrangler durable-objects namespace list
  ```

### Wifski 常见问题
1. **容器启动失败**
   - 确保 Docker 运行正常
   - 检查端口 8080 是否可用

2. **R2 上传失败**
   - 验证所有 R2 相关环境变量
   - 检查 Cloudflare 账户权限

## 🚀 部署配置指南

### 部署方式优先级

#### **1. GitHub Actions 部署 (推荐)**
```bash
# 🚀 最简单方法：直接推送代码触发自动部署
git add . && git commit -m "部署更新" && git push

# 或手动触发特定工作流
npm run deploy:docker              # FFmpeg Worker (容器服务)
gh workflow run "Deploy All WaveShift Services"  # 所有服务
```

#### **2. 本地智能部署**
```bash
# 只部署有更改的服务
npm run deploy:smart

# 强制部署所有服务
npm run deploy:smart -- --all
```

#### **3. 单独服务部署**
```bash
npm run deploy:frontend     # 前端应用
npm run deploy:workflow     # 工作流服务
npm run deploy:ffmpeg       # FFmpeg Worker (本地部署)
npm run deploy:transcribe   # 转录服务
npm run deploy:audio        # 音频切分服务 (本地部署)

# Container服务推荐使用GitHub Actions部署:
# 手动触发 (推荐):
gh workflow run "Deploy FFmpeg Worker (Alpine Container)"
gh workflow run "Deploy Audio Segment Worker (Container)"
```

### ⚠️ 部署顺序 (必须按序执行)
1. **waveshift-audio-segment-worker** - 音频切分服务 (新增)
2. **waveshift-ffmpeg-worker** - 音视频分离服务  
3. **waveshift-transcribe-worker** - AI转录服务
4. **waveshift-workflow** - 工作流编排服务 (依赖上述三个服务)
5. **waveshift-frontend** - 前端应用 (依赖工作流服务)

**🔄 Service Binding 依赖关系**:
```
audio-segment ←── workflow ←── frontend
ffmpeg        ←──     ↑
transcribe    ←──     ↑
```

**重要**: 如果任一基础服务(1-3)被删除/重建，必须按序重新部署所有依赖服务以刷新Service Binding缓存。

### 环境变量配置
确保设置以下环境变量或GitHub Secrets：
```bash
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
GEMINI_API_KEY=your-gemini-key
```

### R2 存储配置

#### **CORS 策略配置** (必需 - 支持预签名URL)
在 Cloudflare Dashboard → R2 → waveshift-media → Settings → CORS policy：
```json
[{
  "AllowedHeaders": [
    "content-type", "content-length", "authorization",
    "x-amz-date", "x-amz-content-sha256"
  ],
  "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
  "AllowedOrigins": [
    "https://waveshift-frontend.jbang20042004.workers.dev",
    "http://localhost:3001",
    "http://localhost:3000"
  ],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}]
```

#### **公共访问配置**
1. **启用R2 Public Bucket**：
   - Cloudflare Dashboard → R2 → waveshift-media → Settings → Public access → Allow Access
   - 记录公共URL: `https://pub-waveshift-media.r2.dev`

2. **更新环境变量**：
   ```bash
   # 在 wrangler.jsonc 中配置
   "R2_PUBLIC_DOMAIN": "pub-waveshift-media.r2.dev"
   ```

#### **CORS 常见错误解决**
- **"No 'Access-Control-Allow-Origin' header"**: 检查 AllowedOrigins 配置
- **"Request header content-type is not allowed"**: 确保 AllowedHeaders 包含 "content-type"
- **403 Forbidden**: 等待CORS规则生效(30秒)或检查预签名URL

### 部署验证
```bash
# 检查工作流状态
gh run list --limit 5

# 测试服务健康状态
curl https://waveshift-ffmpeg-worker.你的账户.workers.dev/health

# 测试R2访问
curl -I https://pub-waveshift-media.r2.dev/test-file.txt
```

### 🚀 GitHub Actions Container 部署 (推荐)
适用于 **所有Container服务**：waveshift-ffmpeg-worker, waveshift-audio-segment-worker

#### **🎯 手动触发部署** (推荐方式)
```bash
# 手动触发FFmpeg Container部署
gh workflow run "Deploy FFmpeg Worker (Alpine Container)" --field force_rebuild=false

# 手动触发Audio Segment Container部署  
gh workflow run "Deploy Audio Segment Worker (Container)" --field force_rebuild=false

# 强制重建镜像
gh workflow run "Deploy FFmpeg Worker (Alpine Container)" --field force_rebuild=true
gh workflow run "Deploy Audio Segment Worker (Container)" --field force_rebuild=true
```

#### **🔄 自动触发部署**
```bash
# 修改相关文件后git push会自动触发
git add waveshift-ffmpeg-worker/
git commit -m "更新FFmpeg Container"
git push  # 自动触发FFmpeg部署

git add waveshift-audio-segment-worker/
git commit -m "更新Audio Segment Container" 
git push  # 自动触发Audio Segment部署
```

**优势**：
- ✅ ~~自动 Docker 构建和缓存~~ → **Cloudflare 自动构建容器**
- ✅ ~~使用 GitHub 容器注册表~~ → **使用本地 Dockerfile**  
- ✅ 构建时测试和验证
- ✅ 支持强制重建选项
- ✅ 无需本地 Docker 环境
- ✅ **简化的部署流程** - 直接 `wrangler deploy`

**GitHub Actions 工作流**：
- `deploy-ffmpeg-docker.yml`: FFmpeg Worker Container 部署 (Rust + Alpine)
- `deploy-audio-segment.yml`: Audio Segment Worker Container 部署 (Python + FastAPI)
- 两者都支持手动触发和自动触发，配置完全一致

**⚠️ 重要变更 (2025-07)**：
- 不再构建和推送到外部镜像注册表
- Cloudflare 直接使用项目中的 Dockerfile 构建容器
- ✅ `instance_type` **是有效字段** (`dev`/`basic`/`standard`)
- 推荐使用 **Alpine Linux 镜像** 而非 Ubuntu (启动更快，体积更小)

**🔍 容器故障排查流程**：
```bash
# 1. 检查容器日志
wrangler tail waveshift-ffmpeg-worker --format pretty
wrangler tail waveshift-audio-segment-worker --format pretty

# 2. 手动触发GitHub Actions部署
gh workflow run "Deploy FFmpeg Worker (Alpine Container)" --field force_rebuild=true
gh workflow run "Deploy Audio Segment Worker (Container)" --field force_rebuild=true

# 3. 监控部署进度
gh run watch $(gh run list --workflow="Deploy FFmpeg Worker (Alpine Container)" --limit=1 --json id -q '.[0].id')
gh run watch $(gh run list --workflow="Deploy Audio Segment Worker (Container)" --limit=1 --json id -q '.[0].id')

# 4. 验证容器配置
cd waveshift-ffmpeg-worker && grep -A 5 "containers" wrangler.jsonc && grep "FROM" Dockerfile
cd waveshift-audio-segment-worker && grep -A 5 "containers" wrangler.jsonc && grep "FROM" Dockerfile

# 5. 健康检查
curl https://waveshift-ffmpeg-worker.jbang20042004.workers.dev/health || echo "FFmpeg无健康检查端点"
curl https://waveshift-audio-segment-worker.jbang20042004.workers.dev/health
```

### 🔧 本地部署
适用于快速开发和测试：

```bash
# 智能部署 (推荐)
npm run deploy:smart

# 完整部署
npm run deploy:all
```

**限制**：
- ⚠️ 需要本地 Docker 环境
- ⚠️ 构建时间较长
- ⚠️ 无自动缓存优化

### 📋 部署前检查

#### 全局要求
- [ ] 设置 `CLOUDFLARE_API_TOKEN` 环境变量或 GitHub Secret
- [ ] 设置 `CLOUDFLARE_ACCOUNT_ID` 环境变量或 GitHub Secret
- [ ] 确保 GitHub CLI (`gh`) 已安装和登录 (用于 Docker 部署)

#### waveshift-frontend
- [ ] 配置数据库连接 (D1)
- [ ] 设置 JWT_SECRET
- [ ] 验证 Service Binding 配置

#### waveshift-workflow  
- [ ] 配置 Service Binding 到 FFmpeg Worker
- [ ] 配置 Service Binding 到 Transcribe Worker
- [ ] 设置 R2 存储权限

#### waveshift-ffmpeg-worker (Container 部署) ⚠️ 重要
- [ ] ✅ **使用本地 Dockerfile** - 必须设置 `"image": "./Dockerfile"`
- [ ] ✅ **推荐Alpine镜像** - 使用 `alfg/ffmpeg` 而非 `jrottenberg/ffmpeg:ubuntu`
- [ ] ✅ **保留 instance_type** - 有效字段：`"instance_type": "standard"`
- [ ] ✅ **musl静态链接** - Rust编译使用 `x86_64-unknown-linux-musl` target
- [ ] 配置 R2 存储绑定
- [ ] 验证容器健康检查端点 
- [ ] 测试 FFMPEG 功能

**🎯 推荐配置 (2025-07)**：
```json
// wrangler.jsonc
"containers": [{
  "name": "waveshift-ffmpeg-container",
  "class_name": "FFmpegContainer", 
  "image": "./Dockerfile",
  "instance_type": "standard",  // ✅ 4GB RAM
  "max_instances": 3
}]
```

```dockerfile
// Dockerfile - Alpine优化版本
FROM rust:alpine AS builder
RUN apk add --no-cache musl-dev pkgconfig openssl-dev openssl-libs-static
RUN rustup target add x86_64-unknown-linux-musl
RUN cargo build --release --target x86_64-unknown-linux-musl --locked

FROM alfg/ffmpeg  # 仅106MB, 启动快
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/target/x86_64-unknown-linux-musl/release/separate-container ./
CMD ["./separate-container"]
```

#### waveshift-audio-segment-worker (新增服务) ⚠️ 重要
- [ ] ✅ **DO迁移配置** - 使用递增的migration tag (v10, v11...)
- [ ] ✅ **Container绑定** - 确保Container和DO class_name匹配
- [ ] ✅ **环境变量配置** - 音频切分参数 (GAP_DURATION_MS, MAX_DURATION_MS等)
- [ ] ✅ **R2存储绑定** - 音频片段输出存储
- [ ] 避免删除DO，使用新migration tag处理冲突

**🎯 推荐配置 (audio-segment)**：
```json
// wrangler.jsonc
{
  "containers": [{
    "name": "waveshift-audio-segment-container",
    "class_name": "AudioSegmentContainer",
    "image": "./Dockerfile",
    "instance_type": "standard",
    "max_instances": 3
  }],
  "durable_objects": {
    "bindings": [{
      "name": "AUDIO_SEGMENT_CONTAINER",
      "class_name": "AudioSegmentContainer"
    }]
  },
  "migrations": [{
    "tag": "v10",  // 根据实际情况递增
    "new_sqlite_classes": ["AudioSegmentContainer"]
  }]
}
```

#### waveshift-transcribe-worker
- [ ] 设置 `GEMINI_API_KEY` secret
- [ ] 配置 `MAX_CONCURRENT_REQUESTS` (基于 API 计划)
- [ ] 如需处理大文件，考虑升级到付费计划并配置 `cpu_ms`

## 🔗 有用链接

- **GitHub Actions**: [查看工作流状态](https://github.com/your-org/waveshift/actions)
- **容器注册表**: [管理容器镜像](https://github.com/your-org/waveshift/pkgs/container/waveshift-ffmpeg-container)
- **Cloudflare Dashboard**: [管理 Workers 和 R2](https://dash.cloudflare.com)