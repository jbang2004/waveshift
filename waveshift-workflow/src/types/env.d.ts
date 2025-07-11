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
	
	// 其他绑定
	SEP_TRANS_PROCESSOR: WorkflowBinding;
	DB: D1Database;
}

// Zod 验证模式
export const ProcessingOptions = z.object({
	targetLanguage: z.enum(['chinese', 'english']).default('chinese'),
	style: z.enum(['normal', 'classical']).default('normal'),
	startTime: z.number().gte(0).optional(),
	endTime: z.number().gte(0).optional()
});

export type ProcessingOptionsType = z.infer<typeof ProcessingOptions>;


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
	SepTransWorkflowParams 
};