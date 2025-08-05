#!/usr/bin/env python3
"""
WaveShift TTS Engine - 新架构启动脚本
使用简化的synthesizer.py替代复杂的app.py
"""

import sys
import os
import uvicorn
import logging
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    """启动TTS合成引擎"""
    
    # 验证环境
    logger.info("🚀 启动WaveShift TTS合成引擎 v2.0")
    logger.info(f"📁 项目目录: {project_root}")
    
    # 检查模型目录
    model_dir = project_root / "models" / "IndexTTS"
    if not model_dir.exists():
        logger.warning(f"⚠️ 模型目录不存在: {model_dir}")
    else:
        logger.info(f"✅ 模型目录: {model_dir}")
    
    # 加载配置
    try:
        from config_simplified import get_config
        config = get_config()
        
        logger.info("📋 启动配置:")
        logger.info(f"  - 服务器: {config.server.host}:{config.server.port}")
        logger.info(f"  - 批处理大小: {config.tts.batch_size}")
        logger.info(f"  - 采样率: {config.tts.target_sample_rate}Hz")
        logger.info(f"  - 保存音频: {config.tts.save_audio}")
        logger.info(f"  - 临时目录: {config.paths.temp_dir}")
        
    except Exception as e:
        logger.error(f"❌ 配置加载失败: {e}")
        sys.exit(1)
    
    # 启动服务器
    try:
        logger.info("🎤 启动TTS合成服务...")
        
        uvicorn.run(
            "synthesizer:app",
            host=config.server.host,
            port=config.server.port,
            reload=False,
            log_level="info",
            access_log=True,
            loop="asyncio"
        )
        
    except KeyboardInterrupt:
        logger.info("⏹️ 用户中断，正在关闭服务...")
    except Exception as e:
        logger.error(f"❌ 服务启动失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()