// Workflows types are included in the Cloudflare Workers runtime
import { WorkflowBinding } from 'cloudflare:workers';
import { z } from 'zod';

// FFmpeg Service Binding 接口 (WorkerEntrypoint)
interface FFmpegService {
	separate(params: {
		inputKey: string;
		audioOutputKey: string;
		videoOutputKey: string;
	}): Promise<{
		audioKey: string;
		videoKey: string;
		audioSize: number;
		videoSize: number;
	}>;
}

interface Env {
	// 存储绑定 - 统一存储桶
	MEDIA_STORAGE: R2Bucket;        // waveshift-media桶 - 所有媒体文件
	CLOUDFLARE_ACCOUNT_ID: string;
	R2_BUCKET_NAME: string;
	R2_PUBLIC_DOMAIN: string;
	
	// 服务绑定
	FFMPEG_SERVICE: FFmpegService;
	TRANSCRIBE_SERVICE: Fetcher;
	FRONTEND_SERVICE?: Fetcher; // 新增：Frontend Service Binding (可选)
	
	// 其他绑定
	SEP_TRANS_PROCESSOR: WorkflowBinding;
	DB: D1Database;
	
	// 环境变量
	WORKFLOW_CALLBACK_SECRET?: string; // 新增：回调认证密钥
}

// Zod 验证模式
export const ProcessingOptions = z.object({
	targetLanguage: z.enum(['chinese', 'english']).default('chinese'),
	style: z.enum(['normal', 'classical']).default('normal'),
	startTime: z.number().gte(0).optional(),
	endTime: z.number().gte(0).optional()
});

export type ProcessingOptionsType = z.infer<typeof ProcessingOptions>;

// 转录任务状态
type TranscriptionStatus = 'processing' | 'completed' | 'failed';

// 转录任务数据结构
interface TranscriptionTask {
	id: string;
	status: TranscriptionStatus;
	audio_url: string;
	video_url: string;
	created_at: string;
	updated_at: string;
	completed_at?: string;
}

// 转录结果数据结构
interface TranscriptionResult {
	task_id: string;
	result: any;
	metadata: {
		audioUrl: string;
		duration?: string;
		segmentCount?: number;
		processedAt: string;
	};
}

// Workflow 参数
interface SepTransWorkflowParams {
	originalFile: string;
	fileType: string;
	options: ProcessingOptionsType;
	userId?: string; // 新增：用户ID
	taskId?: string; // 新增：任务ID
}

export { 
	Env, 
	TranscriptionStatus, 
	TranscriptionTask, 
	TranscriptionResult, 
	SepTransWorkflowParams 
};