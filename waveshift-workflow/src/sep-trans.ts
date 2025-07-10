import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env, SepTransWorkflowParams } from './types/env.d';
import { updateMediaTaskStatus, updateMediaTaskUrls, createTranscription, completeMediaTask, setMediaTaskError, updateTranscriptionTotalSegments } from './utils/database';
import { createMediaUrlManager } from './utils/url-utils';
import { 
  initRealtimeMergeState, 
  processSegmentRealtime, 
  storeSegmentToD1, 
  TranscriptionSegment,
  RealtimeMergeState 
} from './utils/transcription-merger';

export class SepTransWorkflow extends WorkflowEntrypoint<Env, SepTransWorkflowParams> {
	async run(event: WorkflowEvent<SepTransWorkflowParams>, step: WorkflowStep) {
		const env = this.env;
		const { originalFile, fileType, options } = event.payload;
		const taskId = event.instanceId;
		
		console.log(`开始 SepTransWorkflow 任务: ${taskId}, 文件类型: ${fileType}`);
		
		try {
			// 步骤0: 更新任务状态为分离中
			await step.do("update-status-separating", async () => {
				console.log(`步骤0: 更新任务状态为分离中 ${taskId}`);
				await updateMediaTaskStatus(env, taskId, 'separating', 10);
			});
			
			// 步骤1: 音视频分离 (委托给 ffmpeg-worker)
			const { audioUrl, videoUrl, audioKey } = await step.do("separate-media", async () => {
				console.log(`步骤1: 开始音视频分离 ${taskId}`);
				
				// 从原始文件路径中提取userId（格式: users/{userId}/{taskId}/original.{ext}）
				const pathParts = originalFile.split('/');
				const userId = pathParts[1];
				
				// 定义输出文件路径（保存在同一目录下）
				const audioOutputKey = `users/${userId}/${taskId}/audio.aac`;
				const videoOutputKey = `users/${userId}/${taskId}/video.mp4`;
				
				// 调用 ffmpeg-worker (Service Binding)
				const result = await env.FFMPEG_SERVICE.separate({
					inputKey: originalFile,
					audioOutputKey,
					videoOutputKey
				});
				
				// 使用统一的URL管理器生成公共URL
				const urlManager = createMediaUrlManager(env.R2_PUBLIC_DOMAIN);
				const audioUrl = urlManager.buildPublicUrl(audioOutputKey);
				const videoUrl = urlManager.buildPublicUrl(videoOutputKey);
				
				// 更新数据库 (存储相对路径而非完整URL)
				await updateMediaTaskUrls(env, taskId, audioOutputKey, videoOutputKey);
				await updateMediaTaskStatus(env, taskId, 'transcribing', 40);
				
				console.log(`音视频分离完成 - 视频: ${videoUrl}, 音频: ${audioUrl}`);
				console.log(`文件大小 - 视频: ${result.videoSize} bytes, 音频: ${result.audioSize} bytes`);
				
				return { 
					audioKey: audioOutputKey, 
					videoKey: videoOutputKey,
					audioUrl,
					videoUrl
				};
			});
			
			// 步骤2: 实时转录和存储
			const transcriptionResult = await step.do("realtime-transcribe-and-store", async (): Promise<any> => {
				console.log(`步骤2: 开始实时音频转录和存储，语言: ${options.targetLanguage}`);
				
				// 1. 提前创建转录记录
				const transcriptionId = await createTranscription(
					env,
					taskId,
					options.targetLanguage,
					options.style || 'normal',
					{
						startTime: new Date().toISOString()
					}
				);
				console.log(`✅ 创建转录记录: ${transcriptionId}`);
				
				// 2. 初始化实时合并状态
				const mergeState: RealtimeMergeState = initRealtimeMergeState(transcriptionId, options.targetLanguage);
				
				// 3. 获取音频数据并发送转录请求
				const audioObject = await env.MEDIA_STORAGE.get(audioKey);
				if (!audioObject) {
					throw new Error(`R2 音频对象未找到: ${audioKey}`);
				}
				const audioData = await audioObject.arrayBuffer();
				console.log(`音频读取完成，大小: ${audioData.byteLength} bytes`);
				
				// 4. 发送转录请求
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

				// 5. 实时处理SSE流
				const reader = result.body?.getReader();
				if (!reader) {
					throw new Error('无法读取转录服务响应流');
				}

				const decoder = new TextDecoder();
				let metadata: any = null;

				// 时间格式解析函数: "XmYsZms" -> 毫秒数
				const parseTimeToMs = (timeStr: string): number => {
					const match = timeStr.match(/(\d+)m(\d+)s(\d+)ms/);
					if (!match) return 0;
					const [, minutes, seconds, ms] = match;
					return parseInt(minutes) * 60000 + parseInt(seconds) * 1000 + parseInt(ms);
				};

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
										console.log(`🎯 开始实时转录处理: ${metadata.fileName}`);
									} else if (data.type === 'segment') {
										// 构造转录片段
										const segment: TranscriptionSegment = {
											sequence: data.segment.sequence,
											start_ms: parseTimeToMs(data.segment.start || '0m0s0ms'),
											end_ms: parseTimeToMs(data.segment.end || '0m0s0ms'),
											content_type: data.segment.content_type || 'speech',
											speaker: data.segment.speaker || 'unknown',
											original_text: data.segment.original || '',
											translated_text: data.segment.translation || ''
										};
										
										// 🔥 核心改进：实时处理每个片段
										await processSegmentRealtime(env, mergeState, segment);
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

				// 6. 处理最后一个待合并的组
				if (mergeState.currentGroup) {
					await storeSegmentToD1(env, mergeState.transcriptionId, mergeState.currentGroup, ++mergeState.lastStoredSequence);
					console.log(`💾 存储最后一个合并组: sequence=${mergeState.lastStoredSequence}`);
				}

				// 7. 更新转录记录的总片段数
				await updateTranscriptionTotalSegments(env, transcriptionId, mergeState.lastStoredSequence);
				
				// 8. 更新任务状态
				await updateMediaTaskStatus(env, taskId, 'completed', 90);
				
				console.log(`✅ 实时转录完成: ID=${transcriptionId}, 最终片段数=${mergeState.lastStoredSequence}`);
				
				return {
					transcriptionId,
					totalSegments: mergeState.lastStoredSequence,
					metadata
				};
			});
			
			// 步骤3: 清理临时文件（原始文件保留在videos桶）
			await step.do("cleanup", async () => {
				console.log(`步骤3: 清理完成，保留原始文件: ${originalFile}`);
				// 不删除原始文件，保留在videos桶中供用户下载
			});
			
			// 步骤4: 更新最终状态
			await step.do("finalize", async () => {
				console.log(`步骤4: 任务完成 ${taskId}`);
				
				await completeMediaTask(env, taskId, true);
				
				console.log(`SepTransWorkflow 成功完成: ${taskId}`);
			});
			
			// 步骤5: 通知 Frontend 完成（如果有 FRONTEND_SERVICE binding）
			await step.do("notify-frontend", async () => {
				if (env.FRONTEND_SERVICE) {
					console.log(`步骤5: 通知 Frontend 任务完成 ${taskId}`);
					
					const result = {
						videoUrl,
						audioUrl,
						transcription: {
							targetLanguage: options.targetLanguage,
							style: options.style || 'normal',
							model: transcriptionResult.metadata?.model,
							segments: transcriptionResult.segments,
							metadata: transcriptionResult.metadata,
						},
					};
					
					try {
						await env.FRONTEND_SERVICE.fetch(
							new Request('https://frontend/api/workflow/callback', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'x-workflow-auth': env.WORKFLOW_CALLBACK_SECRET || 'default-secret',
								},
								body: JSON.stringify({
									taskId,
									status: 'completed',
									result,
								}),
							})
						);
						console.log(`Frontend 通知发送成功: ${taskId}`);
					} catch (callbackError) {
						console.error(`Frontend 通知失败: ${taskId}`, callbackError);
						// 回调失败不影响主流程
					}
				}
			});
			
		} catch (error: any) {
			console.error(`SepTransWorkflow 失败: ${taskId}`, error);
			
			// 更新任务状态为失败
			await step.do("mark-failed", async () => {
				await setMediaTaskError(env, taskId, error.message, error.stack);
			});
			
			// 通知 Frontend 失败（如果有 FRONTEND_SERVICE binding）
			await step.do("notify-frontend-error", async () => {
				if (env.FRONTEND_SERVICE) {
					console.log(`通知 Frontend 任务失败 ${taskId}`);
					
					try {
						await env.FRONTEND_SERVICE.fetch(
							new Request('https://frontend/api/workflow/callback', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'x-workflow-auth': env.WORKFLOW_CALLBACK_SECRET || 'default-secret',
								},
								body: JSON.stringify({
									taskId,
									status: 'failed',
									error: {
										message: error.message,
										stack: error.stack,
									},
								}),
							})
						);
						console.log(`Frontend 错误通知发送成功: ${taskId}`);
					} catch (callbackError) {
						console.error(`Frontend 错误通知失败: ${taskId}`, callbackError);
					}
				}
			});
			
			throw error;
		}
	}
}