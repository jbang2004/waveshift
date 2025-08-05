# WaveShift TTS Engine - 阿里云GPU云函数部署指南

本指南将帮助您将WaveShift TTS引擎部署到阿里云GPU云函数，实现无服务器的语音合成服务。

## 📋 部署前准备

### 1. 环境要求

- Docker（用于构建镜像）
- 阿里云CLI（用于部署函数）
- 阿里云账号（开通函数计算和容器镜像服务）
- Cloudflare账号（用于数据存储）

### 2. 安装必需工具

```bash
# 安装Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 安装阿里云CLI
curl -fsSL https://aliyuncli.alicdn.com/aliyun-cli-linux-latest-amd64.tgz | tar -zxvf -
sudo mv aliyun /usr/local/bin/

# 配置阿里云CLI
aliyun configure
```

### 3. 开通阿里云服务

#### 3.1 函数计算服务
- 访问 [函数计算控制台](https://fc.console.aliyun.com/)
- 开通函数计算服务
- 确保账户有足够的GPU实例配额

#### 3.2 容器镜像服务
- 访问 [容器镜像服务控制台](https://cr.console.aliyun.com/)
- 创建命名空间（如 `waveshift`）
- 设置访问凭证

### 4. 准备Cloudflare服务

#### 4.1 D1数据库
- 创建D1数据库用于存储任务数据
- 记录数据库ID

#### 4.2 R2存储
- 创建R2存储桶用于媒体文件
- 生成API密钥

## ⚙️ 配置环境变量

### 1. 复制配置模板

```bash
cp .env.template .env
```

### 2. 填写配置信息

编辑 `.env` 文件，填入实际的配置值：

```bash
# 阿里云配置
ALIYUN_ACCESS_KEY_ID=LTAI***
ALIYUN_ACCESS_KEY_SECRET=***
REGION=cn-hangzhou

# Cloudflare配置
CLOUDFLARE_ACCOUNT_ID=***
CLOUDFLARE_API_TOKEN=***
CLOUDFLARE_D1_DATABASE_ID=***
CLOUDFLARE_R2_ACCESS_KEY_ID=***
CLOUDFLARE_R2_SECRET_ACCESS_KEY=***
CLOUDFLARE_R2_BUCKET_NAME=***

# AI API密钥
DEEPSEEK_API_KEY=***
```

### 3. 配置获取指南

#### 阿里云访问密钥
1. 登录 [RAM控制台](https://ram.console.aliyun.com/users)
2. 创建RAM用户
3. 授予必要权限：
   - `AliyunFCFullAccess`（函数计算完全访问）
   - `AliyunContainerRegistryFullAccess`（容器镜像服务完全访问）
4. 生成AccessKey

#### Cloudflare配置
1. **账户ID**: 登录Cloudflare Dashboard，右侧边栏查看
2. **API令牌**: 访问 [API令牌页面](https://dash.cloudflare.com/profile/api-tokens) 创建
3. **D1数据库ID**: 在D1控制台查看数据库详情
4. **R2密钥**: 创建具有R2读写权限的API令牌

## 🚀 一键部署

### 使用部署脚本（推荐）

```bash
# 给脚本添加执行权限
chmod +x deploy.sh

# 执行完整部署
./deploy.sh

# 查看帮助信息
./deploy.sh --help
```

### 部署选项

```bash
# 仅构建镜像
./deploy.sh --build-only

# 仅部署函数（镜像已存在）
./deploy.sh --deploy-only

# 跳过镜像推送（本地测试）
./deploy.sh --skip-push
```

## 🔧 手动部署步骤

如果需要更精细的控制，可以手动执行各个步骤：

### 1. 构建Docker镜像

```bash
# 构建镜像
docker build -t waveshift-tts:latest .

# 标记镜像
docker tag waveshift-tts:latest \
  registry.cn-hangzhou.aliyuncs.com/waveshift/waveshift-tts:latest
```

### 2. 推送镜像到ACR

```bash
# 登录ACR
docker login registry.cn-hangzhou.aliyuncs.com

# 推送镜像
docker push registry.cn-hangzhou.aliyuncs.com/waveshift/waveshift-tts:latest
```

### 3. 创建函数计算服务

```bash
# 创建服务
aliyun fc CreateService \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --description "WaveShift TTS引擎GPU函数服务"
```

### 4. 创建GPU函数

```bash
# 创建函数
aliyun fc CreateFunction \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor \
  --runtime custom-container \
  --handler fc_handler.handler \
  --timeout 7200 \
  --memorySize 4096 \
  --instanceType fc.gpu.tesla.1 \
  --gpuMemorySize 8192 \
  --customContainerConfig '{"image":"registry.cn-hangzhou.aliyuncs.com/waveshift/waveshift-tts:latest"}' \
  --environmentVariables '{"CLOUDFLARE_ACCOUNT_ID":"'"${CLOUDFLARE_ACCOUNT_ID}"'"}'
```

### 5. 创建HTTP触发器

```bash
# 创建触发器
aliyun fc CreateTrigger \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor \
  --triggerName http-trigger \
  --triggerType HTTP \
  --triggerConfig '{"authType":"ANONYMOUS","methods":["GET","POST"]}'
```

## 🎯 配置极速模式

启用极速模式可以显著减少冷启动时间：

```bash
# 配置预留实例
aliyun fc PutProvisionConfig \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor \
  --qualifier LATEST \
  --target 1 \
  --scheduledActions '[
    {
      "name": "scale-up",
      "scheduleExpression": "cron(0 8 * * *)",
      "target": 2
    },
    {
      "name": "scale-down",
      "scheduleExpression": "cron(0 2 * * *)", 
      "target": 0
    }
  ]'
```

## 📊 监控和日志

### 查看函数日志

```bash
# 查看函数调用日志
aliyun fc GetFunctionLogs \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor
```

### 监控指标

在函数计算控制台可以查看：
- 调用次数
- 执行时长
- 错误率
- GPU利用率
- 内存使用率

## 🧪 测试部署

### 健康检查

```bash
# 获取函数URL
FUNCTION_URL="https://${ACCOUNT_ID}.cn-hangzhou.fc.aliyuncs.com/2016-08-15/proxy/waveshift-tts/tts-processor"

# 测试健康检查
curl "${FUNCTION_URL}/api/health"
```

### TTS处理测试

```bash
# 发起TTS任务
curl -X POST "${FUNCTION_URL}/api/start_tts" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "test-task-id"}'

# 查询任务状态
curl "${FUNCTION_URL}/api/task/test-task-id/status"
```

## 🔍 故障排查

### 常见问题

#### 1. 镜像构建失败
- 检查Docker是否正常运行
- 确认模型文件是否存在
- 检查网络连接和镜像源

#### 2. 函数部署失败
- 验证阿里云访问密钥权限
- 检查镜像URI是否正确
- 确认GPU实例配额充足

#### 3. 函数执行超时
- 增加函数超时时间
- 优化模型加载流程
- 检查网络连接稳定性

#### 4. GPU内存不足
- 减少TTS批处理大小
- 调整GPU显存分配
- 启用更频繁的内存清理

### 查看详细日志

```bash
# 查看构建日志
docker logs $(docker ps -q --filter ancestor=waveshift-tts:latest)

# 查看函数执行日志
aliyun logs GetLogs \
  --project-name waveshift-tts-logs \
  --logstore-name function-logs
```

## 💰 成本优化

### 1. 合理配置实例规格
- 根据实际需求选择GPU显存大小
- 避免过度配置内存和CPU

### 2. 使用极速模式调度
- 设置合理的扩缩容策略
- 利用夜间时段的5折优惠

### 3. 监控资源使用
- 定期检查GPU利用率
- 优化批处理大小
- 及时清理临时文件

## 🔄 版本更新

### 更新应用代码

```bash
# 重新构建镜像
./deploy.sh --build-only

# 更新函数
aliyun fc UpdateFunction \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor \
  --customContainerConfig '{"image":"registry.cn-hangzhou.aliyuncs.com/waveshift/waveshift-tts:latest"}'
```

### 回滚版本

```bash
# 使用之前的镜像标签
aliyun fc UpdateFunction \
  --region cn-hangzhou \
  --serviceName waveshift-tts \
  --functionName tts-processor \
  --customContainerConfig '{"image":"registry.cn-hangzhou.aliyuncs.com/waveshift/waveshift-tts:v1.0"}'
```

## 📞 技术支持

如遇到问题，可以：

1. 查看 [函数计算文档](https://help.aliyun.com/product/50980.html)
2. 提交 [GitHub Issue](https://github.com/your-repo/waveshift-tts/issues)
3. 加入技术交流群

## 🔐 安全建议

1. **访问控制**
   - 配置合适的触发器认证
   - 使用RAM角色控制权限

2. **密钥管理**
   - 定期轮换API密钥
   - 使用阿里云密钥管理服务

3. **网络安全**
   - 配置VPC网络（如需要）
   - 启用HTTPS访问

4. **监控告警**
   - 设置异常调用告警
   - 监控资源使用情况

---

部署完成后，您将拥有一个高性能、低成本、自动伸缩的GPU语音合成服务！