import { WorkflowEntrypoint, WorkflowStep, WorkflowEvent } from 'cloudflare:workers';
import { Env, SepTransWorkflowParams } from './types/env.d';
import { updateMediaTaskStatus, updateMediaTaskUrls, createTranscription, completeMediaTask, setMediaTaskError, updateTranscriptionTotalSegments, markLastTranscriptionSegment } from './utils/database';
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
			
			// 步骤2: 创建转录记录（为并行处理准备）
			const transcriptionId = await step.do("create-transcription", async () => {
				const id = await createTranscription(
					env,
					taskId,
					options.targetLanguage,
					options.style || 'normal',
					{ startTime: new Date().toISOString() }
				);
				console.log(`📝 创建转录记录: ${id}`);
				return id;
			});
			
			// 🔥 步骤3: 并行处理 - 同时启动转录和音频切分
			const parallelStartTime = Date.now();
			console.log(`🚀 开始并行处理: 转录 + 音频切分`);
			
			const [transcriptionResult, audioSegmentResult] = await Promise.all([
				// 3a. 转录服务（流式写入D1）
				step.do("realtime-transcribe", async () => {
					console.log(`🎙️ 启动转录服务...`);
					return await this.runTranscription(env, {
						audioKey,
						transcriptionId,
						options,
						taskId
					});
				}),
				
				// 3b. 音频切分服务（轮询D1）
				step.do("watch-audio-segment", async () => {
					// 给转录服务一点启动时间，避免空轮询
					console.log(`⏳ 等待3秒后启动音频切分...`);
					await new Promise(resolve => setTimeout(resolve, 3000));
					
					console.log(`✂️ 启动音频切分服务...`);
					const pathParts = originalFile.split('/');
					const userId = pathParts[1];
					const outputPrefix = `users/${userId}/${taskId}/audio-segments`;
					
					return await env.AUDIO_SEGMENT_SERVICE.watch({
						audioKey,
						transcriptionId,
						outputPrefix,
						taskId
					});
				})
			]);
			
			const parallelDuration = Date.now() - parallelStartTime;
			console.log(`✅ 并行处理完成，耗时: ${parallelDuration}ms`);
			
			// 步骤4: 完成处理
			await step.do("finalize", async () => {
				await completeMediaTask(env, taskId, true);
				const totalDuration = Date.now() - parallelStartTime;
				console.log(`📊 处理统计:`);
				console.log(`  - 总耗时: ${totalDuration}ms`);
				console.log(`  - 并行处理耗时: ${parallelDuration}ms`);
				console.log(`  - 转录片段数: ${transcriptionResult.totalSegments}`);
				console.log(`  - 音频切片数: ${audioSegmentResult.segmentCount}`);
				console.log(`  - 视频URL: ${videoUrl}`);
				console.log(`  - 音频URL: ${audioUrl}`);
			});
			
				
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
				
				// 🔥 收集所有已存储的segments
				const allStoredSegments: TranscriptionSegment[] = [];

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
											original: data.segment.original || '',
											translation: data.segment.translation || ''
										};
										
										// 🔥 核心改进：实时处理每个片段
										const storedSegment = await processSegmentRealtime(env, mergeState, segment);
										
										// 🔥 收集已存储的segment（如果有）
										if (storedSegment) {
											allStoredSegments.push(storedSegment);
										}
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
					const isFirst = !mergeState.isFirstSegmentStored;
					await storeSegmentToD1(env, mergeState.transcriptionId, mergeState.currentGroup, ++mergeState.lastStoredSequence, isFirst);
					console.log(`💾 存储最后一个合并组: sequence=${mergeState.lastStoredSequence}, is_first=${isFirst}`);
					
					// 🔥 收集最后一个存储的segment
					allStoredSegments.push({
						...mergeState.currentGroup,
						sequence: mergeState.lastStoredSequence,
						is_first: isFirst,
						is_last: false
					});
				}

				// 7. 标记最后一个片段为 is_last=true
				if (mergeState.lastStoredSequence > 0) {
					await markLastTranscriptionSegment(env, transcriptionId);
					console.log(`🏁 标记最后片段完成: transcription_id=${transcriptionId}`);
					
					// 🔥 更新最后一个segment的is_last标记
					if (allStoredSegments.length > 0) {
						allStoredSegments[allStoredSegments.length - 1].is_last = true;
					}
				}

				// 8. 更新转录记录的总片段数
				await updateTranscriptionTotalSegments(env, transcriptionId, mergeState.lastStoredSequence);
				
				// 9. 更新任务状态
				await updateMediaTaskStatus(env, taskId, 'completed', 90);
				
				console.log(`✅ 实时转录完成: ID=${transcriptionId}, 最终片段数=${mergeState.lastStoredSequence}`);
				console.log(`📊 收集到 ${allStoredSegments.length} 个已存储的segments`);
				
				return {
					transcriptionId,
					totalSegments: mergeState.lastStoredSequence,
					metadata,
					segments: allStoredSegments  // 🔥 返回所有已存储的segments
				};
			});
			
			// 步骤3: 音频切分 (新增)
			const audioSegmentResult = await step.do("audio-segment", async () => {
				console.log(`步骤3: 开始音频切分 ${taskId}`);
				
				// 🔥 使用上一步收集的数据，避免查询D1
				if (!transcriptionResult.segments || transcriptionResult.segments.length === 0) {
					console.log(`跳过音频切分: 没有转录数据`);
					return { success: false, message: '没有转录数据' };
				}
				
				// 🔥 直接使用毫秒格式，消除冗余转换
				const transcripts = transcriptionResult.segments.map((segment: TranscriptionSegment) => ({
					sequence: segment.sequence,
					startMs: segment.start_ms,
					endMs: segment.end_ms,
					speaker: segment.speaker,
					original: segment.original,
					translation: segment.translation,
					content_type: segment.content_type
				}));
				
				console.log(`🎯 转录数据样本 (前3条):`, transcripts.slice(0, 3).map(t => ({
					sequence: t.sequence,
					timeRange: `${t.startMs}ms - ${t.endMs}ms`,
					speaker: t.speaker,
					text: t.original.substring(0, 30) + '...'
				})));
				
				console.log(`准备切分音频: 共 ${transcripts.length} 个转录片段`);
				
				// 3. 调用音频切分服务
				const pathParts = originalFile.split('/');
				const userId = pathParts[1];
				const outputPrefix = `users/${userId}/${taskId}/audio-segments`;
				
				const result = await env.AUDIO_SEGMENT_SERVICE.segment({
					audioKey: audioKey,
					transcripts,
					outputPrefix,
					transcriptionId: transcriptionResult.transcriptionId  // 🔧 修复：添加转录ID用于D1更新
					// 注意：切分参数现在通过环境变量配置：GAP_DURATION_MS, MAX_DURATION_MS, MIN_DURATION_MS
				});
				
				if (!result.success) {
					console.error(`音频切分失败: ${result.error}`);
					return { success: false, error: result.error };
				}
				
				console.log(`✅ 音频切分完成: 生成 ${result.segments?.length || 0} 个音频片段`);
				
				// 4. 将切分信息存储到数据库(可选)
				if (result.segments && result.segments.length > 0) {
					// 可以在这里存储音频片段信息到数据库
					console.log(`🎵 音频切片详情:`, result.segments.map(s => ({
						id: s.segmentId,
						speaker: s.speaker,
						duration: `${s.durationMs}ms`,
						sentences: s.sentences.length
					})));
				}
				
				return {
					success: true,
					segmentCount: result.segments?.length || 0,
					sentenceToSegmentMap: result.sentenceToSegmentMap
				};
			});
			
			// 步骤4: 清理临时文件（原始文件保留在videos桶）
			await step.do("cleanup", async () => {
				console.log(`步骤4: 清理完成，保留原始文件: ${originalFile}`);
				// 不删除原始文件，保留在videos桶中供用户下载
			});
			
			// 步骤5: 更新最终状态
			await step.do("finalize", async () => {
				console.log(`步骤5: 任务完成 ${taskId}`);
				
				await completeMediaTask(env, taskId, true);
				
				console.log(`SepTransWorkflow 成功完成: ${taskId}`);
			});
			
			// 步骤6: 完成日志
			await step.do("complete-logging", async () => {
				console.log(`步骤6: 工作流完成 ${taskId}`);
				console.log(`📊 结果统计: 视频=${videoUrl}, 音频=${audioUrl}, 转录片段=${transcriptionResult.totalSegments}, 音频切片=${audioSegmentResult.segmentCount}`);
			});
			
		} catch (error: any) {
			console.error(`SepTransWorkflow 失败: ${taskId}`, error);
			
			// 更新任务状态为失败
			await step.do("mark-failed", async () => {
				await setMediaTaskError(env, taskId, error.message, error.stack);
			});
			
			// 记录错误信息
			await step.do("log-error", async () => {
				console.error(`❌ 工作流失败详情 ${taskId}:`, {
					message: error.message,
					stack: error.stack?.substring(0, 500)
				});
			});
			
			throw error;
		}
	}
}