#!/bin/bash

# 测试音频切分服务是否能处理真实数据

echo "测试音频切分服务..."

# 创建测试请求数据
cat > test-request.json << 'EOF'
{
  "audioKey": "test/audio.mp3",
  "transcripts": [
    {
      "sequence": 1,
      "start": "0m0s0ms",
      "end": "0m5s0ms",
      "speaker": "Speaker1",
      "original": "这是第一句话",
      "translation": "This is the first sentence",
      "content_type": "speech"
    },
    {
      "sequence": 2,
      "start": "0m5s500ms",
      "end": "0m10s0ms",
      "speaker": "Speaker1",
      "original": "这是第二句话",
      "translation": "This is the second sentence",
      "content_type": "speech"
    }
  ],
  "goalDurationMs": 10000,
  "minDurationMs": 3000,
  "paddingMs": 500,
  "outputPrefix": "test/segments"
}
EOF

# 发送测试请求
echo "发送测试请求到音频切分服务..."
curl -X POST https://waveshift-audio-segment-worker.jbang20042004.workers.dev/segment \
  -H "Content-Type: application/json" \
  -d @test-request.json \
  | jq

# 清理
rm test-request.json

echo "测试完成！"