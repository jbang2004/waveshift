# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个媒体处理平台，包含四个主要组件：

1. **waveshift-frontend**: Next.js 前端应用，提供用户界面和媒体处理工作流
2. **waveshift-workflow**: 工作流编排服务，协调各个处理步骤
3. **waveshift-ffmpeg-worker**: 音视频分离服务，使用 Cloudflare Workers + Rust 容器 + FFMPEG
4. **waveshift-transcribe-worker**: 基于 Gemini API 的音频转录和翻译服务

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

# 🚀 推荐部署方式：使用 GitHub Actions
# 从根目录运行：
npm run deploy:docker    # 触发 GitHub Actions Docker 部署

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

## 架构说明

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
- **gemini-transcribe-worker/src/index.ts**: 转录服务 Worker 入口点
- **gemini-transcribe-worker/src/gemini-client.ts**: Gemini API 客户端，支持流式响应
- **seprate_worker/src/index.ts**: Wifski Worker 入口点，处理路由和容器管理
- **seprate_worker/wifski-container/src/main.rs**: Rust 服务器，执行 FFMPEG 命令

## 技术细节

### Gemini 转录服务
- **流式响应**: 使用 `generateContentStream()` 替代 `generateContent()` 避免超时
- **CPU 时间限制**: 免费计划 10ms，付费计划可配置到 5 分钟 (300,000ms)
- **文件大小限制**: 最大 100MB
- **并发控制**: 通过 `MAX_CONCURRENT_REQUESTS` 环境变量配置
- **支持的翻译**: 中英文转录和翻译，支持普通和古典翻译风格

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

### Wifski 常见问题
1. **容器启动失败**
   - 确保 Docker 运行正常
   - 检查端口 8080 是否可用

2. **R2 上传失败**
   - 验证所有 R2 相关环境变量
   - 检查 Cloudflare 账户权限

## 部署方式说明

### 🚀 GitHub Actions Docker 部署 (推荐)
适用于 **waveshift-ffmpeg-worker** 等需要容器的服务：

```bash
# 从根目录运行
npm run deploy:docker
```

**优势**：
- ✅ 自动 Docker 构建和缓存
- ✅ 使用 GitHub 容器注册表
- ✅ 构建时测试和验证
- ✅ 支持强制重建选项
- ✅ 无需本地 Docker 环境

**GitHub Actions 工作流**：
- `deploy-ffmpeg-docker.yml`: 专门用于 FFmpeg Worker 的完整 Docker 部署
- `deploy-services.yml`: 通用服务部署，包含基本 Docker 支持

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

#### waveshift-ffmpeg-worker (Docker 部署)
- [ ] 确保 GitHub 容器注册表权限
- [ ] 配置 R2 存储绑定
- [ ] 验证容器健康检查端点
- [ ] 测试 FFMPEG 功能

#### waveshift-transcribe-worker
- [ ] 设置 `GEMINI_API_KEY` secret
- [ ] 配置 `MAX_CONCURRENT_REQUESTS` (基于 API 计划)
- [ ] 如需处理大文件，考虑升级到付费计划并配置 `cpu_ms`

## 🔗 有用链接

- **GitHub Actions**: [查看工作流状态](https://github.com/your-org/waveshift/actions)
- **容器注册表**: [管理容器镜像](https://github.com/your-org/waveshift/pkgs/container/waveshift-ffmpeg-container)
- **Cloudflare Dashboard**: [管理 Workers 和 R2](https://dash.cloudflare.com)