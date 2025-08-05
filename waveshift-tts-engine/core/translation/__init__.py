"""
翻译模块 - 提供统一的翻译客户端接口
"""

from .base_client import BaseTranslationClient, TranslationClientFactory

# 导入所有客户端以触发注册
from .deepseek_client import DeepSeekClient
from .gemini_client import GeminiClient
from .groq_client import GroqClient
from .grok_client import GrokClient

__all__ = [
    'BaseTranslationClient',
    'TranslationClientFactory',
    'DeepSeekClient',
    'GeminiClient', 
    'GroqClient',
    'GrokClient'
]