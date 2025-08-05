# WaveShift TTS Engine

<div align="center">

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Platform](https://img.shields.io/badge/platform-Local%20%2B%20Cloudflare-orange.svg)
![GPU](https://img.shields.io/badge/GPU-CUDA%20Supported-green.svg)
![Python](https://img.shields.io/badge/python-3.9+-blue.svg)

🚀 **专业的IndexTTS语音合成引擎**

基于IndexTTS v0.1.4的高性能TTS服务，与Cloudflare Worker集成构成完整的媒体处理管道

</div>

## 🎯 项目概述

WaveShift TTS Engine 是一个专注的文字转语音（TTS）引擎，从复杂的视频翻译系统重构为专门的语音合成服务。通过简化架构和并行优化，实现了高性能、高质量的TTS处理。

### 核心特性
- **IndexTTS集成**: 基于先进的IndexTTS v0.1.4模型
- **真正并行架构**: 三阶段流水线并行处理
- **智能音频处理**: 语音分离、音频切分、语音克隆
- **云原生设计**: 与Cloudflare D1/R2深度集成
- **HLS流媒体**: 实时流媒体输出支持

## 🏗️ 系统架构

### 核心技术栈
- **Web框架**: FastAPI + Uvicorn
- **TTS模型**: IndexTTS v0.1.4 (PyTorch)
- **数据存储**: Cloudflare D1 (SQLite兼容)
- **文件存储**: Cloudflare R2 (S3兼容)
- **音频处理**: PyDub + ONNX Runtime
- **视频处理**: FFmpeg
- **并发处理**: AsyncIO + 流水线架构

### 组件架构

```
┌─────────────────────────────────────────────────────────────┐
│                    WaveShift TTS Engine                     │
├─────────────────────────────────────────────────────────────┤
│  Entry Points:                                             │
│  • app.py          - 主应用入口                             │
│  • api.py          - FastAPI REST接口                      │
│  • launcher.py     - 服务初始化器                           │
├─────────────────────────────────────────────────────────────┤
│  Core Services:                                            │
│  • DataFetcher     - 数据获取与预处理                       │
│  • MyIndexTTS      - TTS语音合成引擎                        │
│  • DurationAligner - 时长对齐与文本简化                     │
│  • MediaMixer      - 音视频混合                            │
│  • HLSManager      - HLS流媒体管理                         │
│  • MainOrchestrator- 主流程编排器                          │
├─────────────────────────────────────────────────────────────┤
│  External Integrations:                                    │
│  • Cloudflare D1   - 转录数据存储                          │
│  • Cloudflare R2   - 媒体文件存储                          │
│  • Translation AI - 文本简化服务                           │
│  • VocalSeparator  - 音频分离                              │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 完整数据流程

### 系统输入
1. **任务ID** - 唯一标识处理任务
2. **D1数据库** - 转录文本、时间戳、说话人信息
3. **R2存储** - 原始音频文件、静音视频文件

### 核心处理流程

#### 阶段1: 数据获取与预处理 (DataFetcher)
```
输入: task_id
├── 并行D1查询
│   ├── 获取转录片段 (transcription_segments)
│   └── 获取媒体路径 (media_tasks)
├── 音频处理链
│   ├── 异步下载音频文件 (R2Client)
│   └── 音频分离 (VocalSeparator) - 可选
│       ├── 人声分离 (vocals.wav)
│       └── 背景音分离 (instrumental.wav)
│   
│   注意：音频切分功能已由 audio-segment-worker 服务实现
└── 视频下载 (后台任务)
    └── 异步下载静音视频
```

#### 阶段2: TTS流式处理 (三阶段并行流水线)
```
流水线架构:
┌────────────────┐  队列1   ┌─────────────────┐  队列2   ┌──────────────────┐
│  TTS Producer  │ ──────→ │ Align&Adjust    │ ──────→ │  Media Composer  │
│  音频生成      │         │ 时长优化        │         │  媒体合成        │
└────────────────┘         └─────────────────┘         └──────────────────┘
```

**TTS Producer**: 批量处理句子、IndexTTS模型推理、语音克隆音频生成  
**Align & Adjust**: 时长对齐、超速句子检测与文本简化、时间戳调整  
**Media Composer**: 音视频混合、HLS分段生成、并行上传到R2

#### 阶段3: HLS流媒体输出
```
HLS处理流程:
├── 分段生成 (segment_*.mp4)
├── 播放列表更新 (.m3u8)
├── 并行上传到R2
│   ├── 分段文件上传
│   └── 播放列表上传
├── 最终合并
│   ├── 视频分段拼接
│   └── 完整视频生成
└── 数据库状态更新
```

### 系统输出
1. **HLS播放列表** - 实时流媒体播放
2. **完整视频文件** - 最终合并的MP4文件  
3. **任务状态更新** - D1数据库状态同步

## 🚀 快速部署

### 1. 环境准备

```bash
# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置必要参数
```

### 2. 启动服务

```bash
# 直接启动
python app.py

# 或使用启动脚本
bash start.sh
```

### 3. 验证部署

```bash
# 健康检查
curl http://localhost:8000/api/health

# 启动TTS任务
curl -X POST http://localhost:8000/api/start_tts \
  -H "Content-Type: application/json" \
  -d '{"task_id": "your-task-id"}'
```

## ⚙️ 配置说明

### 环境变量

在 `.env` 文件中配置必要参数：

```bash
# Cloudflare 配置
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_D1_DATABASE_ID=your_database_id
CLOUDFLARE_R2_ACCESS_KEY_ID=your_r2_access_key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your_r2_secret_key
CLOUDFLARE_R2_BUCKET_NAME=your_bucket_name

# AI 模型配置 (用于文本简化)
TRANSLATION_MODEL=deepseek  # 支持: deepseek/gemini/grok/groq
DEEPSEEK_API_KEY=your_deepseek_key  # 对应模型的API密钥

# 音频分离配置
ENABLE_VOCAL_SEPARATION=true
VOCAL_SEPARATION_MODEL=Kim_Vocal_2.onnx
VOCAL_SEPARATION_OUTPUT_FORMAT=WAV
VOCAL_SEPARATION_SAMPLE_RATE=24000

# TTS 配置
SAVE_TTS_AUDIO=true         # 保存TTS生成的音频
CLEANUP_TEMP_FILES=false    # 保留临时文件用于调试
TTS_BATCH_SIZE=3           # TTS批处理大小
TARGET_SR=24000            # 目标采样率

# HLS 配置
ENABLE_HLS_STORAGE=true     # 启用R2存储
CLEANUP_LOCAL_HLS_FILES=false
```

## 🚀 核心优化特性

### 1. 真正并行处理架构
- **数据获取阶段**: D1查询、音频下载、视频下载真正并行
- **TTS处理阶段**: 三阶段流水线并行，最大化资源利用
- **上传阶段**: 后台队列式并行上传到R2

### 2. 智能音频处理
- **语音分离**: Kim_Vocal_2.onnx模型分离人声与背景音
- **智能切分**: 基于说话人分组的音频切片优化
- **语音克隆**: 为每个说话人生成专属音频样本

### 3. 高级TTS功能
- **时长自适应**: 自动对齐TTS输出与原始时间轴
- **文本简化**: AI驱动的超速句子文本优化
- **流式生成**: 批量异步TTS处理

### 4. 企业级可靠性
- **错误恢复**: 多层级降级策略
- **资源管理**: 智能内存清理和GPU缓存管理
- **状态追踪**: 完整的任务状态生命周期管理

## 📊 性能特征

### 处理能力
- **TTS处理速度**: 实时4-6倍速度
- **并发处理**: 支持多任务并行处理
- **内存优化**: 滑动窗口缓冲区管理
- **GPU加速**: CUDA自动检测与优化

### 扩展性设计
- **模块化架构**: 松耦合服务设计
- **异步优先**: 全流程异步处理
- **配置驱动**: 丰富的环境变量配置
- **监控友好**: 详细的日志和性能指标

## 📊 API接口

启动服务后，可通过以下接口访问：

```bash
# 基础URL (默认: http://localhost:8000)
BASE_URL="http://localhost:8000"

# 健康检查
curl "${BASE_URL}/api/health"

# 启动TTS任务
curl -X POST "${BASE_URL}/api/start_tts" \
  -H "Content-Type: application/json" \
  -d '{"task_id": "your-task-id"}'

# 查询任务状态
curl "${BASE_URL}/api/task/{task_id}/status"
```

### API 响应示例

```json
// 启动任务响应
{
  "status": "processing",
  "task_id": "d8a62769-4bc3-490c-90c2-0991b418344a",
  "message": "TTS合成流程已开始"
}

// 任务状态响应
{
  "task_id": "d8a62769-4bc3-490c-90c2-0991b418344a",
  "status": "completed",
  "hls_playlist_url": "https://pub-xxx.r2.dev/hls/task_id/playlist.m3u8"
}
```

## 🔧 开发指南

### 项目结构

```
waveshift-tts-engine/
├── app.py                    # 主应用入口
├── api.py                    # FastAPI REST接口
├── launcher.py               # 服务初始化器
├── orchestrator.py           # 主流程编排器
├── config.py                 # 配置管理
├── core/                     # 核心服务模块
│   ├── data_fetcher.py       # 数据获取与预处理
│   ├── audio_segmenter.py    # 智能音频切分
│   ├── my_index_tts.py       # TTS语音合成引擎
│   ├── timeadjust/           # 时长对齐模块
│   ├── media_mixer.py        # 音视频混合
│   ├── hls_manager.py        # HLS流媒体管理
│   ├── cloudflare/           # Cloudflare集成
│   └── translation/          # 文本简化服务
├── utils/                    # 工具函数
├── models/                   
│   ├── IndexTTS/             # IndexTTS模型
│   └── audio-separator-models/ # 音频分离模型
└── requirements.txt          # 依赖列表
```

### 关键技术实现

#### 1. IndexTTS集成
```python
# core/my_index_tts.py
async def generate_audio_stream(self, sentences, path_manager):
    for sentence in sentences:
        # 语音克隆推理
        res = await asyncio.to_thread(
            self.tts_model.infer,
            sentence.audio,  # 语音样本
            sentence.translated_text,  # 目标文本
            None, False
        )
```

#### 2. 并行数据获取
```python
# core/data_fetcher.py
async def fetch_task_data(self, task_id, path_manager):
    # 阶段1: 并行D1查询
    sentences_task = asyncio.create_task(get_sentences())
    media_paths_task = asyncio.create_task(get_media_paths())
    
    # 阶段2: 真正并行媒体处理
    audio_task = asyncio.create_task(audio_processing_chain())
    video_task = asyncio.create_task(video_download())
```

#### 3. 三阶段流水线
```python
# orchestrator.py
async def _process_tts_stream(self, task_id, sentences, ...):
    tts_queue = asyncio.Queue(maxsize=20)
    aligned_queue = asyncio.Queue(maxsize=20)
    
    # 三个并行任务
    tts_task = asyncio.create_task(tts_producer())
    preprocess_task = asyncio.create_task(align_and_adjust())
    compose_task = asyncio.create_task(media_composer())
```

## 🔍 故障排查

### 常见问题

**Q: IndexTTS模型加载失败**
```bash
# 检查模型文件
ls models/IndexTTS/checkpoints/
# 确保包含: config.yaml, gpt.pth, dvae.pth, bigvgan_*.pth
```

**Q: GPU内存不足**
```bash
# 调整批处理大小
TTS_BATCH_SIZE=1  # 在 .env 中设置
```

**Q: Cloudflare连接失败**
```bash
# 检查配置
echo $CLOUDFLARE_API_TOKEN
# 验证权限和网络连接
```

## 🎯 系统优势

### 1. 高性能架构
- 真正的并行处理架构，避免阻塞等待
- 流水线式处理，资源利用率最大化
- 智能缓存和内存管理

### 2. 高质量输出
- IndexTTS先进语音合成技术
- 基于AI的文本优化
- 专业级音频处理

### 3. 高可靠性
- 多层错误处理和恢复机制
- 完整的状态追踪和监控
- 云原生架构设计

### 4. 高扩展性
- 模块化微服务架构
- 配置驱动的灵活性
- 支持水平扩展

---

**WaveShift TTS Engine** - 现代AI语音处理系统的最佳实践，通过精心设计的并行架构和优化算法，实现高性能、高质量的TTS服务。