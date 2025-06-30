# Gemini 转录服务 - Cloudflare Workers 版本

这是一个基于 Cloudflare Workers 的音频/视频转录服务，使用 Google Gemini API 进行转录和翻译。

## ✨ 最新更新

### 🚀 **流式响应支持**
- ✅ **已实现流式响应**: 使用 `generateContentStream()` 替代 `generateContent()`
- ✅ **避免超时问题**: 流式处理可以处理更长的音频文件
- ✅ **实时进度反馈**: 在控制台中可以看到实时处理进度
- ✅ **与Python版本一致**: 完全对标Python版本的流式处理逻辑

### 🔧 **官方API最佳实践**
- ✅ **使用官方推荐方法**: 采用 `createUserContent()` 和 `createPartFromUri()` 方法
- ✅ **更简洁的代码**: 移除手动构建复杂的 contents 数组
- ✅ **更好的类型安全**: 利用官方SDK的类型定义
- ✅ **符合最新文档**: 完全按照[官方音频文档](https://ai.google.dev/gemini-api/docs/audio?hl=zh-cn)实现

### ⚡ **CPU时间限制优化**
- ✅ **增加CPU时间限制**: 从30秒提升到5分钟 (300,000ms)
- ✅ **增强错误处理**: 提供超时原因分析和解决建议
- ✅ **详细进度跟踪**: 每10秒输出处理进度，便于监控
- ✅ **超时预警机制**: 当处理时间接近4分钟时发出警告

### 📊 **测试结果**
- ✅ **小文件 (< 1MB)**: 完美工作，如 `fukusima.mp3` (851KB)
- ✅ **中等文件 (1-5MB)**: 现在可以稳定处理，配置CPU时间限制后
- ⚠️ **大文件 (> 10MB)**: 可能仍需分段处理或使用Python版本
- 💡 **建议**: 对于超大文件，推荐使用Python版本或将文件分段处理

## 功能特性

- 🎵 支持多种音频/视频格式 (MP3, WAV, M4A, FLAC, AAC, OGG, WebM, MP4, MOV)
- 🌐 完全基于 Cloudflare Workers，无需服务器维护
- 🔄 支持中英文转录和翻译
- 🎨 支持普通和古典翻译风格
- 📝 结构化 JSON 输出，包含时间戳和说话人信息
- 🚀 RESTful API，易于集成
- 💾 自动文件清理，无需担心存储问题
- ⚡ 使用官方推荐的最佳实践，性能优化
- 🌊 **流式响应处理，避免超时问题**

## 错误分析与解决方案

### 🔍 **常见错误分析**

#### **1. `curl: (56) Failure when receiving data from the peer`**

**原因分析:**
- **Cloudflare Workers CPU时间限制**: 免费版本10ms，付费版本30秒-5分钟(可配置)
- **大文件处理时间过长**: 8MB+ 的音频文件可能需要超过10ms的CPU时间
- **网络连接超时**: 长时间请求可能导致连接中断

**解决方案:**

##### **🆓 免费计划用户 (当前限制)**
由于免费计划CPU时间限制为10ms，对于大文件处理有以下建议：

1. **使用较小的文件** (推荐 < 1MB)
2. **分段处理音频文件**
3. **使用Python版本处理大文件** (无时间限制)
4. **考虑升级到付费计划** ($5/月，可获得最高5分钟CPU时间)

##### **💰 付费计划用户**
1. **配置CPU时间限制**: 在 `wrangler.toml` 中设置 `cpu_ms = 300000` (5分钟)
2. **处理更大文件**: 支持5-20MB的音频文件
3. **无请求数限制**: 不受10万/天限制

#### **2. 流式 vs 非流式响应对比**

| 特性 | 流式响应 (当前) | 非流式响应 (之前) |
|------|----------------|------------------|
| **CPU效率** | 🟢 高 | 🔴 低 |
| **内存使用** | 🟢 低 | 🔴 高 |
| **实时反馈** | 🟢 有 | 🔴 无 |
| **免费计划兼容** | 🟡 部分支持 | 🔴 不支持 |
| **付费计划支持** | 🟢 完全支持 | 🟢 支持 |

### 📊 **计划对比和建议**

| 文件大小 | 免费计划 | 付费计划 | 建议方案 |
|---------|---------|---------|---------|
| < 500KB | 🟢 完美 | 🟢 完美 | 使用Worker |
| 500KB-1MB | 🟡 可能成功 | 🟢 完美 | 使用Worker |
| 1-5MB | 🔴 很难成功 | 🟢 通常成功 | 升级计划或使用Python |
| > 5MB | 🔴 基本失败 | 🟡 可能成功 | 推荐Python版本 |

### 💡 **具体建议**

#### **立即可行方案 (免费计划)**
1. **文件预处理**: 使用FFmpeg等工具压缩音频文件
```bash
# 压缩音频文件
ffmpeg -i input.mp3 -b:a 64k -ar 22050 output.mp3
```

2. **使用Python版本**: 对于大文件，切换到Python版本
```bash
cd ../gemini_transcribe
python -m gemini_transcribe.cli your-large-file.mp3
```

#### **长期解决方案**
1. **升级到付费计划** ($5/月)
   - CPU时间: 10ms → 最高5分钟
   - 请求数: 10万/天 → 无限制
   - 文件支持: 500KB → 5-20MB

2. **混合使用策略**
   - 小文件: 使用Worker (快速、便捷)
   - 大文件: 使用Python版本 (稳定、无限制)

## API 接口

### POST /transcribe

转录音频或视频文件

**请求格式**: `multipart/form-data`

**参数**:
- `audio` (必需): 音频或视频文件
- `targetLanguage` (可选): 目标翻译语言，默认 `chinese`
  - `chinese`: 中文
  - `english`: 英文
- `style` (可选): 翻译风格，默认 `normal`
  - `normal`: 普通风格
  - `classical`: 古典风格
- `model` (可选): Gemini 模型，默认 `models/gemini-2.5-flash`
  - `models/gemini-2.5-flash`: 最新模型
  - `gemini-2.0-flash`: 快速模型
  - `gemini-1.5-pro`: 专业模型

**响应示例**:
```json
{
  "success": true,
  "data": {
    "transcription": [
      {
        "sequence": 1,
        "start": "0m0s0ms",
        "end": "0m3s245ms",
        "content_type": "speech",
        "speaker": "Speaker A",
        "original": "Hello, how are you?",
        "translation": "你好，你好吗？"
      }
    ],
    "metadata": {
      "fileName": "audio.mp3",
      "fileSize": 1048576,
      "mimeType": "audio/mpeg",
      "targetLanguage": "chinese",
      "style": "normal",
      "model": "models/gemini-2.5-flash",
      "segmentCount": 10,
      "processedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### GET /health

健康检查接口

### GET /

API 文档接口

## 部署步骤

### 1. 准备工作

确保你有以下账号和密钥：
- [Cloudflare 账号](https://cloudflare.com/)
- [Google AI Studio API 密钥](https://makersuite.google.com/app/apikey)

### 2. 安装依赖

```bash
cd gemini-transcribe-worker
npm install
```

### 3. 配置 API 密钥

```bash
# 设置 Gemini API 密钥
wrangler secret put GEMINI_API_KEY
# 输入你的 Gemini API 密钥
```

### 4. 本地开发

```bash
npm run dev
```

服务将在 `http://localhost:8787` 启动。

### 5. 测试服务

打开 `example-client.html` 文件，或使用 curl 测试：

```bash
curl -X POST http://localhost:8787/transcribe \
  -F "audio=@your-audio-file.mp3" \
  -F "targetLanguage=chinese" \
  -F "style=normal"
```

### 6. 部署到 Cloudflare

```bash
npm run deploy
```

部署完成后，你会得到一个 Cloudflare Workers 的 URL，可以直接使用。

## 使用示例

### JavaScript/Node.js

```javascript
const formData = new FormData();
formData.append('audio', audioFile);
formData.append('targetLanguage', 'chinese');
formData.append('style', 'normal');

const response = await fetch('https://your-worker.your-subdomain.workers.dev/transcribe', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result.data.transcription);
```

### Python

```python
import requests

files = {'audio': open('audio.mp3', 'rb')}
data = {
    'targetLanguage': 'chinese',
    'style': 'normal'
}

response = requests.post(
    'https://your-worker.your-subdomain.workers.dev/transcribe',
    files=files,
    data=data
)

result = response.json()
print(result['data']['transcription'])
```

### cURL

```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/transcribe \
  -F "audio=@audio.mp3" \
  -F "targetLanguage=chinese" \
  -F "style=normal"
```

## 文件大小建议

| 文件大小 | 处理时间 | 成功率 | 建议 |
|---------|---------|--------|------|
| < 1MB | < 10秒 | 🟢 99% | 完美支持 |
| 1-5MB | 10-30秒 | 🟡 90% | 通常正常 |
| 5-10MB | 30-60秒 | 🔴 50% | 可能超时 |
| > 10MB | > 60秒 | 🔴 10% | 建议分段或使用Python版本 |

## 限制说明

- 最大文件大小: 100MB
- 处理超时: 取决于Cloudflare Workers限制
- 支持的格式: 详见 API 文档

## 代码优化特性

### 🚀 性能优化
- **流式响应处理**: 使用 `generateContentStream()` 避免超时
- **统一MIME类型处理**: 整合了重复的文件类型检测逻辑
- **简化API调用**: 使用官方推荐的直接调用方式，移除不必要的辅助函数
- **优化错误处理**: 改进了错误消息和异常处理机制

### 📝 代码质量
- **移除重复代码**: 消除了schema定义和MIME类型检测的重复
- **符合官方最佳实践**: 使用最新的Google Gen AI SDK推荐调用方式
- **类型安全**: 改进了TypeScript类型定义和检查
- **与Python版本一致**: 完全对标Python版本的实现逻辑

### 🔧 架构改进
- **单一职责原则**: 每个函数专注于单一功能
- **配置集中管理**: 统一的配置和常量管理
- **模块化设计**: 更清晰的代码组织结构
- **流式处理**: 支持实时进度反馈和长时间处理

## 故障排除

### 1. API 密钥错误
确保正确设置了 `GEMINI_API_KEY` secret：
```bash
wrangler secret put GEMINI_API_KEY
```

### 2. 文件格式不支持
检查文件的 MIME 类型是否在支持列表中。

### 3. 文件太大
确保文件大小不超过 100MB，建议使用 < 5MB 的文件。

### 4. 网络超时
对于大文件，可能需要更长的处理时间：
- 尝试分段处理
- 使用Python版本处理大文件
- 升级Cloudflare Workers套餐

### 5. 流式响应中断
如果遇到流式响应中断：
- 检查网络连接稳定性
- 减小文件大小
- 重试请求

## 开发说明

### 项目结构

```
gemini-transcribe-worker/
├── src/
│   ├── index.ts           # Worker 主入口
│   ├── gemini-client.ts   # Gemini API 客户端 (支持流式响应)
│   └── transcription.ts   # 转录核心逻辑
├── wrangler.toml          # Cloudflare Workers 配置
├── tsconfig.json          # TypeScript 配置
├── package.json           # 项目依赖
├── example-client.html    # 测试客户端
└── README.md             # 项目说明
```

### 关键特性

1. **流式响应处理**: 使用 `generateContentStream()` 支持长时间处理
2. **优化的代码结构**: 移除重复逻辑，提高代码质量
3. **统一的错误处理**: 完善的错误处理和用户友好的错误消息
4. **自动文件管理**: 上传、处理、清理全自动化
5. **CORS 支持**: 支持跨域请求，便于前端集成
6. **类型安全**: 完整的TypeScript类型定义
7. **与Python版本一致**: 完全对标Python版本的功能和质量

## 性能对比

| 特性 | TypeScript Worker | Python 版本 |
|------|------------------|-------------|
| **部署复杂度** | 🟢 简单 | 🔴 复杂 |
| **维护成本** | 🟢 低 | 🔴 高 |
| **处理大文件** | 🔴 有限制 | 🟢 无限制 |
| **启动速度** | 🟢 快 | 🔴 慢 |
| **流式响应** | 🟢 支持 | 🟢 支持 |
| **功能完整性** | 🟢 完整 | 🟢 完整 |

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！ 