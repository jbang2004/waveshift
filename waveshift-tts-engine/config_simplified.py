"""
WaveShift TTS Engine - 简化配置系统
专注TTS核心功能，移除所有外部依赖配置
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from dotenv import load_dotenv
import logging.config
import logging

# 加载环境变量
current_dir = Path(__file__).parent
env_path = current_dir / '.env'
load_dotenv(env_path)

project_dir = current_dir.parent

logger = logging.getLogger(__name__)

@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = field(default_factory=lambda: os.getenv("SERVER_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("SERVER_PORT", "8001")))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))

@dataclass
class TTSConfig:
    """TTS核心配置 - 移除所有外部依赖"""
    # 批处理配置
    batch_size: int = field(default_factory=lambda: int(os.getenv("TTS_BATCH_SIZE", "3")))
    
    # 音频参数
    target_sample_rate: int = field(default_factory=lambda: int(os.getenv("TARGET_SR", "24000")))
    
    # 文件管理
    save_audio: bool = field(default_factory=lambda: os.getenv("SAVE_TTS_AUDIO", "true").lower() == "true")
    cleanup_temp_files: bool = field(default_factory=lambda: os.getenv("CLEANUP_TEMP_FILES", "false").lower() == "true")
    
    # IndexTTS模型路径
    model_path: str = field(default_factory=lambda: os.getenv("LOCAL_MODEL_PATH", "models/IndexTTS"))
    
    def __post_init__(self):
        """验证TTS配置"""
        if not (1 <= self.batch_size <= 10):
            logger.warning(f"batch_size {self.batch_size} 不在推荐范围内，使用默认值 3")
            self.batch_size = 3
        
        if self.target_sample_rate not in [16000, 22050, 24000, 44100, 48000]:
            logger.warning(f"target_sample_rate {self.target_sample_rate} 不在标准范围内，使用默认值 24000")
            self.target_sample_rate = 24000

@dataclass
class PathConfig:
    """路径配置 - 简化版"""
    base_dir: Path = field(default_factory=lambda: Path("/tmp"))
    temp_dir: Path = field(default_factory=lambda: Path("/tmp/tts_temp"))
    model_dir: Path = field(default_factory=lambda: project_dir / "models")
    
    def __post_init__(self):
        """创建必要的目录"""
        for path in [self.temp_dir]:
            path.mkdir(parents=True, exist_ok=True)

@dataclass
class SynthesisConfig:
    """完整的合成配置"""
    server: ServerConfig = field(default_factory=ServerConfig)
    tts: TTSConfig = field(default_factory=TTSConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    
    def __post_init__(self):
        """配置验证和初始化"""
        self.init_logging()
    
    def init_logging(self):
        """初始化日志配置"""
        log_level = getattr(logging, self.server.log_level.upper(), logging.INFO)
        
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
            ]
        )
        
        # 设置特定模块的日志级别
        logging.getLogger('torch').setLevel(logging.WARNING)
        logging.getLogger('transformers').setLevel(logging.WARNING)
        
        logger.info(f"日志系统初始化完成，级别: {self.server.log_level}")
    
    def to_dict(self) -> dict:
        """导出配置为字典格式"""
        return {
            'server': {
                'host': self.server.host,
                'port': self.server.port,
                'log_level': self.server.log_level,
            },
            'tts': {
                'batch_size': self.tts.batch_size,
                'target_sample_rate': self.tts.target_sample_rate,
                'save_audio': self.tts.save_audio,
                'cleanup_temp_files': self.tts.cleanup_temp_files,
                'model_path': self.tts.model_path,
            },
            'paths': {
                'base_dir': str(self.paths.base_dir),
                'temp_dir': str(self.paths.temp_dir),
                'model_dir': str(self.paths.model_dir),
            }
        }

# 全局配置实例
_config = None

def get_config() -> SynthesisConfig:
    """获取全局配置实例"""
    global _config
    if _config is None:
        _config = SynthesisConfig()
        logger.info("TTS配置初始化完成")
        logger.info(f"TTS批处理大小: {_config.tts.batch_size}")
        logger.info(f"目标采样率: {_config.tts.target_sample_rate}Hz")
        logger.info(f"保存音频文件: {_config.tts.save_audio}")
    return _config

def reload_config():
    """重新加载配置"""
    global _config
    _config = None
    return get_config()

# 兼容性接口 - 保持与原有代码的兼容
class Config:
    """兼容原有Config类的接口"""
    def __init__(self):
        self._config = get_config()
    
    @property
    def TTS_BATCH_SIZE(self):
        return self._config.tts.batch_size
    
    @property
    def TARGET_SR(self):
        return self._config.tts.target_sample_rate
    
    @property
    def SAVE_TTS_AUDIO(self):
        return self._config.tts.save_audio

# 向后兼容
def get_simplified_config():
    """获取简化的配置对象"""
    return Config()

if __name__ == "__main__":
    # 测试配置
    config = get_config()
    print("TTS Engine 简化配置:")
    print(f"  服务器: {config.server.host}:{config.server.port}")
    print(f"  批处理大小: {config.tts.batch_size}")
    print(f"  采样率: {config.tts.target_sample_rate}Hz")
    print(f"  保存音频: {config.tts.save_audio}")
    print(f"  模型路径: {config.tts.model_path}")
    print(f"  临时目录: {config.paths.temp_dir}")