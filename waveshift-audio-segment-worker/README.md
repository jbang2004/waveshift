# WaveShift Audio Segment Worker v4.0

🎵 **流式实时音频切分服务** - 基于转录数据轮询D1数据库，实时生成智能音频片段。

## 🎯 核心特性

- 🔄 **流式实时处理**: 轮询D1数据库，实时处理新转录句子
- 🎯 **智能音频复用**: 跨批次状态保持，同说话人句子智能复用已生成音频
- ⚡ **高性能切分**: 基于说话人、时长、间隔的三维决策算法
- 💾 **实时数据库更新**: 自动更新transcription_segments表的audio_key字段
- 🚀 **容器化处理**: Rust + FFmpeg 容器提供高性能音频处理

## 🏗️ 流式架构

```
Workflow调用watch() → Worker轮询D1 → 增量处理新句子 → 
智能音频切分与复用 → Rust Container处理 → R2存储 → 
实时更新D1 audio_key → 返回处理统计
```

- **Worker**: TypeScript + Cloudflare Workers (业务逻辑 + 实时轮询)
- **Container**: Rust + FFmpeg + Alpine Linux (音频处理)
- **存储**: Cloudflare R2 + D1 Database
- **算法**: 流式累积器 + 跨批次复用优化

## 🛠️ 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 启动容器服务（需要Docker）

```bash
# 构建并启动容器
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
# 返回: {"status":"healthy","service":"audio-segment-worker","version":"4.0"}
```

## 🚀 部署

### 推荐部署方式：GitHub Actions

```bash
# 触发Container自动部署
gh workflow run "Deploy Audio Segment Worker (Container)"
```

### 本地部署

```bash
# 设置环境变量
wrangler secret put R2_PUBLIC_DOMAIN
# 音频切分参数配置
wrangler secret put GAP_DURATION_MS      # 句间静音时长，默认500ms
wrangler secret put MAX_DURATION_MS      # 最大片段时长，默认12000ms
wrangler secret put MIN_DURATION_MS      # 最小保留时长，默认1000ms
wrangler secret put GAP_THRESHOLD_MULTIPLIER  # 间隔检测倍数，默认3

# 部署
npm run deploy
```

## 📡 API 接口

### 🎯 Service Binding 调用（推荐）

```typescript
// 在workflow中调用流式监听API
const result = await env.AUDIO_SEGMENT_SERVICE.watch({
  audioKey: 'audio/extracted_audio.mp3',
  transcriptionId: 'trans_12345',
  outputPrefix: 'segments/task123',
  taskId: 'optional-task-id'
});

console.log(`处理完成: 生成${result.segmentCount}个音频片段`);
console.log(`统计: 轮询${result.stats.totalPolls}次，处理${result.stats.totalSentencesProcessed}个句子`);
```

### 📊 返回数据结构

```typescript
interface WatchResponse {
  success: boolean;
  segmentCount?: number;                     // 生成的音频片段数量
  sentenceToSegmentMap?: Record<number, string>; // sequence -> segment_id 映射
  error?: string;
  stats?: {
    totalPolls: number;                      // 总轮询次数
    totalSentencesProcessed: number;         // 处理的句子总数
    totalDuration: number;                   // 总处理时长(ms)
  };
}
```

### 🔧 健康检查API

```bash
GET /health
# 返回: {
#   "status": "healthy",
#   "service": "audio-segment-worker", 
#   "version": "4.0",
#   "note": "Real-time streaming audio segmentation service"
# }
```

## ⚙️ 配置参数

| 环境变量 | 说明 | 默认值 | 示例 |
|---------|------|--------|------|
| `GAP_DURATION_MS` | 句子间填充的静音时长 | 500ms | 静音间隔，确保播放连贯性 |
| `MAX_DURATION_MS` | 单个音频片段最大时长 | 12000ms | 防止片段过长影响体验 |
| `MIN_DURATION_MS` | 片段最小保留时长 | 1000ms | 过滤掉过短的孤立片段 |
| `GAP_THRESHOLD_MULTIPLIER` | 间隔检测倍数 | 3 | 判断是否需要分割的阈值 |
| `R2_PUBLIC_DOMAIN` | R2公共访问域名 | - | `pub-bucket.r2.dev` |

## 🧠 智能切分算法

### 流式处理三阶段：

1. **🔄 说话人切换检查**
   - 检测说话人变化，自动结束当前累积器
   - 跨批次复用：恢复同说话人的活跃累积器

2. **📊 智能句子累积**
   - **累积模式**: 新句子智能合并到当前片段
   - **复用模式**: 达到MAX时长后，后续句子直接复用已生成音频

3. **⏱️ 时长决策与复用激活**
   - **MAX检查**: 达到最大时长立即处理，转为复用模式
   - **MIN检查**: 说话人切换时过滤过短片段
   - **跨批次状态保持**: 活跃累积器跨批次复用

### 音频复用优化：

```
说话人A: 句子1-3 → 生成audio_001.wav (12秒)
说话人A: 句子4-6 → 直接复用audio_001.wav ✅
说话人B: 句子7-9 → 生成audio_007.wav (11秒)  
说话人A: 句子10  → 继续复用audio_001.wav ✅
```

**🎯 效果**: 大幅减少Container调用和R2存储操作，提升性能

## 📁 文件结构

```
waveshift-audio-segment-worker/
├── src/
│   ├── index.ts                  # Worker入口点，Service Binding接口
│   ├── streaming-processor-v2.ts # 流式处理器，实时D1更新
│   ├── streaming-processor.ts    # 核心算法：AudioSegmenter, StreamingAccumulator
│   ├── container.ts             # Durable Object Container配置
│   └── types.ts                 # 类型定义
├── audio-segment-container/      # Rust音频处理容器
│   ├── src/main.rs              # Rust FFmpeg服务器
│   └── Cargo.toml
├── Dockerfile                   # Alpine + Rust + FFmpeg镜像
└── wrangler.jsonc              # Cloudflare配置
```

## 🚨 故障排除

### Container启动问题

```bash
# 检查Container日志
wrangler tail waveshift-audio-segment-worker --format pretty

# 手动触发Container部署
gh workflow run "Deploy Audio Segment Worker (Container)" --field force_rebuild=true
```

### 轮询处理问题

```bash
# 检查D1数据库状态
wrangler d1 execute waveshift-database --command "
  SELECT COUNT(*) as total, 
         COUNT(audio_key) as with_audio 
  FROM transcription_segments 
  WHERE transcription_id = 'your-transcription-id'"

# 查看处理日志
curl https://your-worker.workers.dev/health
```

### 性能优化建议

- **音频复用率**: 同说话人连续句子应有90%+复用率
- **轮询效率**: 动态间隔调整（有数据2秒，无数据5秒）
- **批量操作**: D1更新按audioKey分组，减少SQL调用
- **Container优化**: 使用Alpine镜像，启动时间<3秒

## 📈 监控指标

- `segmentCount`: 生成的音频片段数量
- `totalPolls`: 轮询次数（反映处理效率）  
- `totalSentencesProcessed`: 处理的句子数量
- `totalDuration`: 总处理时长
- `音频复用率`: reused/(pending+reused)

---

🎵 **v4.0 - 纯流式实时处理架构** | 智能复用 | 高性能 | 生产就绪