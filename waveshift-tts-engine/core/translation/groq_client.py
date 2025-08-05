from groq import AsyncGroq
from typing import Dict
from .base_client import BaseTranslationClient, TranslationClientFactory


class GroqClient(BaseTranslationClient):
    """
    基于 Groq Chat Completions API 的翻译客户端
    """
    def __init__(self, api_key: str, model_name: str = "meta-llama/llama-4-maverick-17b-128e-instruct"):
        super().__init__(api_key, model_name)
        
        # 初始化 Groq 客户端
        self.client = AsyncGroq(api_key=api_key)
        self.logger.info("Groq 客户端初始化成功")

    async def _make_api_call(self, system_prompt: str, user_prompt: str) -> str:
        """
        实现Groq API调用
        """
        try:
            response = await self.client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
            )
            
            # 获取模型返回文本
            text = response.choices[0].message.content
            if not text or not text.strip():
                self._log_api_error("空响应错误", "Groq 返回了空响应")
                raise ValueError("Empty response from Groq")
                
            return text
            
        except Exception as e:
            self._log_api_error("请求异常", f"{type(e).__name__}: {e}")
            raise


# 注册客户端到工厂
TranslationClientFactory.register_client('groq', GroqClient)