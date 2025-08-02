# GitHub Actions 部署设置

## 需要配置的 GitHub Secrets

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中添加以下 secrets：

### 1. 阿里云容器镜像服务 (ACR) 凭证
- `ACR_USERNAME`: aliyun0518007542
- `ACR_PASSWORD`: 13318251863jbang

### 2. 阿里云函数计算 (FC) 凭证
- `ALIYUN_ACCESS_KEY_ID`: 你的阿里云 AccessKey ID
- `ALIYUN_ACCESS_KEY_SECRET`: 你的阿里云 AccessKey Secret
- `ALIYUN_ACCOUNT_ID`: 你的阿里云账号ID

## 手动触发部署

1. 访问 GitHub Actions 页面
2. 选择 "Deploy FC Denoise Service" 工作流
3. 点击 "Run workflow"
4. 可选：勾选 "Force rebuild Docker image" 强制重建镜像

## 自动触发部署

当以下条件满足时自动触发：
- 推送代码到 `fc-denoise-service/` 目录
- 修改部署工作流文件

## 部署流程

1. **构建阶段**
   - 使用 Docker Buildx 构建镜像
   - 利用缓存加速构建
   - 推送到阿里云 ACR

2. **部署阶段**
   - 使用 Serverless Devs 部署到 FC
   - 自动更新镜像版本
   - 验证部署状态

3. **测试阶段**
   - 健康检查测试
   - 显示测试命令

## 优势

- ✅ **网络稳定**: GitHub Actions 网络环境优秀，无需使用镜像源
- ✅ **自动缓存**: Docker 层缓存，加速后续构建
- ✅ **版本管理**: 每次构建都有唯一的 commit SHA 标签
- ✅ **无需本地环境**: 不依赖本地 Docker 和网络环境