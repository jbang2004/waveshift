# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

这是一个完整的媒体处理平台，包含六个主要组件：

1. **waveshift-frontend**: Next.js 前端应用，提供用户界面和媒体处理工作流
2. **waveshift-workflow**: 工作流编排服务，协调各个处理步骤
3. **waveshift-ffmpeg-worker**: 音视频分离服务，使用 Cloudflare Workers + Containers + Rust + FFMPEG
4. **waveshift-transcribe-worker**: 基于 Gemini API 的音频转录和翻译服务
5. **waveshift-audio-segment-worker**: 音频切分服务，基于转录时间轴智能分割音频片段
6. **zipenhancer-standalone**: GPU加速音频降噪服务，支持本地Docker和阿里云FC部署

## 开发命令

### 根目录统一命令
```bash
# 🚀 推荐部署方式
npm run deploy:smart     # 智能部署 - 只部署有更改的服务
npm run deploy:docker    # GitHub Actions Docker 部署 - 适用于容器服务
npm run deploy:all       # 完整部署 - 部署所有服务

# 开发模式
npm run dev:all          # 启动所有服务开发模式
npm run dev:frontend     # 只启动前端
npm run dev:workflow     # 只启动工作流服务
npm run dev:ffmpeg       # 只启动FFmpeg服务
npm run dev:transcribe   # 只启动转录服务
npm run dev:audio        # 只启动音频切分服务
```

### 各服务快速命令
```bash
# 前端应用
cd waveshift-frontend && npm run dev && npm run deploy

# 工作流服务  
cd waveshift-workflow && npm run dev && npm run deploy

# AI转录服务
cd waveshift-transcribe-worker && npm run dev && npm run deploy && wrangler secret put GEMINI_API_KEY

# 音视频分离 (Container)
cd waveshift-ffmpeg-worker && npm run dev && npm run deploy

# 音频切分 (Container)
cd waveshift-audio-segment-worker && npm run dev && npm run deploy

# GPU降噪服务
cd zipenhancer-standalone && docker build -t zipenhancer:latest . && ./deploy-to-fc.sh
```

## 项目架构

### 🎯 核心技术栈
- **Frontend**: Next.js + OpenNext + Cloudflare Workers + D1 Database
- **Workflow**: TypeScript + Cloudflare Workers + Service Bindings
- **AI转录**: TypeScript + Cloudflare Workers + Google Gemini API
- **音视频处理**: TypeScript Workers + Rust Containers + FFMPEG + R2 Storage
- **GPU降噪**: Python + ONNX Runtime + PyTorch + 阿里云FC/Docker

### 🔄 服务依赖关系
```
zipenhancer-standalone (独立服务)
    
waveshift-frontend
    ↓ Service Binding
waveshift-workflow
    ↓ Service Bindings
┌─ waveshift-ffmpeg-worker      (音视频分离)
├─ waveshift-transcribe-worker  (AI转录)  
└─ waveshift-audio-segment-worker (音频切分)
```

### 🗂️ 关键组件
- **waveshift-workflow/src/sep-trans.ts**: 主工作流，协调完整处理流程
- **waveshift-audio-segment-worker/container/src/main.rs**: 音频切分核心逻辑
- **zipenhancer-standalone/zipenhancer.py**: GPU降噪核心算法
- **waveshift-frontend/app/api/**: Next.js API路由和数据库操作

## 技术配置

### 环境变量配置
```bash
# 全局必需
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id

# 服务特定
GEMINI_API_KEY=your-gemini-key         # 转录服务
JWT_SECRET=your-jwt-secret             # 前端认证
R2_PUBLIC_DOMAIN=pub-domain.r2.dev     # R2存储
```

### R2存储配置
```json
{
  "AllowedHeaders": ["content-type", "content-length", "authorization", "x-amz-date", "x-amz-content-sha256"],
  "AllowedMethods": ["PUT", "POST", "GET", "HEAD"],
  "AllowedOrigins": ["https://your-frontend.workers.dev", "http://localhost:3001"],
  "ExposeHeaders": ["ETag"],
  "MaxAgeSeconds": 3600
}
```

### 性能参数
| 服务 | 处理能力 | 资源配置 | 并发限制 |
|------|---------|---------|---------|
| Gemini转录 | < 100MB文件 | CPU时间限制 | MAX_CONCURRENT_REQUESTS |
| GPU降噪 | 实时4.5x处理 | Tesla T4 4GB | 单实例 |
| 音频切分 | 流式处理 | 标准容器 | 3实例 |
| 音视频分离| 100MB限制 | Alpine容器 | 3实例 |

## 部署指南

### 🚀 推荐部署方式

#### 1. GitHub Actions自动部署
```bash
# 推送代码自动触发
git add . && git commit -m "部署更新" && git push

# 手动触发特定服务
gh workflow run "Deploy FFmpeg Worker (Alpine Container)" 
gh workflow run "Deploy Audio Segment Worker (Container)"
```

#### 2. 本地智能部署
```bash
npm run deploy:smart                   # 增量部署
npm run deploy:smart -- --all          # 全量部署
```

### 🐳 Docker网络解决方案 ⭐ **新增**

#### zipenhancer-standalone 构建和部署
```bash
# 1. 构建镜像 (解决网络问题)
docker build --network=host \
  --build-arg http_proxy=$http_proxy \
  --build-arg https_proxy=$https_proxy \
  -f Dockerfile.fc -t zipenhancer-gpu:latest .

# 2. 登录ACR (避免代理干扰)
export no_proxy="crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com,*.aliyuncs.com"
echo "13318251863jbang" | docker login --username=aliyun0518007542 --password-stdin \
  crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com

# 3. 推送镜像
docker tag zipenhancer-gpu:latest \
  crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/zipenhancer-gpu:latest
docker push crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/zipenhancer-gpu:latest

# 4. 部署到阿里云FC
s deploy -y
```

#### 通用Docker网络问题解决
```bash
# 构建时网络问题
docker build --network=host \
  --build-arg https_proxy=$https_proxy \
  --build-arg http_proxy=$http_proxy \
  -t your-image .

# 容器注册表访问问题  
export no_proxy="your-registry.com,*.aliyuncs.com"
unset https_proxy http_proxy  # 临时禁用代理
```

### ⚠️ 部署顺序 (Service Binding依赖)
```bash
# 必须按序部署，避免Service Binding失效
1. waveshift-audio-segment-worker
2. waveshift-ffmpeg-worker  
3. waveshift-transcribe-worker
4. waveshift-workflow (依赖上述三个)
5. waveshift-frontend (依赖workflow)
6. zipenhancer-standalone (独立服务)
```

### 🎯 阿里云FC部署配置
- **资源配置**: Tesla T4 GPU, 4GB显存, 8GB内存, 2 vCPU
- **镜像仓库**: ACR新加坡区域
- **访问地址**: https://zipenhancer-gpu.ap-southeast-1.fcapp.run
- **关键优化**: ONNX Runtime + TensorRT加速

## 故障排除

### 🚨 核心问题快速解决

#### Service Binding "force-delete" 错误
```bash
# 症状: {error: 'this worker has been deleted via a force-delete'}
# 解决: 按依赖顺序重新部署所有服务
cd waveshift-audio-segment-worker && npm run deploy
cd ../waveshift-ffmpeg-worker && npm run deploy  
cd ../waveshift-transcribe-worker && npm run deploy
cd ../waveshift-workflow && npm run deploy
cd ../waveshift-frontend && npm run deploy
```

#### 容器启动失败
```bash
# 症状: Container crashed while checking for ports
# 解决: 检查镜像配置，推荐使用Alpine基础镜像
# wrangler.jsonc: "image": "./Dockerfile", "instance_type": "standard"
```

#### ACR登录EOF错误
```bash
# 症状: Get "https://xxx.aliyuncs.com/v2/": EOF  
# 解决: 设置no_proxy环境变量
export no_proxy="*.aliyuncs.com"
docker login crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com
```

#### 前端500错误
```bash
# 症状: {"error":"Failed to create media task"}
# 解决: 检查构建流程和数据库
npm run deploy  # 确保使用opennextjs-cloudflare build
curl -X GET https://your-worker.workers.dev/api/setup
```

#### D1数据库字段不匹配
```bash
# 症状: Error: no such column: original_text
# 解决: 统一字段名 original/translation
wrangler d1 execute waveshift-database --command "PRAGMA table_info(transcription_segments);"
```

### 🔧 快速诊断命令
```bash
# 检查服务状态
wrangler tail your-worker --format pretty
curl https://your-service.workers.dev/health

# 检查GitHub Actions
gh run list --limit 5
gh workflow run "Deploy Service Name"

# 检查容器
docker images | grep your-service
docker logs container-name
```

## 🔗 重要链接

- **Cloudflare Dashboard**: [管理 Workers 和 R2](https://dash.cloudflare.com)
- **GitHub Actions**: 项目仓库 Actions 页面
- **阿里云FC控制台**: [函数计算管理](https://fc3.console.aliyun.com)
- **阿里云ACR控制台**: [容器镜像服务](https://cr.console.aliyun.com)

---

## 📋 开发最佳实践

### 开发流程
1. 本地开发: `npm run dev`
2. 功能测试: 单元测试 + 集成测试
3. 本地构建: `npm run build`
4. 部署测试: `npm run deploy` 到测试环境
5. 生产部署: GitHub Actions 或 `npm run deploy:smart`

### 代码规范
- TypeScript严格模式
- ESLint代码检查: `npm run lint`
- 类型检查: `npm run type-check`
- 错误处理: 统一错误格式和日志

### 监控和日志
- Cloudflare Analytics: 性能监控
- Worker日志: `wrangler tail`
- 阿里云FC日志: 函数计算控制台
- GitHub Actions日志: 部署状态监控