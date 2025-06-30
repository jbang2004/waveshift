# 故障排除指南

本文档记录了在开发和部署过程中遇到的主要问题及其解决方案。

## 1. OpenNext Cloudflare 部署问题

### 问题症状
- API路由返回500内部服务器错误
- 前端显示 `{"error":"Failed to create media task"}` 
- 用户上传文件失败
- 浏览器开发者工具显示500状态码

### 根本原因分析

#### 1.1 错误的构建流程
**问题**: 使用了错误的构建命令，导致代码修改未部署

**错误做法**:
```bash
npm run build && npx @opennextjs/cloudflare deploy
```

**正确做法**:
```bash
npx @opennextjs/cloudflare build && npx @opennextjs/cloudflare deploy
```

**说明**: 
- `next build` 只生成标准的Next.js构建输出 (`.next/`)
- `@opennextjs/cloudflare build` 才会将Next.js输出转换为Cloudflare Workers兼容格式 (`.open-next/`)

#### 1.2 缺失的数据库表
**问题**: 数据库缺少 `media_tasks` 等业务表，导致外键约束失败

**错误信息**: `D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`

**解决方案**: 运行媒体表初始化端点
```bash
curl -X POST https://your-worker.workers.dev/api/init-media-tables
```

#### 1.3 生产环境console.log被移除
**问题**: Next.js生产环境自动移除console.log，导致无法看到调试信息

**解决方案**: 临时禁用console.log移除进行调试
```typescript
// next.config.ts
compiler: {
  removeConsole: false, // 临时设置用于调试
},
```

### 解决步骤

1. **确认构建流程正确**
   ```bash
   # 检查package.json中的deploy脚本
   "deploy": "npx @opennextjs/cloudflare build && npx @opennextjs/cloudflare deploy"
   ```

2. **创建必要的数据库表**
   ```bash
   # 初始化基础表
   curl -X GET https://your-worker.workers.dev/api/setup
   
   # 初始化媒体相关表
   curl -X POST https://your-worker.workers.dev/api/init-media-tables
   ```

3. **验证部署成功**
   ```bash
   # 检查.open-next目录是否生成
   ls -la .open-next/
   
   # 检查代码修改是否包含在构建中
   grep -r "your-test-string" .open-next/
   ```

4. **启用调试日志** (如果需要)
   ```typescript
   // 临时修改next.config.ts
   compiler: {
     removeConsole: false,
   }
   ```

## 2. 数据库相关问题

### 2.1 外键约束失败
**症状**: `FOREIGN KEY constraint failed: SQLITE_CONSTRAINT`

**常见原因**:
- 引用的用户ID不存在于users表中
- 缺少必要的数据库表
- 外键字段值为undefined而非null

**解决方案**:
1. 确保users表存在且有数据
2. 确保所有业务表已创建
3. 明确设置可选外键字段为null

### 2.2 表结构不匹配
**症状**: 插入数据时字段错误

**解决方案**:
1. 检查数据库schema定义
2. 运行数据库迁移
3. 验证类型定义与实际表结构一致

## 3. 认证相关问题

### 3.1 JWT Token不匹配
**症状**: 有access_token cookie但仍返回401

**原因**: JWT_SECRET更改后现有token失效

**解决方案**: 用户重新登录获取新token

### 3.2 中间件拦截
**症状**: API路由被意外拦截

**解决方案**: 检查middleware.ts中的路由匹配规则

## 4. 调试技巧

### 4.1 第一性原理调试法
当遇到复杂问题时：
1. **隔离变量**: 创建最简单的测试用例
2. **逐层验证**: 从数据库连接→表存在→数据插入
3. **回到基础**: 验证构建流程、环境配置、权限设置

### 4.2 有效的调试工具
1. **wrangler tail**: 实时查看Worker日志
   ```bash
   npx wrangler tail your-worker-name --format=pretty
   ```

2. **curl测试**: 绕过前端直接测试API
   ```bash
   curl -X POST https://your-worker.workers.dev/api/endpoint \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

3. **数据库检查**: 直接查询数据库状态
   ```bash
   curl -X GET https://your-worker.workers.dev/api/setup
   ```

### 4.3 分步骤验证
1. **环境检查**: 确认所有环境变量和绑定
2. **构建验证**: 确认代码修改在构建输出中
3. **数据库验证**: 确认表结构和数据完整性
4. **权限验证**: 确认认证和授权正常
5. **业务逻辑验证**: 测试具体功能

## 5. 预防措施

1. **标准化构建流程**: 始终使用正确的OpenNext构建命令
2. **环境一致性**: 确保开发和生产环境配置一致
3. **数据库初始化**: 提供自动化的数据库设置脚本
4. **日志策略**: 在开发环境保留详细日志
5. **测试覆盖**: 为关键功能提供API级别的测试

## 6. 常用命令速查

```bash
# 构建和部署
npm run deploy

# 查看实时日志
npx wrangler tail your-worker-name --format=pretty

# 设置环境变量
npx wrangler secret put SECRET_NAME

# 数据库初始化
curl -X POST https://your-worker.workers.dev/api/init-media-tables

# 检查数据库状态
curl -X GET https://your-worker.workers.dev/api/setup

# 清理构建缓存
rm -rf .next .open-next && npm run deploy
```

---

**记住**: 当遇到500错误时，第一步总是确认构建流程正确，然后逐步验证数据库、认证和业务逻辑。