import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class FFmpegContainer extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';

	override onStart() {
		console.log('🚀 FFmpeg Container started - Standard实例');
	}
	
	override onStop() {
		console.log('⏹️ FFmpeg Container stopped');
	}
	
	override onError(error: unknown) {
		console.error('❌ FFmpeg Container error:', error);
	}

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
}