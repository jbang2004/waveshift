# Separate Worker 部署指南

## 快速部署（推荐使用 GitHub Actions）

### 1. 推送代码到 GitHub

```bash
# 如果还没有初始化 Git 仓库
git init
git add .
git commit -m "Initial commit: Separate audio-video separator"

# 推送到你的 GitHub 仓库
git remote add origin https://github.com/YOUR_USERNAME/separate-worker.git
git branch -M main
git push -u origin main
```

### 2. 在 GitHub 仓库中设置 Secrets

进入你的 GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret

添加以下 secrets：

- **CLOUDFLARE_API_TOKEN**: 你的 Cloudflare API Token（需要有 Workers 和 Containers 权限）
- **CLOUDFLARE_ACCOUNT_ID**: `1298fa35ac940c688dc1b6d8f5eead72`

### 3. 获取 Cloudflare API Token

1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. 点击 "Create Token"
3. 使用 "Custom token" 模板
4. 设置以下权限：
   - **Account** - Cloudflare Workers:Edit
   - **Zone** - Zone:Read (如果你有域名)
   - **Account** - Account Settings:Read
5. Account Resources: Include - 选择你的账户
6. 点击 "Continue to summary" → "Create Token"
7. 复制生成的 token 并添加到 GitHub Secrets

### 4. 触发部署

推送任何代码到 main 分支就会自动触发部署：

```bash
git add .
git commit -m "Deploy separate-worker"
git push
```

---

## 本地部署（需要 Docker）

### 1. 安装 Docker

**Ubuntu/Debian:**
```bash
./install-docker.sh
# 然后重新登录或运行: newgrp docker
```

**Windows/macOS:**
下载并安装 Docker Desktop

### 2. 部署

```bash
npm run deploy
```

---

## 验证部署

部署成功后，你的应用会在以下地址可用：
- https://wifski.YOUR_SUBDOMAIN.workers.dev

或者你配置的自定义域名。

---

## 环境变量配置

已经配置的环境变量：

- ✅ **CLOUDFLARE_ACCOUNT_ID**: `1298fa35ac940c688dc1b6d8f5eead72`
- ✅ **R2_BUCKET_NAME**: `wifski-audio-video`
- ✅ **R2_PUBLIC_DOMAIN**: `wifski.waveshift.net`
- ✅ **R2_ACCESS_KEY_ID**: (已设置为 secret)
- ✅ **R2_SECRET_ACCESS_KEY**: (已设置为 secret)

---

## 故障排除

### 1. R2 Bucket 不存在
如果部署失败说 bucket 不存在，请在 Cloudflare Dashboard 中创建名为 `wifski-audio-video` 的 R2 bucket。

### 2. 权限错误
确保：
- R2 API Token 有正确的权限
- Bucket 设置为公共访问
- 自定义域名 `wifski.waveshift.net` 已正确配置

### 3. 容器构建失败
确保 Docker 正在运行并且有足够的磁盘空间。

---

## 下一步

1. 测试音视频分离功能
2. 根据需要调整文件大小限制
3. 配置自定义域名（可选）
4. 设置监控和日志（可选）