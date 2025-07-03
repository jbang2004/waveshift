import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class FFmpegContainer extends Container {
	override defaultPort = 8080;
	override sleepAfter = '5m';
	
	// 添加启动配置
	override async onReady(req: Request): Promise<Response> {
		console.log('🎯 Container Ready - 处理请求');
		return super.onReady(req);
	}

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