# 🎵 FC降噪服务 - 终极优化版

基于阿里云函数计算的ZipEnhancer音频降噪服务，经过完整性能测试优化的生产就绪版本。

## 🏆 核心优势

### **🚀 性能卓越**
- **处理时间**: 7.38秒平均处理时间
- **稳定性**: ±0.67秒低波动，高度稳定
- **配置**: 4 vCPU + 8GB内存的最优配置
- **成本效益**: 2.35x效益比，性能与成本完美平衡

### **🎯 技术特点**
- **ZipEnhancer ONNX模型**: 先进的音频降噪算法
- **线程优化**: intra=3, inter=2的精准配置
- **容器化部署**: Docker + 阿里云ACR
- **无服务器**: 函数计算自动扩缩容

## 📦 快速部署

### **1. 构建镜像**
```bash
# 使用代理构建
docker build --platform linux/amd64 --network host \
  --build-arg https_proxy=http://127.0.0.1:10808 \
  --build-arg http_proxy=http://127.0.0.1:10808 \
  -t fc-denoise:latest .

# 标记镜像
docker tag fc-denoise:latest \
  crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/fc-denoise:latest

# 推送到ACR
docker push crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/fc-denoise:latest
```

### **2. 创建FC函数**
在阿里云函数计算控制台：
- **函数名称**: fc-denoise-service
- **运行时**: 自定义容器
- **镜像地址**: `crpi-nw2oorfhcjjmm5o0.ap-southeast-1.personal.cr.aliyuncs.com/waveshifttts/fc-denoise:latest`
- **CPU**: 4 vCPU
- **内存**: 8192MB
- **触发器**: HTTP触发器（匿名访问）

### **3. 测试验证**
```bash
# 健康检查
curl -X GET "https://your-fc-endpoint/health"

# 降噪测试
curl -X POST "https://your-fc-endpoint/" \
  -H "Content-Type: audio/wav" \
  -H "X-Segment-Id: test-$(date +%s)" \
  -H "X-Speaker: test-speaker" \
  --data-binary @your-audio.wav \
  --output denoised-output.wav
```

## 🔧 配置说明

### **环境变量**
```bash
# 4 vCPU 终极优化配置
OMP_NUM_THREADS=4
MKL_NUM_THREADS=4
TORCH_NUM_THREADS=4
ORT_INTRA_OP_NUM_THREADS=3    # 主计算3线程
ORT_INTER_OP_NUM_THREADS=2    # 操作间2线程
CPU_CONFIG=4vcpu
PERFORMANCE_MODE=ultimate
```

### **API接口**

#### **降噪处理**
- **端点**: `POST /`
- **Content-Type**: `audio/wav`
- **请求头**:
  - `X-Segment-Id`: 音频片段ID
  - `X-Speaker`: 说话人标识
  - `X-Enable-Streaming`: false (固定)
  - `X-Input-Format`: binary (固定)

#### **健康检查**
- **端点**: `GET /health`
- **响应**: JSON格式的服务状态

#### **响应头**
- `x-processing-time`: 实际处理时间(秒)
- `x-denoise-applied`: 是否应用降噪
- `x-model-loaded`: 模型是否已加载
- `x-processing-success`: 处理是否成功

## ⚡ 性能基准

### **处理性能**
基于noisy_sample.wav测试数据：

| 指标 | 数值 | 说明 |
|------|------|------|
| 平均处理时间 | 7.38秒 | 排除冷启动 |
| 最佳处理时间 | 6.785秒 | 峰值性能 |
| 稳定性 | ±0.67秒 | 低波动 |
| 冷启动时间 | ~12秒 | 首次调用 |

### **成本效益分析**
- **相对成本**: 100% (4 vCPU基准)
- **效益比**: 2.35x (行业领先)
- **适用场景**: 商业化生产环境
- **推荐指数**: ⭐⭐⭐⭐⭐

## 🧬 技术架构

### **核心组件**
- **服务器**: FastAPI + Python 3.10
- **AI模型**: ZipEnhancer ONNX Runtime
- **音频处理**: soundfile + numpy
- **深度学习**: PyTorch CPU版本

### **优化策略**
1. **线程配置优化**: 基于大量测试确定的最优参数
2. **模型懒加载**: 首次请求时才加载模型，减少冷启动开销
3. **资源精确分配**: 3:2的intra/inter线程比例
4. **系统级优化**: OMP/MKL/TORCH线程协调

### **文件结构**
```
fc-denoise-service/
├── Dockerfile                 # 4vCPU终极优化配置
├── requirements-fixed.txt     # 完整Python依赖
├── s.yaml                    # Serverless Devs配置
├── src/
│   ├── fc_denoise_server.py          # FastAPI服务器
│   ├── zipenhancer_streaming.py      # 核心降噪处理
│   └── zipenhancer_streaming_flexible.py # 灵活配置版本
├── models/
│   └── speech_zipenhancer_ans_multiloss_16k_base/
│       ├── onnx_model.onnx          # ONNX模型文件
│       └── examples/noisy_sample.wav # 测试样本
├── test/
│   ├── test_denoise.py              # 功能测试
│   └── test_health.sh               # 健康检查脚本
└── README.md                        # 本文档
```

## 🛠️ 开发指南

### **本地开发**
```bash
# 安装依赖
pip install -r requirements-fixed.txt

# 启动服务
python src/fc_denoise_server.py

# 本地测试
curl -X POST "http://localhost:8000/" \
  -H "Content-Type: audio/wav" \
  --data-binary @models/speech_zipenhancer_ans_multiloss_16k_base/examples/noisy_sample.wav \
  --output local-test-output.wav
```

### **自定义配置**
修改Dockerfile中的环境变量：
```dockerfile
# 如需调整线程配置
ENV ORT_INTRA_OP_NUM_THREADS=3  # 主计算线程数
ENV ORT_INTER_OP_NUM_THREADS=2  # 操作间线程数

# CPU配置必须与FC函数配置匹配
ENV CPU_CONFIG=4vcpu
```

### **性能调优**
基于实际业务需求，可微调以下参数：
- **增加稳定性**: 降低inter线程数至1
- **提升性能**: 在6vCPU环境下调整为intra=5, inter=3
- **成本优化**: 在2vCPU环境下调整为intra=2, inter=1

## 🔍 故障排除

### **常见问题**

#### **1. 降噪不生效**
- **症状**: 输出音频与输入相同
- **原因**: AI依赖缺失
- **解决**: 确保使用`requirements-fixed.txt`

#### **2. 函数启动失败**
- **症状**: 412 Precondition Failed
- **原因**: 容器路径错误或模型缺失
- **解决**: 检查Dockerfile CMD路径和模型文件

#### **3. 处理时间过长**
- **症状**: 超过15秒处理时间
- **原因**: 线程配置不当或CPU不足
- **解决**: 验证FC函数vCPU配置与镜像环境变量匹配

### **调试命令**
```bash
# 检查容器健康状态
docker run --rm fc-denoise:latest python -c "import torch, onnxruntime; print('Dependencies OK')"

# 验证模型文件
docker run --rm fc-denoise:latest ls -la /app/models/

# 测试本地运行
docker run -p 8000:8000 fc-denoise:latest
```

## 📊 测试验证数据

### **历史测试结果**
经过完整的2/4/6/8 vCPU配置对比测试，4 vCPU终极配置脱颖而出：

| 配置 | 处理时间 | 成本效益比 | 推荐度 |
|------|----------|------------|--------|
| 2 vCPU极致 | 9.41s | 2.38x | 💰 成本首选 |
| **4 vCPU终极** | **7.38s** | **2.35x** | **🏆 推荐** |
| 6 vCPU平衡 | 6.88s | 1.83x | ⚖️ 高性能 |
| 8 vCPU最优 | 7.46s | 1.27x | 💸 性能过剩 |

**结论**: 4 vCPU配置在性能和成本间达到最佳平衡，适合绝大多数生产场景。

## 📝 更新日志

### v4.0 (最终版本)
- ✅ 确定4 vCPU终极配置为最优方案
- ✅ 精简项目结构，删除冗余配置
- ✅ 合并技术文档，提供完整部署指南
- ✅ 经过完整测试验证的生产就绪版本

### v3.0 - v3.9 (优化过程)
- 测试2/4/6/8 vCPU不同配置
- 优化ONNX Runtime线程参数
- 修复容器路径和依赖问题
- 性能基准测试和对比分析

### v1.0 - v2.9 (早期版本)
- 基础功能实现
- Docker容器化
- 阿里云FC部署

## 🤝 技术支持

### **联系方式**
- **项目**: WaveShift媒体处理平台
- **组件**: FC降噪服务
- **状态**: 生产就绪 ✅

### **相关服务**
- [waveshift-ffmpeg-worker](../waveshift-ffmpeg-worker/) - 音视频分离
- [waveshift-transcribe-worker](../waveshift-transcribe-worker/) - AI转录
- [waveshift-audio-segment-worker](../waveshift-audio-segment-worker/) - 音频切分
- [waveshift-workflow](../waveshift-workflow/) - 工作流编排

---

**🎯 这是经过完整优化测试的最终版本，可直接用于生产环境！**