# R2 公共访问配置指南

## 问题说明

当前上传后显示的 `original.mp4` 404错误是因为R2 bucket没有正确配置公共访问权限。

## 解决方案

### 方案1：启用R2 Public Bucket (推荐)

1. **登录Cloudflare Dashboard**
   - 访问 https://dash.cloudflare.com
   - 选择您的账户

2. **进入R2存储管理**
   - 点击左侧菜单 "R2 Object Storage"
   - 找到 `waveshift-media` bucket

3. **启用公共访问**
   - 点击 bucket 名称进入详情页
   - 点击 "Settings" 标签
   - 在 "Public access" 部分点击 "Allow Access"
   - 记录生成的公共URL格式：`https://pub-[bucket-name].r2.dev`

4. **更新环境变量**
   ```bash
   # 在 wrangler.jsonc 中更新
   "NEXT_PUBLIC_R2_CUSTOM_DOMAIN": "https://pub-waveshift-media.r2.dev"
   ```

### 方案2：配置自定义域名

1. **添加自定义域名**
   - 在bucket设置中点击 "Custom domains"
   - 添加域名 `media.waveshift.net`
   - 配置DNS CNAME记录

2. **更新环境变量**
   ```bash
   # 保持当前配置
   "NEXT_PUBLIC_R2_CUSTOM_DOMAIN": "https://media.waveshift.net"
   ```

## 代码改进

已经实现了以下改进：

### 1. 真实上传进度监控
- ✅ 使用 `XMLHttpRequest` 替代 `fetch`
- ✅ 实时监控上传进度
- ✅ 支持错误处理和中断处理

### 2. 智能URL生成
- ✅ 新增 `/api/r2-public-url` 端点
- ✅ 自动检测文件是否存在
- ✅ 支持自定义域名和默认域名切换

### 3. 改进的用户界面
- ✅ 更好的进度条显示
- ✅ 实时状态更新
- ✅ 错误信息提示

## 测试步骤

1. **启用R2公共访问**
   ```bash
   # 测试bucket公共访问
   curl -I https://pub-waveshift-media.r2.dev/test-file.txt
   ```

2. **部署更新**
   ```bash
   cd waveshift-frontend
   npm run deploy
   ```

3. **测试上传功能**
   - 访问前端页面
   - 上传一个小文件（1-5MB）
   - 观察上传进度显示
   - 确认文件访问URL正常

## 技术细节

### 上传流程
1. 创建任务 → 获取对象路径
2. 使用XMLHttpRequest上传 → 实时进度监控
3. 调用 `/api/r2-public-url` → 获取正确的访问URL
4. 触发后续处理流程

### URL格式
- **自定义域名**: `https://media.waveshift.net/users/{userId}/{taskId}/original.{ext}`
- **默认公共URL**: `https://pub-waveshift-media.r2.dev/users/{userId}/{taskId}/original.{ext}`

### 错误处理
- 自动备用URL生成
- 上传失败时的状态回滚
- 网络错误的重试机制

配置完成后，上传进度将正常显示，且文件访问URL不会再出现404错误。