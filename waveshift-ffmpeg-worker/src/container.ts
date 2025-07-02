import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class FFmpegContainerV2 extends Container {
	override defaultPort = 8080;
	override sleepAfter = '3m';

	override onStart() {
		console.log('FFmpeg Container started');
	}
	
	override onStop() {
		console.log('FFmpeg Container stopped');
	}
	
	override onError(error: unknown) {
		console.log('FFmpeg Container error:', error);
	}

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
	}
}