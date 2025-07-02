import { Container } from '@cloudflare/containers';
import { Env } from './types';

export class FFmpegContainerV2 extends Container {
	override defaultPort = 8080;
	override sleepAfter = '3m';

	override onStart() {
		console.log('🚀 FFmpeg Container V2 started - 监听端口 8080');
		console.log('📋 容器配置: standard实例, 4GB内存, 最大5个实例');
	}
	
	override onStop() {
		console.log('⏹️ FFmpeg Container V2 stopped');
	}
	
	override onError(error: unknown) {
		console.error('❌ FFmpeg Container V2 error:', error);
		
		// 详细错误信息
		if (error instanceof Error) {
			console.error('错误消息:', error.message);
			console.error('错误堆栈:', error.stack);
		}
		
		// 常见错误排查提示
		console.log('🔍 常见问题排查:');
		console.log('1. 检查Rust应用是否正确监听8080端口');
		console.log('2. 检查FFmpeg二进制是否存在并可执行');
		console.log('3. 检查LD_LIBRARY_PATH环境变量');
		console.log('4. 检查Container镜像是否构建成功');
	}

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		console.log('🔧 FFmpeg Container V2 构造函数调用');
	}
}