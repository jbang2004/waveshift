# 🚀 WaveShift 部署指南

## 部署方式总览

### 🎯 **推荐部署方式**

#### **1. GitHub Actions 部署 (推荐)**
```bash
# FFmpeg Worker (容器服务)
npm run deploy:docker
# 选择: 1 - FFmpeg Worker

# 所有服务
gh workflow run "Deploy All WaveShift Services"
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
npm run deploy:ffmpeg       # FFmpeg Worker
npm run deploy:transcribe   # 转录服务
```

## 核心部署文件

### **GitHub Actions 工作流**
- `deploy-ffmpeg-docker.yml` - FFmpeg容器专用部署 ⭐
- `deploy-all.yml` - 完整多服务部署
- `deploy-services.yml` - 通用服务部署

### **本地部署脚本**
- `scripts/deploy-docker.sh` - Docker部署触发器
- `scripts/smart-deploy.sh` - 智能增量部署

## 部署流程

### **FFmpeg Worker (容器服务)**
1. **GitHub Actions** (推荐):
   ```bash
   npm run deploy:docker
   ```
   
2. **本地部署** (需要Docker):
   ```bash
   cd waveshift-ffmpeg-worker
   docker build -t ffmpeg-container .
   npm run deploy
   ```

### **其他服务**
```bash
# 工作流服务
cd waveshift-workflow && npm run deploy

# 转录服务  
cd waveshift-transcribe-worker && npm run deploy

# 前端应用
cd waveshift-frontend && npm run deploy
```

## 部署顺序

⚠️ **重要**: 必须按以下顺序部署以确保Service Binding正确配置

1. **waveshift-ffmpeg-worker** - 音视频处理服务
2. **waveshift-transcribe-worker** - AI转录服务
3. **waveshift-workflow** - 工作流编排服务 (依赖上述两个服务)
4. **waveshift-frontend** - 前端应用 (依赖工作流服务)

## 验证部署

```bash
# 检查工作流状态
gh run list --limit 5

# 查看特定运行
gh run view <run-id> --log

# 访问部署的服务
curl https://waveshift-ffmpeg-worker.你的账户.workers.dev/health
```

## 故障排查

### **常见问题**
1. **容器构建失败** - 使用GitHub Actions部署
2. **Service Binding错误** - 检查部署顺序
3. **权限问题** - 验证API Token和账户ID

### **检查部署状态**
```bash
npm run status  # 运行部署状态检查脚本
```

## 环境变量

确保设置以下环境变量或GitHub Secrets:
```bash
CLOUDFLARE_API_TOKEN=your-api-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
GEMINI_API_KEY=your-gemini-key
```