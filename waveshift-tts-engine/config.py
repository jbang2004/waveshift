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
    """TTS相关配置"""
    def __init__(self):
        # 现有配置
        self.batch_size = int(os.getenv("TTS_BATCH_SIZE", "3"))
        self.save_audio = os.getenv("TTS_SAVE_AUDIO", "true").lower() == "true"
        self.enable_audio_separation = os.getenv("TTS_ENABLE_AUDIO_SEPARATION", "true").lower() == "true"
        
        # IndexTTS模型配置
        model_name = os.getenv("TTS_MODEL_NAME", "indextts")
        if model_name == "indextts":
            self.target_sample_rate = 24000
        else:
            self.target_sample_rate = 24000
        
        # 新增：任务上下文管理配置
        self.enable_task_context = os.getenv("TTS_ENABLE_TASK_CONTEXT", "true").lower() == "true"
        self.task_cleanup_timeout = int(os.getenv("TTS_TASK_CLEANUP_TIMEOUT", "3600"))  # 1小时后自动清理
        self.max_concurrent_downloads = int(os.getenv("TTS_MAX_CONCURRENT_DOWNLOADS", "3"))
        self.download_timeout = int(os.getenv("TTS_DOWNLOAD_TIMEOUT", "300"))  # 5分钟下载超时
        
        # 新增：缺失字段补齐
        self.cleanup_temp_files = os.getenv("CLEANUP_TEMP_FILES", "false").lower() == "true"
        # 模型目录（供日志/工具访问）
        global project_dir
        self.model_path = str(project_dir / "models" / "IndexTTS" / "checkpoints")

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
class ProcessingMode:
    """处理模式配置 - 双模式架构"""
    default_mode: str = field(default_factory=lambda: os.getenv("DEFAULT_MODE", "simple"))
    enable_lazy_loading: bool = field(default_factory=lambda: os.getenv("ENABLE_LAZY_LOADING", "true").lower() == "true")
    max_memory_mb: int = field(default_factory=lambda: int(os.getenv("MAX_MEMORY_MB", "500")))
    enable_duration_align: bool = field(default_factory=lambda: os.getenv("ENABLE_DURATION_ALIGN", "false").lower() == "true")
    enable_timestamp_adjust: bool = field(default_factory=lambda: os.getenv("ENABLE_TIMESTAMP_ADJUST", "false").lower() == "true")
    
    def __post_init__(self):
        """验证处理模式配置"""
        if self.default_mode not in ["simple", "full"]:
            logger.warning(f"default_mode {self.default_mode} 不合法，使用默认值 simple")
            self.default_mode = "simple"

@dataclass
class SynthesisConfig:
    """完整的合成配置"""
    server: ServerConfig = field(default_factory=ServerConfig)
    tts: TTSConfig = field(default_factory=TTSConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    processing: ProcessingMode = field(default_factory=ProcessingMode)  # 新增处理模式配置
    
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
            },
            'processing': {
                'default_mode': self.processing.default_mode,
                'enable_lazy_loading': self.processing.enable_lazy_loading,
                'max_memory_mb': self.processing.max_memory_mb,
                'enable_duration_align': self.processing.enable_duration_align,
                'enable_timestamp_adjust': self.processing.enable_timestamp_adjust,
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
        logger.info(f"处理模式: {_config.processing.default_mode}")
        logger.info(f"延迟加载: {_config.processing.enable_lazy_loading}")
    return _config

def reload_config():
    """重新加载配置"""
    global _config
    _config = None
    return get_config()

# 兼容性接口 - 保持与原有代码的兼容
class Config:
    """兼容原有Config类的接口 - 使用__getattr__动态映射"""
    
    # 属性映射表
    _ATTRIBUTE_MAP = {
        # TTS基础配置
        'TTS_BATCH_SIZE': lambda c: c.tts.batch_size,
        'TARGET_SR': lambda c: c.tts.target_sample_rate,
        'SAVE_TTS_AUDIO': lambda c: c.tts.save_audio,
        'CLEANUP_TEMP_FILES': lambda c: c.tts.cleanup_temp_files,
        
        # 直接从环境变量读取的配置
        'CLOUDFLARE_ACCOUNT_ID': lambda c: os.getenv("CLOUDFLARE_ACCOUNT_ID", ""),
        'CLOUDFLARE_API_TOKEN': lambda c: os.getenv("CLOUDFLARE_API_TOKEN", ""),
        'CLOUDFLARE_D1_DATABASE_ID': lambda c: os.getenv("CLOUDFLARE_D1_DATABASE_ID", ""),
        'ENABLE_HLS_STORAGE': lambda c: os.getenv("ENABLE_HLS_STORAGE", "true").lower() == "true",
        'CLEANUP_LOCAL_HLS_FILES': lambda c: os.getenv("CLEANUP_LOCAL_HLS_FILES", "true").lower() == "true",
        'SILENCE_FADE_MS': lambda c: int(os.getenv("SILENCE_FADE_MS", "500")),
        'AUDIO_OVERLAP': lambda c: int(os.getenv("AUDIO_OVERLAP", "500")),
        'VOCALS_VOLUME': lambda c: float(os.getenv("VOCALS_VOLUME", "0.7")),
        'BACKGROUND_VOLUME': lambda c: float(os.getenv("BACKGROUND_VOLUME", "0.3")),
        'TRANSLATION_MODEL': lambda c: os.getenv("TRANSLATION_MODEL", "deepseek"),
    }
    
    def __init__(self):
        self._config = get_config()
    
    def __getattr__(self, name):
        """动态获取属性值"""
        if name in self._ATTRIBUTE_MAP:
            return self._ATTRIBUTE_MAP[name](self._config)
        elif name.startswith('_'):
            # 私有属性直接返回
            raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")
        else:
            # 尝试从环境变量获取
            env_value = os.getenv(name)
            if env_value is not None:
                # 尝试转换类型
                try:
                    # 尝试转换为布尔值
                    if env_value.lower() in ('true', 'false'):
                        return env_value.lower() == 'true'
                    # 尝试转换为整数
                    try:
                        return int(env_value)
                    except ValueError:
                        # 尝试转换为浮点数
                        try:
                            return float(env_value)
                        except ValueError:
                            # 返回字符串
                            return env_value
                except:
                    return env_value
            
            # 如果都没有找到，抛出AttributeError
            raise AttributeError(f"Config has no attribute '{name}' and no environment variable '{name}' found")
    
    def get_translation_api_key(self):
        """获取翻译API密钥"""
        # 按优先级顺序检查API密钥
        api_keys = [
            os.getenv("DEEPSEEK_API_KEY"),
            os.getenv("GEMINI_API_KEY"), 
            os.getenv("GROQ_API_KEY"),
            os.getenv("GROK_API_KEY"),
            os.getenv("TRANSLATION_API_KEY"),
        ]
        
        for key in api_keys:
            if key and key.strip():
                return key.strip()
        
        raise ValueError("未找到有效的翻译API密钥")

# 向后兼容
def get_simplified_config():
    """获取简化的配置对象"""
    return Config()

if __name__ == "__main__":
    # 测试配置
    config = get_config()
    logger.info("TTS Engine 简化配置:")
    logger.info(f"  服务器: {config.server.host}:{config.server.port}")
    logger.info(f"  批处理大小: {config.tts.batch_size}")
    logger.info(f"  采样率: {config.tts.target_sample_rate}Hz")
    logger.info(f"  保存音频: {config.tts.save_audio}")
    logger.info(f"  模型路径: {config.tts.model_path}")
    logger.info(f"  临时目录: {config.paths.temp_dir}")