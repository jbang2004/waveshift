import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class FFmpegContainerV2 extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';

	override onStart() {
		console.log('🚀 FFmpeg Container V2 started - Standard实例');
	}
	
	override onStop() {
		console.log('⏹️ FFmpeg Container V2 stopped');
	}
	
	override onError(error: unknown) {
		console.error('❌ FFmpeg Container V2 error:', error);
	}

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
}