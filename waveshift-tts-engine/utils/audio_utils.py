import numpy as np
import soundfile as sf
import logging
from typing import Optional, Union
import asyncio

logger = logging.getLogger(__name__)

def apply_fade_effect(audio_data: np.ndarray, full_audio_buffer: Optional[np.ndarray] = None, 
                     overlap: int = 0, fade_mode: str = "overlap", position: str = "start") -> np.ndarray:
    """
    在语音片段衔接处做淡入淡出衔接，支持音频片段间过渡和静音边界过渡。
    
    Args:
        audio_data: 当前音频数据
        full_audio_buffer: 已累积的音频缓冲区（仅用于overlap模式）
        overlap: 重叠区域长度（采样点数）
        fade_mode: 渐变模式，"overlap"表示两段音频重叠过渡，"silence"表示静音边界过渡
        position: 在silence模式中，指定"start"(淡入)或"end"(淡出)
        
    Returns:
        处理后的音频数据
    """
    if audio_data is None or len(audio_data) == 0:
        return np.array([], dtype=np.float32)
    
    # 静音边界过渡模式
    if fade_mode == "silence":
        fade_length = overlap
        if fade_length <= 0 or fade_length >= len(audio_data):
            return audio_data
            
        audio_data = audio_data.copy()
        
        if position == "start":
            # 静音→语音过渡（淡入）
            fade_in = np.sqrt(np.linspace(0.0, 1.0, fade_length, dtype=np.float32))
            audio_data[:fade_length] *= fade_in
        else:
            # 语音→静音过渡（淡出）
            fade_out = np.sqrt(np.linspace(1.0, 0.0, fade_length, dtype=np.float32))
            audio_data[-fade_length:] *= fade_out
            
        return audio_data
    
    # 原有的音频重叠过渡逻辑
    if full_audio_buffer is None:
        return audio_data
        
    cross_len = min(overlap, len(full_audio_buffer), len(audio_data))
    if cross_len <= 0:
        return audio_data

    fade_out = np.sqrt(np.linspace(1.0, 0.0, cross_len, dtype=np.float32))
    fade_in  = np.sqrt(np.linspace(0.0, 1.0, cross_len, dtype=np.float32))

    audio_data = audio_data.copy()
    overlap_region = full_audio_buffer[-cross_len:]

    audio_data[:cross_len] = overlap_region * fade_out + audio_data[:cross_len] * fade_in
    return audio_data

async def mix_with_background(
    bg_path: str,
    start_time: float,
    duration: float,
    audio_data: np.ndarray,
    sample_rate: int,
    vocals_volume: float,
    background_volume: float
) -> np.ndarray:
    """
    从 bg_path 读取背景音乐，在 [start_time, start_time+duration] 区间截取，
    与 audio_data (人声) 混合。
    
    Args:
        bg_path: 背景音乐文件路径
        start_time: 开始时间（秒）
        duration: 持续时间（秒）
        audio_data: 人声音频数据
        sample_rate: 采样率
        vocals_volume: 人声音量系数
        background_volume: 背景音乐音量系数
        
    Returns:
        混合后的音频数据
    """
    try: # 添加 try...except 来捕获 sf.read 的潜在错误
        # 异步读取背景音乐
        background_audio, sr = await asyncio.to_thread(sf.read, bg_path)
        logger.debug(f"mix_with_background: 读取背景音频: {bg_path}, 长度: {len(background_audio)}, 采样率: {sr}") # 使用 debug 级别
        background_audio = np.asarray(background_audio, dtype=np.float32)
        
        # 验证音频格式（VocalSeparator已确保单声道输出）
        if background_audio.ndim != 1:
            logger.error(f"mix_with_background: 背景音频格式异常 {background_audio.shape}，期望单声道")
            return audio_data * vocals_volume  # 降级处理，只返回人声
        logger.debug(f"mix_with_background: 背景音频格式正确 {background_audio.shape}")
        if sr != sample_rate:
            logger.warning(
                f"背景音采样率={sr} 与目标={sample_rate}不匹配, 未做重采样, 可能有问题."
            )
    except Exception as e:
        logger.error(f"mix_with_background: 读取背景音频失败: {bg_path}, 错误: {e}", exc_info=True)
        # 如果读取失败，直接返回原始人声音频（应用音量）
        target_length = int(duration * sample_rate)
        result = np.zeros(target_length, dtype=np.float32)
        audio_len = min(len(audio_data), target_length)
        if audio_len > 0:
             result[:audio_len] = audio_data[:audio_len] * vocals_volume
        return result

    target_length = int(duration * sample_rate)
    start_sample = int(start_time * sample_rate)
    end_sample   = start_sample + target_length

    if end_sample <= len(background_audio):
        bg_segment = background_audio[start_sample:end_sample]
    else:
        bg_segment = background_audio[start_sample:]

    result = np.zeros(target_length, dtype=np.float32)
    audio_len = min(len(audio_data), target_length)
    bg_len    = min(len(bg_segment), target_length)

    # 混合人声 & 背景
    if audio_len > 0:
        result[:audio_len] = audio_data[:audio_len] * vocals_volume
        logger.warning(f"mix_with_background: 添加人声后 result 最大绝对值: {np.max(np.abs(result)):.4f} (vocals_volume={vocals_volume:.2f})")
    else:
         logger.warning("mix_with_background: 人声音频长度为 0")


    if bg_len > 0:
        # 检查 NaN 或 Inf
        if np.isnan(bg_segment).any() or np.isinf(bg_segment).any():
             logger.error("mix_with_background: 背景音频片段包含 NaN 或 Inf 值！跳过混合背景音。")
        else:
            # 直接按背景音量系数缩放并混合背景音
            bg_scaled = bg_segment[:bg_len] * background_volume
            result[:bg_len] += bg_scaled
            logger.debug(f"mix_with_background: 混合背景音后 result 最大绝对值: {np.max(np.abs(result)):.4f} (background_volume={background_volume:.2f})")
    else:
        logger.warning("mix_with_background: 背景音频片段长度为 0，不进行混合")


    return result

def normalize_audio(audio_data: np.ndarray, max_val: float = 1.0) -> np.ndarray:
    """
    对音频做简单归一化
    
    Args:
        audio_data: 音频数据
        max_val: 最大音量值
        
    Returns:
        归一化后的音频数据
    """
    if len(audio_data) == 0:
        logger.debug("normalize_audio: 音频数据为空，跳过归一化")
        return audio_data
    current_max = np.max(np.abs(audio_data))
    logger.debug(f"normalize_audio: 归一化前最大绝对值: {current_max:.4f}, 目标 max_val: {max_val:.2f}")
    if current_max > max_val:
        scale_factor = max_val / current_max
        audio_data = audio_data * scale_factor
        logger.debug(f"normalize_audio: 执行归一化，缩放因子: {scale_factor:.4f}")
    else:
        logger.debug("normalize_audio: 无需归一化")
    return audio_data 