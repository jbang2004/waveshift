# R2 CORS配置指南 - 支持预签名URL直接上传

## 🚨 重要：必须正确配置CORS才能使预签名URL工作

根据Cloudflare官方文档和2025年最佳实践，必须为R2 bucket配置正确的CORS策略。

## 配置步骤

### 1. 访问Cloudflare Dashboard
1. 登录 https://dash.cloudflare.com
2. 选择您的账户
3. 点击左侧菜单 "R2 Object Storage"
4. 找到 `waveshift-media` bucket并点击

### 2. 配置CORS策略
1. 点击 "Settings" 标签
2. 滚动到 "CORS policy" 部分
3. 点击 "Add CORS policy"
4. 选择 "Custom" 并输入以下JSON配置：

```json
[
  {
    "AllowedHeaders": [
      "content-type",
      "content-length",
      "authorization",
      "x-amz-date",
      "x-amz-content-sha256"
    ],
    "AllowedMethods": [
      "PUT",
      "POST",
      "GET",
      "HEAD"
    ],
    "AllowedOrigins": [
      "https://waveshift-frontend.jbang20042004.workers.dev",
      "http://localhost:3001",
      "http://localhost:3000"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

### 3. 关键配置说明

#### ⚠️ 重要提醒
- **不要使用通配符 "*"** 在 `AllowedHeaders` 中
- **必须明确指定 "content-type"** 作为允许的头部
- CORS规则传播可能需要**最多30秒**

#### AllowedHeaders 解释
- `content-type`: **必需**，用于指定文件MIME类型
- `content-length`: 上传文件大小
- `authorization`: 认证头部（如果需要）
- `x-amz-date`: AWS签名所需
- `x-amz-content-sha256`: AWS签名校验

#### AllowedMethods 解释
- `PUT`: 预签名URL单文件上传
- `POST`: 分块上传初始化
- `GET`: 文件下载和验证
- `HEAD`: 文件元数据检查

#### AllowedOrigins 解释
- 生产域名: `https://waveshift-frontend.jbang20042004.workers.dev`
- 本地开发: `http://localhost:3001`, `http://localhost:3000`

## 验证CORS配置

### 使用curl测试
```bash
# 测试预检请求
curl -X OPTIONS \
  -H "Origin: https://waveshift-frontend.jbang20042004.workers.dev" \
  -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type" \
  https://1298fa35ac940c688dc1b6d8f5eead72.r2.cloudflarestorage.com/waveshift-media/test-file.txt

# 应该返回CORS头部
```

### 浏览器开发者工具检查
1. 打开浏览器开发者工具
2. 尝试上传文件
3. 检查网络面板中的预检请求(OPTIONS)
4. 确认响应包含正确的CORS头部

## 常见错误和解决方案

### 1. "CORS policy: No 'Access-Control-Allow-Origin' header"
**原因**: AllowedOrigins配置错误
**解决**: 确保域名完全匹配，包括协议(https://)

### 2. "CORS policy: Request header content-type is not allowed"
**原因**: AllowedHeaders缺少content-type
**解决**: 在AllowedHeaders中明确添加"content-type"

### 3. "Response to preflight request doesn't pass access control check"
**原因**: 使用了通配符"*"或配置不完整
**解决**: 使用上述完整的CORS配置

### 4. 403 Forbidden错误
**原因**: 
- CORS规则还未生效（等待30秒）
- 预签名URL已过期
- 签名计算错误

**解决**:
- 等待CORS规则生效
- 检查预签名URL生成逻辑
- 验证R2访问密钥配置

## 测试上传流程

配置完成后，测试以下流程：

1. **生成预签名URL**
   ```bash
   # 通过API端点测试
   curl -X POST https://waveshift-frontend.jbang20042004.workers.dev/api/r2-presigned-simple \
     -H "Content-Type: application/json" \
     -d '{"objectName":"test/file.mp4","contentType":"video/mp4"}'
   ```

2. **使用预签名URL上传**
   ```bash
   curl -X PUT "PRESIGNED_URL_HERE" \
     -H "Content-Type: video/mp4" \
     --data-binary @test-file.mp4
   ```

3. **验证文件存在**
   ```bash
   curl -I https://pub-waveshift-media.r2.dev/test/file.mp4
   ```

## 安全建议

1. **限制域名**: 只允许您控制的域名
2. **设置合理过期时间**: MaxAgeSeconds不要太长
3. **定期审查**: 检查CORS配置的有效性
4. **监控访问**: 启用R2访问日志（如果可用）

配置完成后，您的预签名URL直接上传功能就应该可以正常工作了！