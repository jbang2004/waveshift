import asyncio
from openai import OpenAI
from typing import Dict
from .base_client import BaseTranslationClient, TranslationClientFactory


class GrokClient(BaseTranslationClient):
    """
    基于 x.ai（Grok）API 的翻译客户端
    """
    def __init__(self, api_key: str, model_name: str = "grok-3-mini-fast"):
        super().__init__(api_key, model_name)
        
        # 构造 OpenAI client，base_url 指向 x.ai
        self.client = OpenAI(
            api_key=api_key,
            base_url="https://api.x.ai/v1",
        )
        self.logger.info("Grok 客户端初始化成功")

    async def _make_api_call(self, system_prompt: str, user_prompt: str) -> str:
        """
        实现Grok API调用
        """
        try:
            # 调用 OpenAI SDK（同步接口）放到线程池
            response = await asyncio.to_thread(
                self.client.chat.completions.create,
                model=self.model_name,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user",   "content": user_prompt},
                ]
            )
            
            # 拿到模型返回的文本
            text = response.choices[0].message.content
            if not text or not text.strip():
                self._log_api_error("空响应错误", "Grok 返回了空响应")
                raise ValueError("Empty response from Grok")
                
            return text
            
        except Exception as e:
            self._log_api_error("请求异常", f"{type(e).__name__}: {e}")
            raise


# 注册客户端到工厂
TranslationClientFactory.register_client('grok', GrokClient)