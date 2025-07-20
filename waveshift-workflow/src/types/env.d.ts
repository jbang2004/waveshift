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

// Audio Segment Service Binding 接口 (WorkerEntrypoint)
interface AudioSegmentService {
	segment(params: {
		audioKey: string;
		transcripts: Array<{
			sequence: number;
			startMs: number;     // 毫秒时间戳
			endMs: number;       // 毫秒时间戳
			speaker: string;
			original: string;
			translation?: string;
			content_type: string;
		}>;
		outputPrefix: string;
		// 注意：切分参数现在通过环境变量配置：GAP_DURATION_MS, MAX_DURATION_MS, MIN_DURATION_MS
	}): Promise<{
		success: boolean;
		segments?: Array<{
			segmentId: string;
			audioKey: string;
			speaker: string;
			startMs: number;
			endMs: number;
			durationMs: number;
			sentences: Array<{
				sequence: number;
				original: string;
				translation?: string;
			}>;
		}>;
		sentenceToSegmentMap?: Record<number, string>;
		error?: string;
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
	AUDIO_SEGMENT_SERVICE: AudioSegmentService;
	
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