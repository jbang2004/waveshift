import sys
import logging
from typing import Dict, Any
from config import get_config, init_logging

logger = logging.getLogger(__name__)

# 导入所有核心组件
from core.data_fetcher import DataFetcher
from core.tts_streaming_watcher import TTSStreamingWatcher
from core.translation.simplifier import Simplifier
from core.my_index_tts import MyIndexTTSDeployment
from core.timeadjust.duration_aligner import DurationAligner
from core.timeadjust.timestamp_adjuster import TimestampAdjuster
from core.media_mixer import MediaMixer
from core.hls_manager import HLSManager
from orchestrator import MainOrchestrator
from core.client_manager import ClientManager


def initialize_services(config) -> Dict[str, Any]:
    """
    简化的服务初始化 - 直接返回服务字典，消除ServiceManager抽象层
    """
    try:
        # 初始化客户端管理器
        client_manager = ClientManager()
        client_manager.initialize_clients()
        
        # 获取共享客户端
        d1_client = client_manager.get_d1_client()
        r2_client = client_manager.get_r2_client()
        
        # 直接构建服务字典
        services = {
            'd1_client': d1_client,
            'r2_client': r2_client,
            'client_manager': client_manager,
        }
        
        # 初始化核心服务
        services['data_fetcher'] = DataFetcher(
            d1_client=d1_client,
            r2_client=r2_client
        )
        services['simplifier'] = Simplifier()
        services['tts'] = MyIndexTTSDeployment(config)
        
        # 初始化流式TTS监听器
        services['tts_streaming_watcher'] = TTSStreamingWatcher(
            d1_client=d1_client,
            r2_client=r2_client,
            tts_service=services['tts']  # 将TTS服务传入
        )
        
        # 初始化有依赖的服务
        services['duration_aligner'] = DurationAligner(
            simplifier=services['simplifier'],
            index_tts=services['tts']
        )
        services['timestamp_adjuster'] = TimestampAdjuster()
        services['media_mixer'] = MediaMixer()
        services['hls_manager'] = HLSManager(d1_client=d1_client)
        
        # 最后初始化编排器
        services['orchestrator'] = MainOrchestrator(services)
        
        logger.info(f"成功初始化 {len(services)} 个服务")
        
        # 简单验证：确保关键服务不为None
        critical_services = ['orchestrator', 'd1_client', 'tts']
        for service_name in critical_services:
            if services[service_name] is None:
                raise RuntimeError(f"关键服务 {service_name} 初始化失败")
        
        return services
        
    except Exception as e:
        logger.critical(f"服务初始化失败: {e}", exc_info=True)
        raise


def create_services() -> Dict[str, Any]:
    """
    创建所有服务 - 简化版本，移除不必要的包装
    """
    # 初始化配置和日志（只执行一次）
    init_logging()
    config = get_config()
    logger.info("配置和日志初始化完成")

    # 扩展系统路径（如果配置了）
    if hasattr(config, 'SYSTEM_PATHS') and config.SYSTEM_PATHS:
        sys.path.extend(config.SYSTEM_PATHS)
        logger.info(f"系统路径已扩展: {config.SYSTEM_PATHS}")

    # 直接初始化服务并返回字典
    return initialize_services(config)


def cleanup_services(services: Dict[str, Any]):
    """
    简化的服务清理 - 只处理真正需要清理的服务
    """
    cleanup_methods = ['cleanup', 'close', 'shutdown']
    
    for service_name, service_instance in services.items():
        if service_name == 'client_manager':  # 跳过客户端管理器
            continue
            
        for method_name in cleanup_methods:
            if hasattr(service_instance, method_name):
                try:
                    method = getattr(service_instance, method_name)
                    if callable(method):
                        method()
                        logger.info(f"服务 {service_name} 清理完成")
                        break
                except Exception as e:
                    logger.warning(f"服务 {service_name} 清理失败: {e}")
    
    logger.info("服务清理完成")


if __name__ == "__main__":
    # 简单测试
    try:
        services = create_services()
        logger.info(f"测试创建了 {len(services)} 个服务")
        for name in services.keys():
            logger.info(f"  ✓ {name}")
    except Exception as e:
        logger.error(f"测试失败: {e}")