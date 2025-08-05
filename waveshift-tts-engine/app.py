#!/usr/bin/env python3
"""
WaveShift TTS Engine - 主应用入口点
架构简化版本：消除过度抽象，直接使用服务字典
"""
import sys
import logging
import uvicorn
from config import get_config
from launcher import create_services, cleanup_services

# 获取配置
config = get_config()
logger = logging.getLogger(__name__)


def main():
    """主函数 - 启动WaveShift TTS Engine"""
    try:
        logger.info("=" * 60)
        logger.info("WaveShift TTS Engine v2.0 启动中（简化架构版本）...")
        logger.info("=" * 60)
        
        # 初始化所有服务（简化版本）
        logger.info("正在初始化所有服务...")
        services = create_services()
        logger.info("所有服务初始化成功")
        
        # 显示已初始化的服务
        logger.info(f"已初始化 {len(services)} 个服务:")
        for service_name in services.keys():
            logger.info(f"  ✓ {service_name}")
        
        # 启动FastAPI服务器
        logger.info(f"正在启动HTTP服务器 - {config.SERVER_HOST}:{config.SERVER_PORT}")
        
        # 导入API模块并设置全局服务
        from api import app, set_services
        set_services(services)
        
        # 启动服务器
        uvicorn.run(
            app,
            host=config.SERVER_HOST,
            port=config.SERVER_PORT,
            log_level="info",
            access_log=True
        )
        
    except KeyboardInterrupt:
        logger.info("收到中断信号，正在关闭服务...")
    except Exception as e:
        logger.critical(f"应用启动失败: {e}", exc_info=True)
        sys.exit(1)
    finally:
        # 清理服务（如果已初始化）
        if 'services' in locals():
            cleanup_services(services)
        logger.info("WaveShift TTS Engine 已关闭")


if __name__ == "__main__":
    main()