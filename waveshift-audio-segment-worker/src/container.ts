import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class AudioSegmentContainer extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
	
	// 🎯 简化Container：去掉fetch转发，直接使用默认行为
	// Python FastAPI应用将直接处理Container的默认请求
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

export class DenoiseContainer extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
	
	// 🧠 降噪容器：Python FastAPI服务处理降噪请求
	override onStart() {
		console.log('🚀 Denoise Container started - ZipEnhancer降噪服务');
	}
	
	override onStop() {
		console.log('⏹️ Denoise Container stopped');
	}
	
	override onError(error: unknown) {
		console.error('❌ Denoise Container error:', error);
	}
}