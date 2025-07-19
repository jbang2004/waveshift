# WaveShift Audio Segment Worker

智能音频切分服务，基于转录数据和说话人信息进行音频片段提取，为语音合成提供参考音频。

## 架构

- **Worker**: TypeScript + Cloudflare Workers + Hono
- **Container**: Python + FastAPI + pydub + ffmpeg
- **存储**: Cloudflare R2 Object Storage

## 功能特性

- 🎯 **说话人分组**: 根据说话人和时间戳智能分组音频片段
- 🔄 **智能合并**: 自动合并连续的同说话人片段
- ⏱️ **时长控制**: 可配置目标时长和最小时长
- 🎵 **音频处理**: 支持padding、淡入淡出、标准化
- 📤 **并发处理**: 异步并行处理多个音频切片
- 🔧 **容器化**: 基于Docker的可扩展架构

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动容器服务

```bash
# 构建并启动容器
cd audio-segment-container
docker build -t audio-segment-container .
docker run -p 8080:8080 audio-segment-container
```

### 3. 启动Worker

```bash
# 在另一个终端
npm run dev
```

### 4. 测试健康检查

```bash
curl http://localhost:8787/health
```

## 部署

### 设置环境变量

```bash
# R2存储配置
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_BUCKET_NAME
wrangler secret put R2_PUBLIC_DOMAIN
```

### 部署到Cloudflare

```bash
npm run deploy
```

## API 接口

### WorkerEntrypoint (Service Binding)

```typescript
// 在其他服务中调用
const result = await env.AUDIO_SEGMENT_SERVICE.segment({
  audioKey: 'audio/original.mp3',
  transcripts: [...],
  goalDurationMs: 10000,
  minDurationMs: 3000,
  paddingMs: 500,
  outputPrefix: 'segments/task123'
});
```

### HTTP API

```bash
# 音频切分
POST /segment
{
  "audioKey": "audio/original.mp3",
  "transcripts": [...],
  "goalDurationMs": 10000,
  "minDurationMs": 3000,
  "paddingMs": 500,
  "outputPrefix": "segments/task123"
}

# 健康检查
GET /health
```

## 配置参数

- `goalDurationMs`: 目标片段时长（毫秒），默认10秒
- `minDurationMs`: 最小片段时长（毫秒），默认3秒  
- `paddingMs`: 片段间的padding（毫秒），默认500ms
- `outputPrefix`: 输出文件前缀，用于R2存储路径

## 切分算法

1. **预处理**: 过滤出speech类型的转录片段
2. **分组**: 根据说话人和序列连续性进行分组
3. **时长控制**: 根据目标时长截取或合并片段
4. **重叠处理**: 合并重叠的音频时间段
5. **音频处理**: 添加padding、淡入淡出、标准化
6. **存储**: 上传到R2并返回访问路径

## 故障排除

### 容器启动失败

- 检查Docker是否正常运行
- 确保端口8080未被占用
- 查看容器日志: `docker logs <container_id>`

### 音频处理失败

- 检查音频文件格式是否支持
- 确保R2存储权限配置正确
- 查看Worker日志: `wrangler tail`

### 内存不足

- 考虑增加Container实例类型
- 优化音频文件大小
- 调整切片参数减少内存使用