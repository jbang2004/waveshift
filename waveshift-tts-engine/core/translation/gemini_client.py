import asyncio
from typing import Dict
from google import genai
from google.genai import types
from .base_client import BaseTranslationClient, TranslationClientFactory


class GeminiClient(BaseTranslationClient):
    def __init__(self, api_key: str, model_name: str = 'gemini-2.0-flash'):
        """初始化 Gemini 客户端"""
        super().__init__(api_key, model_name)
        
        # 配置 Gemini
        self.client = genai.Client(api_key=api_key)
        self.logger.info("Gemini 客户端初始化成功 (使用 google-genai SDK)")
    
    async def _make_api_call(self, system_prompt: str, user_prompt: str) -> str:
        """
        实现Gemini API调用
        """
        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model_name,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=self.temperature)
            )
            
            result_text = response.text
            if not result_text or not result_text.strip():
                self._log_api_error("空响应错误", "Gemini 返回了空响应")
                raise ValueError("Empty response from Gemini")
                
            return result_text
            
        except Exception as e:
            self._log_api_error("请求异常", f"{type(e).__name__}: {e}")
            raise


# 注册客户端到工厂
TranslationClientFactory.register_client('gemini', GeminiClient)