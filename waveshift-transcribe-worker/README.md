# Gemini 转录服务 API 文档

基于 Cloudflare Workers 的音频/视频转录服务，使用 Google Gemini API。

> 📋 **完整文档**: 请参考根目录的 `CLAUDE.md` 获取完整的部署和使用指南。

## API 端点

### POST `/transcribe`

转录音频/视频文件并可选翻译。

**请求参数:**
- `file`: 音频/视频文件 (支持 MP3, WAV, M4A, FLAC, AAC, OGG, WebM, MP4, MOV)
- `language`: 输出语言 (`zh` 或 `en`)，默认 `zh`
- `translation_style`: 翻译风格 (`normal` 或 `classical`)，默认 `normal`

**响应格式:**
```json
{
  "transcription": "转录文本",
  "translation": "翻译文本",
  "segments": [
    {
      "start_time": "00:00:00",
      "end_time": "00:00:05",
      "text": "分段文本",
      "speaker": "说话人1"
    }
  ]
}
```

### GET `/health`

健康检查端点。

**响应:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-01T00:00:00Z"
}
```

## 使用示例

### cURL 示例

```bash
# 基本转录
curl -X POST "https://your-worker.workers.dev/transcribe" \
  -F "file=@audio.mp3"

# 转录并翻译为英文
curl -X POST "https://your-worker.workers.dev/transcribe" \
  -F "file=@audio.mp3" \
  -F "language=en"

# 使用古典翻译风格
curl -X POST "https://your-worker.workers.dev/transcribe" \
  -F "file=@audio.mp3" \
  -F "language=zh" \
  -F "translation_style=classical"
```

### JavaScript 示例

```javascript
const formData = new FormData();
formData.append('file', audioFile);
formData.append('language', 'zh');

const response = await fetch('https://your-worker.workers.dev/transcribe', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log(result.transcription);
```

## 技术特性

- 🌊 **流式响应处理**: 避免超时问题
- 🎵 **多格式支持**: MP3, WAV, M4A, FLAC, AAC, OGG, WebM, MP4, MOV
- 🔄 **双语转录**: 中英文转录和翻译
- 🎨 **多风格翻译**: 普通和古典翻译风格
- 📝 **结构化输出**: 包含时间戳和说话人信息
- ⚡ **高性能**: 使用 Gemini API 最佳实践

## 文件大小限制

| 文件大小 | 处理时间 | 成功率 | 计划建议 |
|---------|---------|--------|---------|
| < 1MB | < 10秒 | 99% | 免费/付费计划均支持 |
| 1-5MB | 10-30秒 | 90% | 建议付费计划 |
| 5-10MB | 30-60秒 | 50% | 需要付费计划 |
| > 10MB | > 60秒 | 10% | 建议分段处理 |

## 错误处理

### 常见错误码

- `400`: 请求参数错误或文件格式不支持
- `413`: 文件太大 (超过 100MB)
- `500`: 内部服务器错误
- `504`: 处理超时 (建议使用较小文件或升级计划)

### 超时处理建议

1. **免费计划用户**: 使用 < 1MB 的文件
2. **付费计划用户**: 可处理 5-10MB 的文件
3. **大文件处理**: 建议分段处理或使用其他方案

## 部署配置

参考根目录 `CLAUDE.md` 中的 **waveshift-transcribe-worker** 部分。