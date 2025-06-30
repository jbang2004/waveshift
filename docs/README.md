# WaveShift 文档中心

## 📚 文档目录

### 快速开始
- [项目概述](../README.md) - 项目介绍和架构说明
- [部署指南](../DEPLOYMENT_GUIDE.md) - 完整的部署流程
- [项目状态](../PROJECT_STATUS.md) - 当前开发状态

### 服务文档
- [前端应用](../waveshift-frontend/README.md) - Next.js 前端应用
- [工作流服务](../waveshift-workflow/README.md) - 主要工作流编排
- [音视频处理](../waveshift-ffmpeg-worker/CLAUDE.md) - FFMPEG 容器服务
- [AI 转录](../waveshift-transcribe-worker/README.md) - Gemini 转录服务

### 技术文档
- [设计文档](../waveshift-frontend/DESIGN.md) - Cloudflare 最佳实践
- [安全文档](../waveshift-frontend/SECURITY.md) - 安全配置和最佳实践
- [故障排除](../waveshift-frontend/TROUBLESHOOTING.md) - 常见问题解决

### 开发指南
- [主项目 CLAUDE.md](../CLAUDE.md) - 主要开发指导
- [前端开发指南](../waveshift-frontend/CLAUDE.md) - 前端开发规范
- [工作流开发指南](../waveshift-workflow/CLAUDE.md) - 工作流开发指导

## 🏗️ 项目架构

```
WaveShift Platform
├── waveshift-frontend          # Next.js 前端应用
├── waveshift-workflow          # 主工作流编排服务
├── waveshift-ffmpeg-worker     # 音视频处理服务
└── waveshift-transcribe-worker # AI 转录服务
```

## 🚀 快速链接

- **生产部署**: `npm run deploy:all`
- **本地开发**: `npm run dev:all`
- **智能部署**: `npm run deploy:smart`

## 📝 说明

所有服务都采用统一的 `waveshift-*` 命名规范，通过 Service Binding 进行内网通信，确保高性能和安全性。