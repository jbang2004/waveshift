import { WorkerEntrypoint } from 'cloudflare:workers';
import { getRandom } from '@cloudflare/containers';
import { Env, SeparateParams, SeparateResult } from './types';

// 导出容器类
export { FFmpegContainer } from './container';

const CONTAINER_INSTANCE_COUNT = 3;

export class FFmpegWorker extends WorkerEntrypoint<Env> {
	/**
	 * 音视频分离服务
	 * @param params 分离参数
	 * @returns 分离结果
	 */
	async separate(params: SeparateParams): Promise<SeparateResult> {
		console.log(`FFmpeg分离请求: 输入=${params.inputKey}, 音频输出=${params.audioOutputKey}, 视频输出=${params.videoOutputKey}`);
		
		try {
			// 1. 从统一存储桶读取原始文件
			const originalData = await this.env.MEDIA_STORAGE.get(params.inputKey);
			if (!originalData) {
				throw new Error(`原始文件未找到: ${params.inputKey}`);
			}
			
			console.log(`原始文件读取成功，大小: ${originalData.size} bytes`);
			
			// 2. 获取容器实例
			const container = await getRandom(this.env.FFMPEG_CONTAINER as any, CONTAINER_INSTANCE_COUNT);
			
			// 3. 调用 FFMPEG 处理 - 发送原始二进制数据
			const videoBuffer = await originalData.arrayBuffer();
			
			const response = await container.fetch(new Request('https://ffmpeg/', {
				method: 'POST',
				headers: {
					'Content-Type': 'video/mp4',
					'Content-Length': videoBuffer.byteLength.toString()
				},
				body: videoBuffer
			}));
			
			if (!response.ok) {
				throw new Error(`容器处理失败: ${response.status} ${response.statusText}`);
			}
			
			// 4. 解析处理结果
			const resultData = await response.formData();
			const videoFileRaw = resultData.get('video');
			const audioFileRaw = resultData.get('audio');
			
			if (!videoFileRaw || !audioFileRaw) {
				throw new Error('容器返回数据缺少视频或音频文件');
			}
			
			// 类型检查：确保是 File 对象
			if (typeof videoFileRaw === 'string' || typeof audioFileRaw === 'string') {
				throw new Error('容器返回的数据格式不正确，期望 File 对象');
			}
			
			const videoFile = videoFileRaw as File;
			const audioFile = audioFileRaw as File;
			
			console.log(`FFMPEG处理完成 - 视频大小: ${videoFile.size}, 音频大小: ${audioFile.size}`);
			
			// 5. 存储到统一存储桶
			await Promise.all([
				this.env.MEDIA_STORAGE.put(params.audioOutputKey, audioFile, {
					httpMetadata: {
						contentType: 'audio/aac',
						cacheControl: 'public, max-age=31536000, immutable'
					}
				}),
				this.env.MEDIA_STORAGE.put(params.videoOutputKey, videoFile, {
					httpMetadata: {
						contentType: 'video/mp4',
						cacheControl: 'public, max-age=31536000, immutable'
					}
				})
			]);
			
			console.log(`文件存储完成 - 音频: ${params.audioOutputKey}, 视频: ${params.videoOutputKey}`);
			
			return {
				audioKey: params.audioOutputKey,
				videoKey: params.videoOutputKey,
				audioSize: audioFile.size,
				videoSize: videoFile.size
			};
			
		} catch (error) {
			console.error('FFmpeg分离失败:', error);
			throw error;
		}
	}
}

// 默认导出（用于向后兼容）
export default FFmpegWorker;