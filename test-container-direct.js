// 直接测试容器是否可用的脚本
const testRequest = {
  audioKey: 'test/sample.mp3',
  transcripts: [
    {
      sequence: 1,
      start: '0m0s0ms',
      end: '0m3s0ms',
      speaker: 'TestSpeaker',
      original: '测试音频片段',
      translation: 'Test audio segment',
      content_type: 'speech'
    }
  ],
  goalDurationMs: 10000,
  minDurationMs: 3000,
  paddingMs: 500,
  outputPrefix: 'test/output'
};

// 发送POST请求测试
fetch('https://waveshift-audio-segment-worker.jbang20042004.workers.dev/segment', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testRequest)
})
.then(response => response.json())
.then(data => {
  console.log('响应数据:', JSON.stringify(data, null, 2));
  
  if (data.error && data.error.includes('Container')) {
    console.log('\n状态: 容器尚未就绪');
  } else if (data.success) {
    console.log('\n状态: 服务正常运行');
    if (data.segments && data.segments[0] && data.segments[0].audioKey.includes('mock_')) {
      console.log('模式: 模拟数据模式');
    } else {
      console.log('模式: 真实数据处理模式');
    }
  }
})
.catch(error => {
  console.error('请求失败:', error);
});