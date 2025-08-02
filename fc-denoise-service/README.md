# FC降噪服务

基于ModelScope ZipEnhancer模型的音频降噪服务，部署在阿里云函数计算(FC)平台。

## 特性

- 🚀 **高性能**: 11x实时处理速度
- 📦 **轻量级**: 仅30行代码实现
- 🔒 **离线部署**: 本地模型，无需网络下载
- ⚡ **资源优化**: 1GB内存，0.5 vCPU即可运行

## 技术栈

- Python 3.10
- ModelScope AI框架
- ZipEnhancer降噪模型
- 阿里云函数计算3.0

## 部署

```bash
# 一键部署
./deploy.sh
```

## API接口

FC自定义容器提供HTTP接口：

### 健康检查
```bash
GET /health

# 示例
curl -X GET "https://fc-deno-service-ppbixyajpa.ap-southeast-1.fcapp.run/health"

# 响应
{
  "status": "healthy",
  "service": "fc-denoise",
  "model": "ZipEnhancer"
}
```

### 音频降噪
```bash
POST /
Content-Type: audio/wav

# 示例
curl -X POST "https://fc-deno-service-ppbixyajpa.ap-southeast-1.fcapp.run/" \
  -H "Content-Type: audio/wav" \
  --data-binary @test/test_audio.wav \
  --output denoised.wav

# 响应
- 成功：返回降噪后的音频文件
- 失败：返回JSON错误信息
```

## 项目结构

```
├── src/
│   ├── fc_denoise.py      # 降噪核心逻辑 (30行)
│   └── server.py          # HTTP服务器
├── models/                 # 本地模型文件
│   ├── configuration.json
│   └── pytorch_model.bin
├── requirements.txt        # 依赖配置 (3个包)
├── Dockerfile             # 容器配置
├── s.yaml                 # FC部署配置
└── deploy.sh              # 部署脚本
```