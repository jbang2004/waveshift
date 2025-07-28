# 🧠 音频降噪集成测试指南

## 📋 实施完成清单

✅ 创建 denoise-container 目录结构
✅ 实现 denoise_server.py 降噪服务 (FastAPI + ZipEnhancer)
✅ 创建 Dockerfile 和依赖配置 (优化的多阶段构建)
✅ 修改 wrangler.jsonc 配置两个容器
✅ 修改 container.ts 添加 DenoiseContainer 类
✅ 修改 streaming-processor.ts 添加降噪调用逻辑
✅ 修改 index.ts 传递降噪配置参数
✅ 更新 workflow 类型定义支持 enableDenoising 选项
✅ **优化音频切分容器输出16kHz单声道** (降噪模型要求)
✅ **优化降噪容器采样率验证逻辑** (严格检查16kHz)
✅ **创建GitHub Actions手动触发部署** (支持容器管理)

## 🏗️ 架构概览

```
音频切分请求 → audio-segment-container (Rust+FFmpeg)
                ↓
             音频片段生成
                ↓
            {enableDenoising?}
                ↓
          denoise-container (Python+ZipEnhancer)
                ↓
            降噪处理完成
                ↓
             R2存储 + D1更新
```

## 🎯 核心特性

### **零中间存储**
- 音频数据在内存中流转，无需落盘
- 音频切分 → 降噪 → R2存储 (一次性完成)

### **故障自动降级**
- 降噪失败时自动使用原始音频
- 不影响整体处理流程

### **完美兼容**
- 通过 enableDenoising 参数控制
- 默认关闭，向后兼容

## 🚀 部署步骤

### 1. 部署服务
```bash
cd waveshift-audio-segment-worker
./deploy-with-denoise.sh
```

### 2. 验证部署
```bash
# 检查Worker状态
curl https://waveshift-audio-segment-worker.jbang20042004.workers.dev/health

# 监控日志
wrangler tail waveshift-audio-segment-worker --format pretty
```

## 🧪 测试流程

### 1. 前端调用
在前端上传界面添加降噪选项：
```javascript
// 在前端调用时传递参数
const workflowParams = {
  originalFile: "users/userId/taskId/original.mp4",
  fileType: "video/mp4",
  options: {
    targetLanguage: "chinese",
    style: "normal",
    enableDenoising: true  // 🆕 启用降噪
  }
};
```

### 2. Workflow 调用
工作流会自动传递参数到音频切分服务：
```typescript
// sep-trans.ts 中的调用
await env.AUDIO_SEGMENT_SERVICE.watch({
  audioKey,
  transcriptionId,
  outputPrefix,
  taskId,
  enableDenoising: options.enableDenoising  // 传递到音频切分服务
});
```

### 3. 音频处理流程
```
1. 音频切分 (audio-segment-container) ✅
2. 降噪处理 (denoise-container) 🆕
3. R2存储 (降噪后的音频) ✅
4. D1更新 (音频链接) ✅
```

## 📊 监控和调试

### 关键日志标识
```bash
# 音频切分开始
🎵 生成音频片段: segment_xxx

# 降噪处理开始
🧠 开始降噪处理: segment_xxx

# 降噪成功
✅ 降噪完成: segment_xxx, 输入=xxx bytes, 输出=xxx bytes

# 降噪失败降级
❌ 降噪失败，使用原始音频: segment_xxx

# 最终上传
📤 上传音频到R2: users/xxx/audio-segments/segment_xxx.wav
```

### 性能监控指标
- **降噪处理时间**: 每个片段的处理耗时
- **成功/失败率**: 降噪处理的成功率
- **内存使用**: 确保无内存泄漏
- **容器状态**: 两个容器的健康状态

## 🔧 故障排除

### 常见问题

#### 1. 降噪容器启动失败
```bash
# 检查容器状态
wrangler tail waveshift-audio-segment-worker --format pretty

# 可能原因：
- Python依赖安装失败
- ONNX模型文件缺失
- 内存限制问题
```

#### 2. 降噪处理失败
```bash
# 日志中会显示：
❌ 降噪失败，使用原始音频: segment_xxx

# 可能原因：
- 音频格式不兼容
- 模型推理异常
- 内存不足
```

#### 3. Service Binding 问题
```bash
# 错误信息：
Property 'DENOISE_CONTAINER' does not exist

# 解决方案：
- 确认 wrangler.jsonc 中的 bindings 配置
- 重新部署服务
- 检查迁移标签 (tag: "v14")
```

## 📈 性能预期

| 指标 | 不启用降噪 | 启用降噪 | 增量 |
|------|------------|----------|------|
| 处理时间 | ~2-3秒 | ~4-6秒 | +2-3秒 |
| 内存使用 | ~128MB | ~256MB | +128MB |
| 存储操作 | 1次PUT | 1次PUT | 无变化 |
| 音频质量 | 原始 | 降噪后 | 显著提升 |

## 🎉 验证成功标准

### ✅ 技术验证
- [ ] Worker成功部署，无报错
- [ ] 两个容器都正常启动
- [ ] 音频切分功能正常工作
- [ ] 降噪功能可选启用/禁用
- [ ] 降噪失败时自动降级

### ✅ 功能验证
- [ ] 上传含噪音的音频文件
- [ ] 启用降噪选项处理
- [ ] 下载生成的音频片段
- [ ] 对比降噪前后的音质差异
- [ ] 确认降噪效果明显

### ✅ 性能验证
- [ ] 处理时间在可接受范围内
- [ ] 内存使用稳定，无泄漏
- [ ] 并发处理能力正常
- [ ] 错误恢复机制工作正常

## 🔮 后续优化

1. **性能优化**: 
   - 优化ONNX模型加载
   - 实现模型缓存机制
   - 调整容器资源配置

2. **功能增强**:
   - 支持不同降噪强度级别
   - 添加音频质量评估
   - 支持批量降噪处理

3. **监控完善**:
   - 添加详细的性能指标
   - 实现自动报警机制
   - 优化日志结构

---

**🎯 集成完成！音频切分服务现已支持可选的智能降噪功能。**