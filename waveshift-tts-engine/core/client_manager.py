"""
统一的客户端管理器 - 管理所有 Cloudflare 客户端实例
"""
import logging
from typing import Dict, Any
from config import get_config
from core.cloudflare.d1_client import D1Client
from core.cloudflare.r2_client import R2Client

logger = logging.getLogger(__name__)


class ClientManager:
    """统一的客户端管理器 - 避免重复初始化客户端"""
    
    def __init__(self):
        self.config = get_config()
        self.logger = logging.getLogger(__name__)
        self._clients: Dict[str, Any] = {}
        self._initialized = False
    
    def initialize_clients(self):
        """初始化所有客户端"""
        if self._initialized:
            return
        
        try:
            # 初始化 D1 客户端
            self._clients['d1'] = D1Client(
                account_id=self.config.CLOUDFLARE_ACCOUNT_ID,
                api_token=self.config.CLOUDFLARE_API_TOKEN,
                database_id=self.config.CLOUDFLARE_D1_DATABASE_ID
            )
            
            # 初始化 R2 客户端
            self._clients['r2'] = R2Client(
                account_id=self.config.CLOUDFLARE_ACCOUNT_ID,
                access_key_id=self.config.CLOUDFLARE_R2_ACCESS_KEY_ID,
                secret_access_key=self.config.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
                bucket_name=self.config.CLOUDFLARE_R2_BUCKET_NAME
            )
            
            self._initialized = True
            self.logger.info("所有 Cloudflare 客户端初始化完成")
            
        except Exception as e:
            self.logger.error(f"客户端初始化失败: {e}")
            raise
    
    def get_d1_client(self) -> D1Client:
        """获取 D1 客户端"""
        if not self._initialized:
            self.initialize_clients()
        return self._clients['d1']
    
    def get_r2_client(self) -> R2Client:
        """获取 R2 客户端"""
        if not self._initialized:
            self.initialize_clients()
        return self._clients['r2']
    
    def get_client(self, name: str) -> Any:
        """根据名称获取客户端"""
        if not self._initialized:
            self.initialize_clients()
        return self._clients.get(name)
    
    async def close_all(self):
        """关闭所有客户端连接"""
        try:
            for client_name, client in self._clients.items():
                if hasattr(client, 'close'):
                    await client.close()
                    self.logger.info(f"客户端 {client_name} 已关闭")
            
            self._clients.clear()
            self._initialized = False
            self.logger.info("所有客户端连接已关闭")
            
        except Exception as e:
            self.logger.error(f"关闭客户端失败: {e}")
    
    def __enter__(self):
        self.initialize_clients()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        # 同步版本不支持异步关闭，记录日志
        self.logger.info("ClientManager 退出，建议使用 close_all() 方法正确关闭客户端")
    
    async def __aenter__(self):
        self.initialize_clients()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close_all()