export interface Env {
	// 存储绑定
	STORAGE: R2Bucket;
	CLOUDFLARE_ACCOUNT_ID: string;
	R2_BUCKET_NAME: string;
	
	// 容器绑定
	FFMPEG_CONTAINER: DurableObjectNamespace;
}

// 分离请求参数
export interface SeparateParams {
	inputKey: string;        // R2 中的输入文件键
	audioOutputKey: string;  // 音频输出文件键
	videoOutputKey: string;  // 视频输出文件键
}

// 分离结果
export interface SeparateResult {
	audioKey: string;
	videoKey: string;
	audioSize: number;
	videoSize: number;
}