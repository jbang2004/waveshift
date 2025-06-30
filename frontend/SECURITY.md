# WaveShift Frontend - 安全配置指南

## 🔐 环境变量和密钥管理

### 开发环境
开发环境的敏感信息存储在 `.dev.vars` 文件中，该文件仅用于本地开发。

### 生产环境
生产环境的敏感信息通过 **Wrangler Secrets** 管理，确保安全性。

## 🚨 安全修复记录

### 2025-01-16: 密钥泄露修复
- **问题**: `wrangler.jsonc` 和 `.env.local` 中硬编码了 R2 访问密钥
- **修复**: 
  - 移除所有配置文件中的硬编码密钥
  - 迁移敏感信息到 wrangler secrets
  - 添加安全配置脚本

### 影响的密钥
以下密钥已从配置文件中移除并迁移到 secrets：
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY` 
- `WORKFLOW_CALLBACK_SECRET`
- `JWT_SECRET`

## ⚙️ 配置 Wrangler Secrets

### 自动配置（推荐）
```bash
cd frontend
./scripts/setup-secrets.sh
```

### 手动配置
```bash
# R2 访问密钥
echo "your-r2-access-key-id" | wrangler secret put R2_ACCESS_KEY_ID
echo "your-r2-secret-key" | wrangler secret put R2_SECRET_ACCESS_KEY

# 工作流回调密钥
echo "your-workflow-callback-secret" | wrangler secret put WORKFLOW_CALLBACK_SECRET

# JWT 签名密钥
echo "your-jwt-secret" | wrangler secret put JWT_SECRET
```

### 验证配置
```bash
wrangler secret list
```

## 🛡️ 安全最佳实践

### 1. 密钥管理
- ✅ 使用 wrangler secrets 管理生产环境敏感信息
- ✅ 定期轮换密钥
- ✅ 为不同环境使用不同的密钥
- ❌ 永远不要将密钥提交到版本控制

### 2. 环境隔离
- **开发环境**: 使用 `.dev.vars`（本地文件，不提交）
- **生产环境**: 使用 wrangler secrets（云端加密存储）

### 3. 访问控制
- JWT token 设置合理的过期时间（15分钟访问令牌，30天刷新令牌）
- 使用 HttpOnly cookies 防止 XSS 攻击
- 实施 CSRF 保护

### 4. API 安全
- 所有 API 路由都有适当的身份验证
- 使用工作流回调密钥验证内部服务通信
- 输入验证和 sanitization

## 🔍 安全审计

### 定期检查项目
1. **密钥泄露检查**: 确保没有硬编码密钥
2. **依赖安全**: 定期运行 `npm audit`
3. **权限审查**: 检查 Cloudflare 权限设置
4. **日志审查**: 监控异常访问模式

### 安全扫描命令
```bash
# 检查依赖漏洞
npm audit

# 检查类型安全
npm run type-check

# 代码质量检查
npm run lint
```

## 🚨 安全事件响应

如果发现安全问题：

1. **立即行动**
   - 轮换所有受影响的密钥
   - 更新 wrangler secrets
   - 部署新版本

2. **评估影响**
   - 检查访问日志
   - 确定数据泄露范围
   - 通知相关用户（如需要）

3. **防范措施**
   - 加强监控
   - 更新安全策略
   - 团队安全培训

## 📞 联系方式

如有安全问题或疑虑，请联系：
- 安全团队: security@waveshift.net
- 技术负责人: tech@waveshift.net

---

**重要提醒**: 安全是持续的过程，不是一次性的任务。请定期审查和更新安全配置。