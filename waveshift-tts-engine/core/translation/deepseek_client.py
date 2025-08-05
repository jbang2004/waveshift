# =========================== deepseek_client.py ===========================
import httpx
from typing import Dict
from .base_client import BaseTranslationClient, TranslationClientFactory


class DeepSeekClient(BaseTranslationClient):
    BASE_URL = "https://api.deepseek.com/chat/completions"

    def __init__(self, api_key: str, model_name: str = "deepseek-chat"):
        """初始化 DeepSeek 客户端"""
        super().__init__(api_key, model_name)
        
        # 配置DeepSeek特定参数
        self.temperature = 1.3  # DeepSeek特定的温度设置
        
        # 初始化 httpx 异步客户端
        self.http_client = httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            },
            timeout=self.timeout
        )
        self.logger.info("DeepSeek 客户端初始化成功 (使用 httpx)")

    async def _make_api_call(self, system_prompt: str, user_prompt: str) -> str:
        """
        实现DeepSeek API调用
        """
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": self.temperature,
            "stream": False
        }

        try:
            response = await self.http_client.post(self.BASE_URL, json=payload)
            response.raise_for_status()
            response_data = response.json()

            # 检查响应结构
            if not response_data or 'choices' not in response_data or not response_data['choices']:
                self._log_api_error("响应结构错误", f"无效的响应结构: {response_data}")
                raise ValueError("Invalid response structure from DeepSeek")

            return response_data['choices'][0]['message']['content']

        except httpx.HTTPStatusError as e:
            self._log_api_error("HTTP错误", f"状态码: {e.response.status_code}, 响应: {e.response.text}")
            if e.response.status_code == 503:
                self._log_api_error("连接错误", "无法连接到 DeepSeek API，可能是代理或网络问题")
            raise
        except Exception as e:
            self._log_api_error("请求异常", f"{type(e).__name__}: {e}")
            raise

    async def close(self):
        """关闭DeepSeek客户端"""
        await self.http_client.aclose()
        self.logger.info("DeepSeek httpx 客户端已关闭")


# 注册客户端到工厂
TranslationClientFactory.register_client('deepseek', DeepSeekClient)
