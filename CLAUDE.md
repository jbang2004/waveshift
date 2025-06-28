# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个媒体处理工具集，包含两个主要组件：

1. **gemini-transcribe-worker**: 基于 Gemini API 的音频转录和翻译服务，运行在 Cloudflare Workers 上
2. **seprate_worker**: 音视频分离工具 Wifski，使用 Cloudflare Workers + Rust 容器架构

## 开发命令

### Gemini 转录服务 (gemini-transcribe-worker)
```bash
cd gemini-transcribe-worker

# 本地开发
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 构建和部署
npm run build            # TypeScript 编译
npm run deploy           # 部署到 Cloudflare Workers

# 配置 API 密钥
wrangler secret put GEMINI_API_KEY
```

### 音视频分离服务 (seprate_worker)
```bash
cd seprate_worker

# 全栈开发 (需要两个终端)
# 终端1: 构建并运行后端容器
docker build -t wifski-container .
docker run -p 8080:8080 wifski-container

# 终端2: 运行 Cloudflare Worker (代理到本地容器)
npm run dev              # 启动开发服务器 (http://localhost:8787)

# 部署
npm run deploy           # 构建容器、推送到注册表、部署 Worker
npm run cf-typegen       # 从 wrangler.jsonc 生成 TypeScript 类型

# 容器后端开发 (在 wifski-container/ 目录)
cargo build --release    # 构建 Rust 二进制文件
cargo run --release      # 本地运行 Rust 服务器
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

## 部署前检查

### Gemini 转录服务
- [ ] 设置 `GEMINI_API_KEY` secret
- [ ] 配置 `MAX_CONCURRENT_REQUESTS` (基于 API 计划)
- [ ] 如需处理大文件，考虑升级到付费计划并配置 `cpu_ms`

### Wifski
- [ ] 配置所有 R2 环境变量
- [ ] 确保 Dockerfile 构建成功
- [ ] 验证容器注册表访问权限
- [ ] 测试本地开发环境 (容器 + Worker)