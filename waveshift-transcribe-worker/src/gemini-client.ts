/**
 * Gemini API 客户端
 * 使用官方推荐的最佳实践调用 Google Generative AI API
 * 支持流式响应以避免超时问题
 */

import { 
  GoogleGenAI,
  createUserContent,
  createPartFromUri
} from "@google/genai";
import { getTranscriptionPrompt, TranscriptionStyle, TranscriptionSegment } from './transcription';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

export class GeminiClient {
  private ai: GoogleGenAI;
  private model: string;

  constructor(config: GeminiConfig) {
    this.ai = new GoogleGenAI({ apiKey: config.apiKey });
    this.model = config.model || 'models/gemini-2.5-flash';
  }

  /**
   * 创建转录结果的响应schema
   */
  private createTranscriptionSchema(targetLanguage: string) {
    const translationDesc =
      targetLanguage === 'chinese'
        ? 'Chinese (Simplified) translation or description of the content'
        : 'English translation or description of the content';

    const itemSchema = {
      type: 'object',
      properties: {
        sequence: {
          type: 'integer',
          description: 'Sequence number starting from 1',
        },
        start: {
          type: 'string',
          description: 'Start time format: 0m1s682ms',
        },
        end: {
          type: 'string',
          description: 'End time format: 0m3s245ms',
        },
        content_type: {
          type: 'string',
          enum: [
            'speech',
            'singing',
            'non_speech_human_vocalizations',
            'non_human_sounds',
          ],
          description: 'Content classification type',
        },
        speaker: {
          type: 'string',
          description:
            "Speaker identifier: use real names when possible (e.g., 'John', 'Dr. Smith', 'Interviewer'), or fallback to 'Speaker A', 'Speaker B', etc. Use 'N/A' for non-speech content",
        },
        original: {
          type: 'string',
          description:
            'Original content in source language, use simplified Chinese if source language is Chinese',
        },
        translation: {
          type: 'string',
          description: translationDesc,
        },
      },
      required: [
        'sequence',
        'start',
        'end',
        'content_type',
        'speaker',
        'original',
        'translation',
      ],
      additionalProperties: false,
      propertyOrdering: [
        'sequence',
        'start',
        'end',
        'content_type',
        'speaker',
        'original',
        'translation',
      ],
    };

    // 顶层返回一个数组 schema，items 为上述对象
    return {
      type: 'array',
      items: itemSchema,
    };
  }

  /**
   * 转录音频文件 - 流式版本，实时返回响应块
   */
  async *transcribeAudioStream(
    audioBuffer: ArrayBuffer,
    mimeType: string,
    targetLanguage: string = 'chinese',
    style: TranscriptionStyle = 'normal',
    displayName?: string
  ): AsyncGenerator<string, void, unknown> {
    const fileName = displayName || `audio_${Date.now()}.${mimeType.split('/')[1]}`;
    const startTime = Date.now();
    
    try {
      // 上传文件
      const fileBlob = new Blob([audioBuffer], { type: mimeType });
      const uploadResponse = await this.ai.files.upload({
        file: fileBlob,
        config: { mimeType },
      });
      if (!uploadResponse.uri || !uploadResponse.mimeType) {
        throw new Error('File upload failed: missing uri or mimeType');
      }

      // 生成转录流
      const prompt = getTranscriptionPrompt(targetLanguage, style);
      
      // 构造用户消息，明确指定目标语言
      const targetLangDisplay = targetLanguage === 'chinese' ? '中文(简体)' : 'English';
      const userMessage = `Please transcribe this audio/video file completely and translate all content to ${targetLangDisplay}. Follow the system instructions precisely.`;

      const responseStream = await this.ai.models.generateContentStream({
        model: this.model,
        contents: createUserContent([
          createPartFromUri(uploadResponse.uri, uploadResponse.mimeType),
          userMessage
        ]),
        config: {
          systemInstruction: `${prompt}\nOutput a single JSON array. Each element of the array must be a self-contained JSON object with the following keys: sequence, start, end, content_type, speaker, original, translation. Do NOT output anything before or after the array.`,
          responseMimeType: "application/json",
          responseSchema: this.createTranscriptionSchema(targetLanguage),
          // 温度控制创造性和随机性，设置为1.3以增加多样性
          temperature: 1.0,
          topP: 0.95,
          thinkingConfig: {
            thinkingBudget: 0,
          },
          // 候选数量限制为1，避免资源浪费
          candidateCount: 1,
          // 设置最大输出 token 数量为 65536
          maxOutputTokens: 65536,
        },
      });

      // 流式返回每个响应块
      for await (const chunk of responseStream) {
        if (chunk.text) {
          yield chunk.text;
        }
      }

      // 清理上传文件
      if (uploadResponse.name) {
        this.ai.files.delete({ name: uploadResponse.name }).catch(() => {});
      }

    } catch (error) {
      const totalTime = Date.now() - startTime;
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`转录失败 (${Math.round(totalTime / 1000)}s): ${msg}`);
    }
  }


} 