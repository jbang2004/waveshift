import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class AudioSegmentContainer extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
	
	// 🎯 简化Container：去掉fetch转发，直接使用默认行为
	// Rust Hyper服务将直接处理Container的默认请求
	override onStart() {
		console.log('🚀 AudioSegment Container started - Standard实例');
	}
	
	override onStop() {
		console.log('⏹️ AudioSegment Container stopped');
	}
	
	override onError(error: unknown) {
		console.error('❌ AudioSegment Container error:', error);
	}
}

// DenoiseContainer已移除 - 降噪功能已迁移至tts-engine备份