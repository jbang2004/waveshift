"""
翻译客户端基类 - 统一接口和通用逻辑
"""
import logging
from abc import ABC, abstractmethod
from typing import Dict
from json_repair import loads

logger = logging.getLogger(__name__)


class BaseTranslationClient(ABC):
    """翻译客户端基类 - 封装通用逻辑"""
    
    def __init__(self, api_key: str, model_name: str = None):
        """
        初始化翻译客户端
        
        Args:
            api_key: API密钥
            model_name: 模型名称（可选）
        """
        if not api_key:
            raise ValueError(f"{self.__class__.__name__} API key必须提供")
        
        self.api_key = api_key
        self.model_name = model_name
        self.logger = logging.getLogger(self.__class__.__name__)
        
        # 子类可以重写的配置
        self.timeout = 30.0
        self.temperature = 0.8
        
        self.logger.info(f"{self.__class__.__name__} 客户端初始化成功")
    
    @abstractmethod
    async def _make_api_call(self, system_prompt: str, user_prompt: str) -> str:
        """
        发起API调用 - 子类必须实现
        
        Args:
            system_prompt: 系统提示
            user_prompt: 用户提示
            
        Returns:
            str: API返回的原始响应文本
        """
        pass
    
    async def translate(self, system_prompt: str, user_prompt: str) -> Dict[str, str]:
        """
        执行翻译请求 - 统一的处理逻辑
        
        Args:
            system_prompt: 系统提示
            user_prompt: 用户提示
            
        Returns:
            Dict[str, str]: 解析后的JSON响应
        """
        try:
            # 记录请求信息
            self.logger.info(f"翻译请求内容:\n{user_prompt}")
            
            # 调用子类的API实现
            raw_response = await self._make_api_call(system_prompt, user_prompt)
            
            # 统一的响应处理
            return self._parse_response(raw_response)
            
        except Exception as e:
            self.logger.error(f"翻译请求失败: {type(e).__name__}: {e}", exc_info=True)
            return {}
    
    def _parse_response(self, raw_response: str) -> Dict[str, str]:
        """
        解析API响应 - 统一的JSON解析逻辑
        
        Args:
            raw_response: 原始响应文本
            
        Returns:
            Dict[str, str]: 解析后的JSON响应
        """
        try:
            self.logger.info(f"原始返回内容 (长度: {len(raw_response)}):\n{raw_response!r}")
            
            # 验证响应不为空
            if not raw_response or not raw_response.strip():
                self.logger.error("API返回了空响应")
                raise ValueError("Empty response from API")
            
            # 使用json_repair进行容错解析
            parsed_result = loads(raw_response)
            
            self.logger.debug("API请求成功，JSON解析完成")
            return parsed_result
            
        except Exception as json_error:
            self.logger.error(f"JSON解析失败，原始内容: {raw_response!r}")
            self.logger.error(f"JSON解析错误详情: {str(json_error)}")
            raise
    
    def _log_api_error(self, error_type: str, details: str):
        """统一的API错误日志记录"""
        self.logger.error(f"{self.__class__.__name__} {error_type}: {details}")
    
    async def close(self):
        """关闭客户端连接 - 子类可重写"""
        pass


class TranslationClientFactory:
    """翻译客户端工厂类"""
    
    _clients = {}
    
    @classmethod
    def register_client(cls, model_type: str, client_class):
        """注册翻译客户端类"""
        cls._clients[model_type] = client_class
    
    @classmethod
    def create_client(cls, model_type: str, api_key: str, **kwargs) -> BaseTranslationClient:
        """
        创建翻译客户端实例
        
        Args:
            model_type: 模型类型 (deepseek, gemini, groq, grok)
            api_key: API密钥
            **kwargs: 其他参数
            
        Returns:
            BaseTranslationClient: 客户端实例
        """
        if model_type not in cls._clients:
            raise ValueError(f"不支持的翻译模型: {model_type}")
        
        client_class = cls._clients[model_type]
        return client_class(api_key, **kwargs)
    
    @classmethod
    def get_supported_models(cls) -> list:
        """获取支持的模型列表"""
        return list(cls._clients.keys())