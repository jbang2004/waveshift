import { Hono } from 'hono';
import { Env, ProcessingOptionsType } from './types/env.d';

// 应用常量
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/mov', 'video/x-matroska'];
const DEFAULT_PROCESSING_OPTIONS: ProcessingOptionsType = {
	targetLanguage: 'chinese',
	style: 'normal'
};


// 导出 Workflow 类
export { SepTransWorkflow } from './workflows/sep-trans';

const app = new Hono<{ Bindings: Env }>();

// 查看处理结果（包含音视频和转录结果）
app.get('/result/:id', async (c) => {
	const id = c.req.param('id');
	try {
		const videoUrl = `https://${c.env.R2_PUBLIC_DOMAIN}/videos/${id}-silent.mp4`;
		const audioUrl = `https://${c.env.R2_PUBLIC_DOMAIN}/audio/${id}-audio.aac`;
		
		// 检查文件是否存在
		const videoExists = await c.env.SEPARATE_STORAGE.head(`videos/${id}-silent.mp4`);
		const audioExists = await c.env.SEPARATE_STORAGE.head(`audio/${id}-audio.aac`);
		
		if (!videoExists || !audioExists) {
			return c.json({ error: 'Files not found' }, 404);
		}
		
		// 获取转录结果
		let transcription = null;
		try {
			const transcriptionResult = await c.env.TRANSCRIPTION_DB.prepare(
				"SELECT * FROM transcription_results WHERE task_id = ?"
			).bind(id).first();
			
			if (transcriptionResult) {
				transcription = {
					task_id: transcriptionResult.task_id,
					result: JSON.parse(transcriptionResult.result as string),
					metadata: JSON.parse(transcriptionResult.metadata as string)
				};
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
app.get('/status/:id', async (c) => {
	const id = c.req.param('id');
	try {
		const workflow = await c.env.SEP_TRANS_PROCESSOR.get(id);
		return c.json(await workflow.status());
	} catch (error: any) {
		return c.json({ status: 'errored', error: error.message });
	}
});

// 上传和处理文件
app.post('/process', async (c) => {
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
});

// API 文档
app.get('/api', async (c) => {
	return c.json({
		name: 'WaveShift Workflow API',
		version: '5.0.0',
		description: 'WaveShift 音视频处理工作流服务',
		endpoints: {
			'POST /process': '上传文件进行统一处理（分离+转录）',
			'GET /status/{id}': '查询处理状态',
			'GET /result/{id}': '获取完整结果（视频+音频+转录）',
			'GET /api': '查看此API文档'
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


