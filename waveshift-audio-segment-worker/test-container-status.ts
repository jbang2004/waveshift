// 测试脚本：检查容器是否已就绪
async function testContainerStatus() {
  const workerUrl = 'https://waveshift-audio-segment-worker.jbang20042004.workers.dev';
  
  console.log('检查音频切分服务状态...\n');
  
  // 1. 检查健康状态
  try {
    const healthResponse = await fetch(`${workerUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('健康检查:', healthData);
  } catch (error) {
    console.error('健康检查失败:', error);
  }
  
  // 2. 发送测试请求（通过Worker处理）
  console.log('\n发送测试请求...');
  
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
  
  try {
    // 模拟通过 Service Binding 调用
    console.log('请求数据:', JSON.stringify(testRequest, null, 2));
    
    // 注意：实际使用时需要通过 workflow 服务调用
    console.log('\n注意：真实数据处理需要通过 workflow 服务调用');
    console.log('当前容器状态可通过以下方式验证：');
    console.log('1. 上传视频到 workflow 前端');
    console.log('2. 查看 workflow 日志中的音频切分步骤');
    console.log('3. 如果容器已就绪，会看到真实的音频切分结果');
    console.log('4. 如果容器未就绪，会看到模拟数据返回');
    
  } catch (error) {
    console.error('测试请求失败:', error);
  }
}

// 运行测试
testContainerStatus();