import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env, SepTransWorkflowParams } from './types/env.d';
import { createTranscriptionTask, updateTranscriptionTaskUrls, updateTranscriptionTaskStatus, storeTranscriptionResult } from './utils/database';

export class SepTransWorkflow extends WorkflowEntrypoint<Env, SepTransWorkflowParams> {
	async run(event: WorkflowEvent<SepTransWorkflowParams>, step: WorkflowStep) {
		const env = this.env;
		const { originalFile, fileType, options } = event.payload;
		const taskId = event.instanceId;
		
		console.log(`开始 SepTransWorkflow 任务: ${taskId}, 文件类型: ${fileType}`);
		
		try {
			// 步骤0: 创建数据库任务记录
			await step.do("create-task", async () => {
				console.log(`步骤0: 创建数据库任务记录 ${taskId}`);
				// 先创建任务记录，音频和视频 URL 稍后更新
				await createTranscriptionTask(env, taskId, '', '');
			});
			
			// 步骤1: 音视频分离 (委托给 ffmpeg-worker)
			const { audioUrl, videoUrl, audioKey } = await step.do("separate-media", async () => {
				console.log(`步骤1: 开始音视频分离 ${taskId}`);
				
				// 定义输出文件键
				const audioOutputKey = `audio/${taskId}-audio.aac`;
				const videoOutputKey = `videos/${taskId}-silent.mp4`;
				
				// 调用 ffmpeg-worker (Service Binding)
				const result = await env.FFMPEG_SERVICE.separate({
					inputKey: originalFile,
					audioOutputKey,
					videoOutputKey
				});
				
				// 生成公共 URL (业务逻辑)
				const publicDomain = env.R2_PUBLIC_DOMAIN;
				const audioUrl = `https://${publicDomain}/${audioOutputKey}`;
				const videoUrl = `https://${publicDomain}/${videoOutputKey}`;
				
				// 更新数据库 (业务数据)
				await updateTranscriptionTaskUrls(env, taskId, audioUrl, videoUrl);
				
				console.log(`音视频分离完成 - 视频: ${videoUrl}, 音频: ${audioUrl}`);
				console.log(`文件大小 - 视频: ${result.videoSize} bytes, 音频: ${result.audioSize} bytes`);
				
				return { 
					audioKey: audioOutputKey, 
					videoKey: videoOutputKey,
					audioUrl,
					videoUrl
				};
			});
			
			// 步骤2: 自动转录
			const transcriptionResult = await step.do("transcribe-audio", async (): Promise<any> => {
					console.log(`步骤2: 开始音频转录，语言: ${options.targetLanguage}`);
					
					// 直接从 R2 读取音频对象，避免公网往返
					const audioObject = await env.SEPARATE_STORAGE.get(audioKey);
					if (!audioObject) {
						throw new Error(`R2 音频对象未找到: ${audioKey}`);
					}
					const audioData = await audioObject.arrayBuffer();
					console.log(`音频读取完成，大小: ${audioData.byteLength} bytes`);
					
					// 直接使用 Service Binding 调用转录服务
					const formData = new FormData();
					formData.append('file', new Blob([audioData], { type: 'audio/aac' }), 'audio.aac');
					formData.append('targetLanguage', options.targetLanguage);
					formData.append('style', options.style || 'normal');

					const result = await env.TRANSCRIBE_SERVICE.fetch(new Request('https://transcribe/transcribe', {
						method: 'POST',
						body: formData
					}));

					if (!result.ok) {
						throw new Error(`转录服务调用失败: ${result.status}`);
					}

					// 处理流式响应
					const reader = result.body?.getReader();
					if (!reader) {
						throw new Error('无法读取转录服务响应流');
					}

					const decoder = new TextDecoder();
					const segments: any[] = [];
					let metadata: any = null;

					try {
						while (true) {
							const { done, value } = await reader.read();
							if (done) break;

							const chunk = decoder.decode(value, { stream: true });
							const lines = chunk.split('\n');

							for (const line of lines) {
								if (line.startsWith('data: ')) {
									try {
										const data = JSON.parse(line.slice(6));

										if (data.type === 'start') {
											metadata = data.metadata;
										} else if (data.type === 'segment') {
											segments.push(data.segment);
										} else if (data.type === 'error') {
											throw new Error(`转录服务错误: ${data.error}`);
										}
									} catch (parseError) {
										// 忽略解析错误的行
									}
								}
							}
						}
					} finally {
						reader.releaseLock();
					}

					const transcriptionData = {
						metadata,
						segments,
						totalSegments: segments.length
					};
					
					console.log(`Service Binding 转录完成，共收集 ${transcriptionData.segments.length} 个片段`);
					return transcriptionData;
				});
				
				// 步骤3: 存储转录结果
				await step.do("store-transcription", async () => {
					console.log(`步骤3: 存储转录结果到数据库`);
					const metadata = {
						audioUrl,
						videoUrl,
						targetLanguage: options.targetLanguage,
						style: options.style || 'normal',
						processedAt: new Date().toISOString()
					};
					
					await storeTranscriptionResult(env, taskId, transcriptionResult, metadata);
					console.log(`转录结果已存储`);
				});
			
			// 步骤4: 清理临时文件
			await step.do("cleanup", async () => {
				console.log(`步骤4: 清理临时文件 ${originalFile}`);
				await env.SEPARATE_STORAGE.delete(originalFile);
			});
			
			// 步骤5: 更新最终状态
			await step.do("finalize", async () => {
				console.log(`步骤5: 任务完成 ${taskId}`);
				
				await updateTranscriptionTaskStatus(
					env, 
					taskId, 
					'completed', 
					new Date().toISOString()
				);
				
				console.log(`SepTransWorkflow 成功完成: ${taskId}`);
			});
			
		} catch (error: any) {
			console.error(`SepTransWorkflow 失败: ${taskId}`, error);
			
			// 更新任务状态为失败
			await step.do("mark-failed", async () => {
				await updateTranscriptionTaskStatus(env, taskId, 'failed');
			});
			
			throw error;
		}
	}
}