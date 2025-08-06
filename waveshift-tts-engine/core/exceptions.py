"""
WaveShift TTS Engine - 自定义异常类

提供具体的异常类型，改进错误处理和调试
"""


class TTSError(Exception):
    """TTS引擎基础异常类"""
    pass


class ConfigError(TTSError):
    """配置相关错误"""
    pass


class ModelLoadError(TTSError):
    """模型加载错误"""
    pass


class SynthesisError(TTSError):
    """语音合成错误"""
    pass


class AudioProcessingError(TTSError):
    """音频处理错误"""
    pass


class DurationAlignmentError(TTSError):
    """时长对齐错误"""
    pass


class MediaMixingError(TTSError):
    """媒体混合错误"""
    pass


class HLSGenerationError(TTSError):
    """HLS生成错误"""
    pass


class TranslationError(TTSError):
    """翻译/简化错误"""
    pass


class ResourceError(TTSError):
    """资源管理错误"""
    pass


class ValidationError(TTSError):
    """输入验证错误"""
    pass


class DependencyError(TTSError):
    """依赖服务错误"""
    pass


class TimeoutError(TTSError):
    """超时错误"""
    pass


class CloudflareError(TTSError):
    """Cloudflare服务错误"""
    pass


def handle_exception(exception: Exception, context: str = "") -> str:
    """
    统一的异常处理函数
    
    Args:
        exception: 捕获的异常
        context: 错误上下文信息
        
    Returns:
        格式化的错误消息
    """
    error_msg = f"{context}: {type(exception).__name__}: {str(exception)}" if context else f"{type(exception).__name__}: {str(exception)}"
    
    # 根据异常类型提供具体的处理建议
    if isinstance(exception, ModelLoadError):
        error_msg += " [建议: 检查模型文件是否存在且完整]"
    elif isinstance(exception, ConfigError):
        error_msg += " [建议: 检查配置文件和环境变量]"
    elif isinstance(exception, ResourceError):
        error_msg += " [建议: 检查系统资源（内存/GPU）]"
    elif isinstance(exception, ValidationError):
        error_msg += " [建议: 验证输入参数格式]"
    elif isinstance(exception, TimeoutError):
        error_msg += " [建议: 增加超时时间或优化处理]"
    
    return error_msg