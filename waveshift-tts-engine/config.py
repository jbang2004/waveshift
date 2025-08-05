"""
简化的配置管理系统 - 使用数据类分离配置验证逻辑
"""
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv
import logging.config
import logging

# 加载环境变量
current_dir = Path(__file__).parent
env_path = current_dir / '.env'
load_dotenv(env_path)

project_dir = current_dir.parent
storage_dir = project_dir / 'storage'

logger = logging.getLogger(__name__)


@dataclass
class ServerConfig:
    """服务器配置"""
    host: str = field(default_factory=lambda: os.getenv("SERVER_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: int(os.getenv("SERVER_PORT", "8000")))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "DEBUG"))
    
    def __post_init__(self):
        """验证服务器配置"""
        if not (1 <= self.port <= 65535):
            logger.warning(f"服务器端口 {self.port} 不在有效范围内，使用默认值 8000")
            self.port = 8000
        
        if self.log_level not in ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]:
            logger.warning(f"无效的日志级别 {self.log_level}，使用默认值 DEBUG")
            self.log_level = "DEBUG"


@dataclass
class PathConfig:
    """路径配置"""
    base_dir: Path = field(default_factory=lambda: storage_dir)
    tasks_dir: Path = field(default_factory=lambda: storage_dir / "tasks")
    public_dir: Path = field(default_factory=lambda: storage_dir / "public")
    model_dir: Path = field(default_factory=lambda: project_dir / "models")
    
    def __post_init__(self):
        """创建必要的目录"""
        directories = [self.base_dir, self.tasks_dir, self.public_dir, self.public_dir / "playlists", self.public_dir / "segments"]
        for dir_path in directories:
            dir_path.mkdir(parents=True, exist_ok=True)
            os.chmod(str(dir_path), 0o755)




@dataclass
class CloudflareConfig:
    """Cloudflare配置"""
    account_id: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_ACCOUNT_ID", ""))
    api_token: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_API_TOKEN", ""))
    database_id: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_D1_DATABASE_ID", ""))
    r2_access_key_id: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", ""))
    r2_secret_access_key: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", ""))
    r2_bucket_name: str = field(default_factory=lambda: os.getenv("CLOUDFLARE_R2_BUCKET_NAME", ""))
    
    def __post_init__(self):
        """验证Cloudflare配置"""
        required_fields = {
            'account_id': self.account_id,
            'api_token': self.api_token,
            'database_id': self.database_id,
            'r2_access_key_id': self.r2_access_key_id,
            'r2_secret_access_key': self.r2_secret_access_key,
            'r2_bucket_name': self.r2_bucket_name
        }
        
        missing_fields = [field for field, value in required_fields.items() if not value]
        if missing_fields:
            error_msg = f"缺少必需的Cloudflare配置: {', '.join(missing_fields)}"
            logger.error(error_msg)
            raise ValueError(error_msg)


@dataclass
class AudioProcessingConfig:
    """音频处理配置（合并了AudioConfig和AudioSlicingConfig）"""
    # 基础音频配置
    batch_size: int = field(default_factory=lambda: int(os.getenv("BATCH_SIZE", "20")))
    target_speaker_audio_duration: int = field(default_factory=lambda: int(os.getenv("TARGET_SPEAKER_AUDIO_DURATION", "10")))
    vad_sr: int = field(default_factory=lambda: int(os.getenv("VAD_SR", "16000")))
    target_sr: int = field(default_factory=lambda: int(os.getenv("TARGET_SR", "24000")))
    vocals_volume: float = field(default_factory=lambda: float(os.getenv("VOCALS_VOLUME", "0.7")))
    background_volume: float = field(default_factory=lambda: float(os.getenv("BACKGROUND_VOLUME", "0.3")))
    audio_overlap: int = field(default_factory=lambda: int(os.getenv("AUDIO_OVERLAP", "1024")))
    silence_fade_ms: int = field(default_factory=lambda: int(os.getenv("SILENCE_FADE_MS", "25")))
    normalization_threshold: float = field(default_factory=lambda: float(os.getenv("NORMALIZATION_THRESHOLD", "0.9")))
    
    # 文件管理
    save_tts_audio: bool = field(default_factory=lambda: os.getenv("SAVE_TTS_AUDIO", "true").lower() == "true")
    cleanup_temp_files: bool = field(default_factory=lambda: os.getenv("CLEANUP_TEMP_FILES", "false").lower() == "true")
    
    # 音频分离配置
    enable_vocal_separation: bool = field(default_factory=lambda: os.getenv("ENABLE_VOCAL_SEPARATION", "true").lower() == "true")
    vocal_separation_model: str = field(default_factory=lambda: os.getenv("VOCAL_SEPARATION_MODEL", "Kim_Vocal_2.onnx"))
    vocal_separation_output_format: str = field(default_factory=lambda: os.getenv("VOCAL_SEPARATION_OUTPUT_FORMAT", "WAV"))
    vocal_separation_sample_rate: int = field(default_factory=lambda: int(os.getenv("VOCAL_SEPARATION_SAMPLE_RATE", "24000")))
    vocal_separation_timeout: int = field(default_factory=lambda: int(os.getenv("VOCAL_SEPARATION_TIMEOUT", "300")))
    audio_separator_model_dir: str = field(default_factory=lambda: os.getenv("AUDIO_SEPARATOR_MODEL_DIR", "models/audio-separator-models"))
    
    # 音频切片配置
    clip_goal_duration_ms: int = field(default_factory=lambda: int(os.getenv("AUDIO_CLIP_GOAL_DURATION_MS", "12000")))
    clip_min_duration_ms: int = field(default_factory=lambda: int(os.getenv("AUDIO_CLIP_MIN_DURATION_MS", "1000")))
    clip_padding_ms: int = field(default_factory=lambda: int(os.getenv("AUDIO_CLIP_PADDING_MS", "200")))
    clip_allow_cross_non_speech: bool = field(default_factory=lambda: os.getenv("AUDIO_CLIP_ALLOW_CROSS_NON_SPEECH", "false").lower() == "true")
    
    def __post_init__(self):
        """验证音频配置"""
        if self.batch_size <= 0:
            logger.warning("BATCH_SIZE 必须大于0，使用默认值6")
            self.batch_size = 6
        
        if self.target_sr <= 0:
            logger.warning("TARGET_SR 必须大于0，使用默认值24000")
            self.target_sr = 24000
        
        if not (0.0 <= self.vocals_volume <= 1.0):
            logger.warning("VOCALS_VOLUME 必须在0.0-1.0范围内，使用默认值0.7")
            self.vocals_volume = 0.7
        
        if not (0.0 <= self.background_volume <= 1.0):
            logger.warning("BACKGROUND_VOLUME 必须在0.0-1.0范围内，使用默认值0.3")
            self.background_volume = 0.3


@dataclass
class HLSConfig:
    """HLS配置"""
    enable_storage: bool = field(default_factory=lambda: os.getenv("ENABLE_HLS_STORAGE", "true").lower() == "true")
    storage_bucket: str = field(default_factory=lambda: os.getenv("HLS_STORAGE_BUCKET", "hls-streams"))
    cleanup_local_files: bool = field(default_factory=lambda: os.getenv("CLEANUP_LOCAL_HLS_FILES", "true").lower() == "true")
    segment_minutes: int = field(default_factory=lambda: int(os.getenv("SEGMENT_MINUTES", "5")))
    min_segment_minutes: int = field(default_factory=lambda: int(os.getenv("MIN_SEGMENT_MINUTES", "3")))


@dataclass
class TranslationConfig:
    """翻译配置"""
    model: str = field(default_factory=lambda: os.getenv("TRANSLATION_MODEL", "deepseek"))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    deepseek_api_key: str = field(default_factory=lambda: os.getenv("DEEPSEEK_API_KEY", ""))
    xai_api_key: str = field(default_factory=lambda: os.getenv("XAI_API_KEY", ""))
    groq_api_key: str = field(default_factory=lambda: os.getenv("GROQ_API_KEY", ""))
    
    def __post_init__(self):
        """验证翻译配置"""
        supported_models = ['deepseek', 'gemini', 'grok', 'groq']
        if self.model not in supported_models:
            logger.warning(f"不支持的翻译模型: {self.model}, 使用默认值: deepseek")
            self.model = 'deepseek'
        
        # 验证对应的API密钥
        key_mapping = {
            'deepseek': self.deepseek_api_key,
            'gemini': self.gemini_api_key,
            'grok': self.xai_api_key,
            'groq': self.groq_api_key
        }
        
        if not key_mapping.get(self.model):
            logger.warning(f"翻译模型 {self.model} 需要配置对应的API密钥")
    
    def get_api_key(self) -> str:
        """根据翻译模型返回对应的API密钥"""
        key_mapping = {
            'deepseek': self.deepseek_api_key,
            'gemini': self.gemini_api_key,
            'grok': self.xai_api_key,
            'groq': self.groq_api_key
        }
        return key_mapping.get(self.model, "")


@dataclass
class RuntimeConfig:
    """运行时配置（合并了ProcessingConfig和ResourceConfig）"""
    # 处理参数配置
    simplification_batch_size: int = field(default_factory=lambda: int(os.getenv("SIMPLIFICATION_BATCH_SIZE", "50")))
    tts_batch_size: int = field(default_factory=lambda: int(os.getenv("TTS_BATCH_SIZE", "3")))
    max_parallel_segments: int = field(default_factory=lambda: int(os.getenv("MAX_PARALLEL_SEGMENTS", "2")))
    
    # 流式处理配置
    tts_queue_size: int = field(default_factory=lambda: int(os.getenv("TTS_QUEUE_SIZE", "20")))
    aligned_queue_size: int = field(default_factory=lambda: int(os.getenv("ALIGNED_QUEUE_SIZE", "20")))
    preprocess_timeout: int = field(default_factory=lambda: int(os.getenv("PREPROCESS_TIMEOUT", "300")))
    compose_timeout: int = field(default_factory=lambda: int(os.getenv("COMPOSE_TIMEOUT", "600")))
    
    # 资源配置
    simplifier_actor_num_cpus: float = field(default_factory=lambda: float(os.getenv("SIMPLIFIER_ACTOR_NUM_CPUS", "0.5")))
    media_mixer_actor_num_cpus: float = field(default_factory=lambda: float(os.getenv("MEDIA_MIXER_ACTOR_NUM_CPUS", "0.5")))


@dataclass
class MemoryConfig:
    """内存管理配置"""
    max_buffer_duration: float = field(default_factory=lambda: float(os.getenv("MAX_BUFFER_DURATION", "10.0")))
    memory_threshold_mb: int = field(default_factory=lambda: int(os.getenv("MEMORY_THRESHOLD_MB", "500")))
    cleanup_interval: int = field(default_factory=lambda: int(os.getenv("CLEANUP_INTERVAL", "5")))


class AppConfigMixin:
    """应用配置混入类，提供通用方法"""
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典格式（用于兼容旧接口）"""
        return {
            # 服务器配置
            'SERVER_HOST': self.server.host,
            'SERVER_PORT': self.server.port,
            'LOG_LEVEL': self.server.log_level,
            
            # 路径配置
            'BASE_DIR': self.paths.base_dir,
            'TASKS_DIR': self.paths.tasks_dir,
            'PUBLIC_DIR': self.paths.public_dir,
            'MODEL_DIR': self.paths.model_dir,
            
            # Cloudflare配置
            'CLOUDFLARE_ACCOUNT_ID': self.cloudflare.account_id,
            'CLOUDFLARE_API_TOKEN': self.cloudflare.api_token,
            'CLOUDFLARE_D1_DATABASE_ID': self.cloudflare.database_id,
            'CLOUDFLARE_R2_ACCESS_KEY_ID': self.cloudflare.r2_access_key_id,
            'CLOUDFLARE_R2_SECRET_ACCESS_KEY': self.cloudflare.r2_secret_access_key,
            'CLOUDFLARE_R2_BUCKET_NAME': self.cloudflare.r2_bucket_name,
            
            # 音频配置
            'BATCH_SIZE': self.audio.batch_size,
            'TARGET_SPEAKER_AUDIO_DURATION': self.audio.target_speaker_audio_duration,
            'VAD_SR': self.audio.vad_sr,
            'TARGET_SR': self.audio.target_sr,
            'VOCALS_VOLUME': self.audio.vocals_volume,
            'BACKGROUND_VOLUME': self.audio.background_volume,
            'AUDIO_OVERLAP': self.audio.audio_overlap,
            'SILENCE_FADE_MS': self.audio.silence_fade_ms,
            'NORMALIZATION_THRESHOLD': self.audio.normalization_threshold,
            'SAVE_TTS_AUDIO': self.audio.save_tts_audio,
            'CLEANUP_TEMP_FILES': self.audio.cleanup_temp_files,
            
            # 音频分离配置
            'ENABLE_VOCAL_SEPARATION': self.audio.enable_vocal_separation,
            'VOCAL_SEPARATION_MODEL': self.audio.vocal_separation_model,
            'VOCAL_SEPARATION_OUTPUT_FORMAT': self.audio.vocal_separation_output_format,
            'VOCAL_SEPARATION_SAMPLE_RATE': self.audio.vocal_separation_sample_rate,
            'VOCAL_SEPARATION_TIMEOUT': self.audio.vocal_separation_timeout,
            'AUDIO_SEPARATOR_MODEL_DIR': self.audio.audio_separator_model_dir,
            
            # 翻译配置
            'TRANSLATION_MODEL': self.translation.model,
            'DEEPSEEK_API_KEY': self.translation.deepseek_api_key,
            'GEMINI_API_KEY': self.translation.gemini_api_key,
            'XAI_API_KEY': self.translation.xai_api_key,
            'GROQ_API_KEY': self.translation.groq_api_key,
            
            # 运行时配置
            'TTS_BATCH_SIZE': self.runtime.tts_batch_size,
            'SIMPLIFICATION_BATCH_SIZE': self.runtime.simplification_batch_size,
            'MAX_PARALLEL_SEGMENTS': self.runtime.max_parallel_segments,
            'SIMPLIFIER_ACTOR_NUM_CPUS': self.runtime.simplifier_actor_num_cpus,
            'MEDIA_MIXER_ACTOR_NUM_CPUS': self.runtime.media_mixer_actor_num_cpus,
            
            # 流式处理配置
            'TTS_QUEUE_SIZE': self.runtime.tts_queue_size,
            'ALIGNED_QUEUE_SIZE': self.runtime.aligned_queue_size,
            'PREPROCESS_TIMEOUT': self.runtime.preprocess_timeout,
            'COMPOSE_TIMEOUT': self.runtime.compose_timeout,
            
            # 内存配置
            'MAX_BUFFER_DURATION': self.memory.max_buffer_duration,
            'MEMORY_THRESHOLD_MB': self.memory.memory_threshold_mb,
            'CLEANUP_INTERVAL': self.memory.cleanup_interval,
            
            # 音频切片配置
            'AUDIO_CLIP_GOAL_DURATION_MS': self.audio.clip_goal_duration_ms,
            'AUDIO_CLIP_MIN_DURATION_MS': self.audio.clip_min_duration_ms,
            'AUDIO_CLIP_PADDING_MS': self.audio.clip_padding_ms,
            'AUDIO_CLIP_ALLOW_CROSS_NON_SPEECH': self.audio.clip_allow_cross_non_speech,
            
            # HLS配置
            'ENABLE_HLS_STORAGE': self.hls.enable_storage,
            'HLS_STORAGE_BUCKET': self.hls.storage_bucket,
            'CLEANUP_LOCAL_HLS_FILES': self.hls.cleanup_local_files,
            'SEGMENT_MINUTES': self.hls.segment_minutes,
            'MIN_SEGMENT_MINUTES': self.hls.min_segment_minutes,
        }


@dataclass
class AppConfig(AppConfigMixin):
    """应用程序总配置"""
    server: ServerConfig = field(default_factory=ServerConfig)
    paths: PathConfig = field(default_factory=PathConfig)
    cloudflare: CloudflareConfig = field(default_factory=CloudflareConfig)
    audio: AudioProcessingConfig = field(default_factory=AudioProcessingConfig)
    hls: HLSConfig = field(default_factory=HLSConfig)
    translation: TranslationConfig = field(default_factory=TranslationConfig)
    runtime: RuntimeConfig = field(default_factory=RuntimeConfig)
    memory: MemoryConfig = field(default_factory=MemoryConfig)
    
    def __post_init__(self):
        """初始化后验证"""
        logger.info("应用程序配置初始化完成")
        logger.info(f"服务器: {self.server.host}:{self.server.port}")
        logger.info(f"翻译模型: {self.translation.model}")
        logger.info(f"音频目标采样率: {self.audio.target_sr}")






class ConfigManager:
    """配置管理器 - 提供向后兼容的接口，自动检测环境"""
    
    def __init__(self):
        # 主机部署使用标准配置
        self.config = AppConfig()
        self.environment = 'local'
        
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"配置管理器初始化完成，环境: {self.environment}")
    
    def get_translation_api_key(self) -> str:
        """获取翻译API密钥"""
        return self.config.translation.get_api_key()
    
    
    def __getattr__(self, name: str) -> Any:
        """提供向后兼容的属性访问"""
        # 首先检查是否是直接的配置属性
        if hasattr(self.config, name):
            return getattr(self.config, name)
        
        # 然后检查字典格式的属性
        config_dict = self.config.to_dict()
        if name in config_dict:
            return config_dict[name]
        
        raise AttributeError(f"'{self.__class__.__name__}' object has no attribute '{name}'")


# 日志配置
LOG_DIR = storage_dir / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(levelname)s | %(asctime)s | %(name)s | L%(lineno)d | %(message)s",
            "datefmt": "%Y-%m-%d %H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "level": "INFO",
            "formatter": "standard",
            "stream": "ext://sys.stdout",
        },
        "file": {
            "class": "logging.handlers.RotatingFileHandler",
            "level": "DEBUG",
            "formatter": "standard",
            "filename": str(LOG_DIR / "app.log"),
            "maxBytes": 10 * 1024 * 1024,
            "backupCount": 5,
            "encoding": "utf-8",
        },
    },
    "root": {
        "level": "DEBUG",
        "handlers": ["console", "file"],
    },
}

def init_logging():
    """初始化全局日志配置"""
    # 主机部署使用文件+控制台日志
    logging.config.dictConfig(LOGGING_CONFIG)

# 全局配置实例
_config_instance = None

def get_config() -> ConfigManager:
    """获取全局配置实例"""
    global _config_instance
    if _config_instance is None:
        _config_instance = ConfigManager()
    return _config_instance

# 向后兼容的Config类
Config = ConfigManager