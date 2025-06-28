import { Env, TranscriptionTask, TranscriptionResult } from '../types/env.d';

/**
 * 创建转录任务
 */
export async function createTranscriptionTask(
	env: Env, 
	taskId: string, 
	audioUrl: string, 
	videoUrl: string
): Promise<void> {
	const now = new Date().toISOString();
	
	await env.TRANSCRIPTION_DB.prepare(`
		INSERT INTO transcription_tasks 
		(id, status, audio_url, video_url, created_at, updated_at) 
		VALUES (?, ?, ?, ?, ?, ?)
	`).bind(taskId, 'processing', audioUrl, videoUrl, now, now).run();
}

/**
 * 更新转录任务的音频和视频 URL
 */
export async function updateTranscriptionTaskUrls(
	env: Env, 
	taskId: string, 
	audioUrl: string, 
	videoUrl: string
): Promise<void> {
	const now = new Date().toISOString();
	
	await env.TRANSCRIPTION_DB.prepare(`
		UPDATE transcription_tasks 
		SET audio_url = ?, video_url = ?, updated_at = ? 
		WHERE id = ?
	`).bind(audioUrl, videoUrl, now, taskId).run();
}

/**
 * 更新转录任务状态
 */
export async function updateTranscriptionTaskStatus(
	env: Env, 
	taskId: string, 
	status: 'processing' | 'completed' | 'failed',
	completedAt?: string
): Promise<void> {
	const now = new Date().toISOString();
	
	if (status === 'completed' && completedAt) {
		await env.TRANSCRIPTION_DB.prepare(`
			UPDATE transcription_tasks 
			SET status = ?, updated_at = ?, completed_at = ? 
			WHERE id = ?
		`).bind(status, now, completedAt, taskId).run();
	} else {
		await env.TRANSCRIPTION_DB.prepare(`
			UPDATE transcription_tasks 
			SET status = ?, updated_at = ? 
			WHERE id = ?
		`).bind(status, now, taskId).run();
	}
}

/**
 * 获取转录任务信息
 */
export async function getTranscriptionTask(
	env: Env, 
	taskId: string
): Promise<TranscriptionTask | null> {
	const result = await env.TRANSCRIPTION_DB.prepare(`
		SELECT * FROM transcription_tasks WHERE id = ?
	`).bind(taskId).first();
	
	return result as TranscriptionTask | null;
}

/**
 * 存储转录结果
 */
export async function storeTranscriptionResult(
	env: Env, 
	taskId: string, 
	result: any, 
	metadata: any
): Promise<void> {
	await env.TRANSCRIPTION_DB.prepare(`
		INSERT INTO transcription_results 
		(task_id, result, metadata) 
		VALUES (?, ?, ?)
	`).bind(taskId, JSON.stringify(result), JSON.stringify(metadata)).run();
}

/**
 * 获取转录结果
 */
export async function getTranscriptionResult(
	env: Env, 
	taskId: string
): Promise<TranscriptionResult | null> {
	const result = await env.TRANSCRIPTION_DB.prepare(`
		SELECT * FROM transcription_results WHERE task_id = ?
	`).bind(taskId).first();
	
	if (!result) return null;
	
	return {
		task_id: result.task_id as string,
		result: JSON.parse(result.result as string),
		metadata: JSON.parse(result.metadata as string)
	} as TranscriptionResult;
}

/**
 * 列出转录任务
 */
export async function listTranscriptionTasks(
	env: Env, 
	userId?: string, 
	limit: number = 10
): Promise<TranscriptionTask[]> {
	let query = `
		SELECT * FROM transcription_tasks 
		ORDER BY created_at DESC 
		LIMIT ?
	`;
	let params: (string | number)[] = [limit];
	
	if (userId) {
		query = `
			SELECT * FROM transcription_tasks 
			WHERE user_id = ? 
			ORDER BY created_at DESC 
			LIMIT ?
		`;
		params = [userId, limit];
	}
	
	const result = await env.TRANSCRIPTION_DB.prepare(query).bind(...params).all();
	return (result.results || []) as unknown as TranscriptionTask[];
}