# WaveShift 统一部署指南

## 🎯 Monorepo 架构说明

本项目采用 Monorepo 架构，所有微服务在同一个仓库中，使用统一的 GitHub Actions 进行部署。

```
waveshift/
├── .github/workflows/
│   └── deploy-all.yml          # 🚀 统一部署配置
├── ffmpeg-worker/              # 音视频处理服务
├── waveshift-workflow/         # 主工作流服务
├── gemini-transcribe-worker/   # AI 转录服务
└── deploy-all.sh              # 本地部署脚本
```

## 🚀 部署方式

### 方式1：GitHub Actions 自动部署（推荐）

```bash
# 推送代码触发自动部署
git add .
git commit -m "Deploy WaveShift microservices"
git push origin main

# GitHub Actions 会自动：
# 1. 先部署 ffmpeg-worker（包含容器构建）
# 2. 等待完成后部署 waveshift-workflow
# 3. 确保正确的服务依赖顺序
```

### 方式2：GitHub Actions 手动部署

1. 访问 GitHub 仓库的 Actions 页面
2. 选择 "Deploy All WaveShift Services"
3. 点击 "Run workflow"

### 方式3：本地部署（紧急/开发）

```bash
# 完整部署所有服务
./deploy-all.sh

# 或者分别部署
cd ffmpeg-worker && npm run deploy
cd ../waveshift-workflow && npm run deploy
```

## 🔧 配置要求

### GitHub Secrets

确保在 GitHub 仓库设置中配置以下 Secrets：

```
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

### 环境变量

以下变量已在 wrangler.jsonc 中硬编码：

```
CLOUDFLARE_ACCOUNT_ID=1298fa35ac940c688dc1b6d8f5eead72
R2_BUCKET_NAME=separate-audio-video
R2_PUBLIC_DOMAIN=separate.waveshift.net
```

## 📋 部署流程详解

### 自动部署顺序

1. **deploy-ffmpeg** Job:
   - 安装依赖 (`npm ci`)
   - 生成类型 (`npm run cf-typegen`)
   - TypeScript 检查 (`npx tsc --noEmit`)
   - 构建 Docker 容器 (`docker build`)
   - 部署 FFmpeg Worker

2. **deploy-waveshift** Job:
   - 等待 ffmpeg-worker 部署完成 (`needs: deploy-ffmpeg`)
   - 安装依赖和类型检查
   - 部署 WaveShift Workflow

### 部署验证

部署完成后，可以通过以下方式验证：

```bash
# 检查 FFmpeg Worker
curl https://ffmpeg-worker.your-subdomain.workers.dev

# 检查 WaveShift Workflow
curl https://waveshift-workflow.your-subdomain.workers.dev/api

# 检查前端界面
open https://waveshift-workflow.your-subdomain.workers.dev
```

## ⚠️ 重要注意事项

### 部署顺序

**必须先部署 ffmpeg-worker，再部署 waveshift-workflow**，因为：
- waveshift-workflow 依赖 ffmpeg-worker 的 Service Binding
- 如果顺序错误，会导致 `FFMPEG_SERVICE.separate is not a function` 错误

### 服务依赖关系

```
waveshift-workflow → ffmpeg-worker (Service Binding)
waveshift-workflow → gemini-transcribe-worker (Service Binding)
waveshift-workflow → R2 Storage (shared bucket)
waveshift-workflow → D1 Database
```

### 容器构建

- ffmpeg-worker 包含 Docker 容器，构建时间较长（2-5分钟）
- 确保 GitHub Actions runner 有足够的 Docker 构建资源

## 🐛 故障排除

### 常见问题

1. **Service Binding 错误**
   ```
   Error: FFMPEG_SERVICE.separate is not a function
   ```
   - 解决：确保 ffmpeg-worker 先部署完成

2. **容器构建失败**
   ```
   Error: Docker build failed
   ```
   - 检查 Dockerfile 语法
   - 确保 GitHub Actions 有 Docker 权限

3. **类型错误**
   ```
   Error: Property 'separate' does not exist on type 'Fetcher'
   ```
   - 运行 `npm run cf-typegen`
   - 检查 entrypoint 配置

### 紧急回滚

如果部署出现问题，可以：

```bash
# 回滚到上一个版本
git revert HEAD
git push origin main

# 或者使用本地部署覆盖
./deploy-all.sh
```

## 📊 部署监控

### GitHub Actions 监控

- 访问 GitHub Actions 页面查看部署状态
- 每个步骤都有详细的日志输出
- 失败时会自动停止后续步骤

### Cloudflare Dashboard

- 访问 Cloudflare Workers Dashboard
- 查看每个 Worker 的部署状态和日志
- 监控容器实例和 R2 存储使用情况

## 🎉 完成确认

部署成功后，你应该看到：

1. ✅ FFmpeg Worker 部署成功
2. ✅ WaveShift Workflow 部署成功  
3. ✅ 前端界面可以正常访问
4. ✅ 文件上传和处理功能正常
5. ✅ 音视频分离和转录功能正常

现在你的 WaveShift 微服务平台已经完全部署并运行！🚀