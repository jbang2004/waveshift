import { Hono, Context } from 'hono';
import { Env, ProcessingOptionsType } from './types/env.d';

// 应用常量
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/mov', 'video/x-matroska'];
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptionsType = {
	targetLanguage: 'chinese',
	style: 'normal'
};


// 导出 Workflow 类
export { SepTransWorkflow } from './sep-trans';

const app = new Hono<{ Bindings: Env }>();

// 查看处理结果（包含音视频和转录结果）
app.get('/result/:id', async (c: Context<{ Bindings: Env }>) => {
	const id = c.req.param('id');
	try {
		const videoUrl = `https://${c.env.R2_PUBLIC_DOMAIN}/processed/${id}-silent.mp4`;
		const audioUrl = `https://${c.env.R2_PUBLIC_DOMAIN}/processed/${id}-audio.aac`;
		
		// 检查文件是否存在
		const videoExists = await c.env.SEPARATE_STORAGE.head(`processed/${id}-silent.mp4`);
		const audioExists = await c.env.SEPARATE_STORAGE.head(`processed/${id}-audio.aac`);
		
		if (!videoExists || !audioExists) {
			return c.json({ error: 'Files not found' }, 404);
		}
		
		// 获取转录结果（使用前端的表结构）
		let transcription = null;
		try {
			// 获取媒体任务信息
			const taskResult = await c.env.DB.prepare(
				"SELECT * FROM media_tasks WHERE id = ?"
			).bind(id).first();
			
			if (taskResult && taskResult.transcriptionId) {
				// 获取转录任务信息
				const transcriptionResult = await c.env.DB.prepare(
					"SELECT * FROM transcriptions WHERE id = ?"
				).bind(taskResult.transcriptionId).first();
				
				if (transcriptionResult) {
					// 获取转录片段
					const segmentsResult = await c.env.DB.prepare(
						"SELECT sequence, start, end, contentType, speaker, original, translation FROM transcription_segments WHERE transcriptionId = ? ORDER BY sequence ASC"
					).bind(taskResult.transcriptionId).all();
					
					transcription = {
						task_id: id,
						targetLanguage: transcriptionResult.targetLanguage,
						style: transcriptionResult.style,
						status: taskResult.status,
						segments: segmentsResult.results || [],
						totalSegments: segmentsResult.results?.length || 0
					};
				}
			}
		} catch (transcriptionError) {
			console.error('获取转录结果失败:', transcriptionError);
			// 转录失败不影响音视频结果的返回
		}
		
		return c.json({
			video_url: videoUrl,
			audio_url: audioUrl,
			transcription
		});
	} catch (error) {
		return c.json({ error: 'Failed to retrieve files' }, 500);
	}
});

// 查询处理状态
app.get('/status/:id', async (c: Context<{ Bindings: Env }>) => {
	const id = c.req.param('id');
	try {
		const workflow = await c.env.SEP_TRANS_PROCESSOR.get(id);
		return c.json(await workflow.status());
	} catch (error: any) {
		return c.json({ status: 'errored', error: error.message });
	}
});

// 启动文件处理工作流
app.post('/start', async (c: Context<{ Bindings: Env }>) => {
	const contentType = c.req.header('content-type');
	
	if (contentType?.includes('multipart/form-data')) {
		// 模式1: 文件上传模式（保持现有逻辑）
		const body = await c.req.parseBody();
		const file = body[Object.keys(body)[0]] as File;

		if (!file) {
			return c.json({ error: 'No file provided' }, 400);
		}

		// 基本安全校验：限制大小与类型
		if (file.size > MAX_FILE_SIZE_BYTES) {
			return c.json({ error: `File too large. Max ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB allowed.` }, 400);
		}
		if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
			return c.json({ error: `Unsupported file type ${file.type}` }, 400);
		}

		const id = crypto.randomUUID();
		
		// 上传原始文件到 R2
		await c.env.SEPARATE_STORAGE.put(id, file);

		// 创建统一处理工作流
		const workflow = await c.env.SEP_TRANS_PROCESSOR.create({ 
			params: { 
				originalFile: id,
				fileType: file.type,
				options: DEFAULT_PROCESSING_OPTIONS 
			}, 
			id 
		});
		
		return c.json({
			id: workflow.id,
			details: await workflow.status(),
		});
		
	} else {
		// 模式2: 文件路径引用模式（前端已上传文件）
		try {
			const { fileKey, fileType, options, userId, taskId } = await c.req.json();
			
			if (!fileKey || !fileType) {
				return c.json({ error: 'fileKey and fileType are required' }, 400);
			}
			
			// 验证原始文件存在
			const fileExists = await c.env.ORIGINAL_STORAGE.head(fileKey);
			if (!fileExists) {
				return c.json({ error: `File not found: ${fileKey}` }, 404);
			}
			
			// 验证文件类型
			if (!ALLOWED_VIDEO_TYPES.includes(fileType)) {
				return c.json({ error: `Unsupported file type: ${fileType}` }, 400);
			}
			
			// 合并处理选项
			const processingOptions = {
				...DEFAULT_PROCESSING_OPTIONS,
				...options
			};
			
			// 使用提供的 taskId 或生成新的 ID
			const workflowId = taskId || crypto.randomUUID();
			
			// 创建工作流
			const workflow = await c.env.SEP_TRANS_PROCESSOR.create({
				params: {
					originalFile: fileKey,
					fileType,
					options: processingOptions,
					userId,
					taskId: workflowId
				},
				id: workflowId
			});
			
			return c.json({
				id: workflow.id,
				details: await workflow.status()
			});
			
		} catch (error: any) {
			console.error('Error processing file path request:', error);
			return c.json({ error: 'Invalid JSON request body' }, 400);
		}
	}
});

// API 文档
app.get('/api', async (c: Context<{ Bindings: Env }>) => {
	return c.json({
		name: 'WaveShift Workflow API',
		version: '5.0.0',
		description: 'WaveShift 音视频处理工作流服务',
		endpoints: {
			'POST /start': '启动文件处理工作流（支持文件上传或路径引用）',
			'GET /status/{id}': '查询处理状态',
			'GET /result/{id}': '获取完整结果（视频+音频+转录）',
			'GET /api': '查看此API文档'
		},
		modes: {
			'File Upload': '使用 multipart/form-data 上传新文件',
			'File Reference': '使用 JSON 引用已存在的文件路径'
		},
		features: [
			'自动音视频分离',
			'智能音频转录', 
			'统一结果查询',
			'简化API设计'
		],
		workflow: 'SepTransWorkflow',
		architecture: 'Hono + Workflow + Service Binding'
	});
});


// 注意：前端页面现在直接通过 Cloudflare Workers 静态资源功能提供
// 无需额外的路由处理，public/index.html 会自动在根路径提供

export default app;


