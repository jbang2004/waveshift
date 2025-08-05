# --------------------------------------
# utils/ffmpeg_utils.py
# 彻底移除 force_style, 仅使用 .ass 内部样式
# --------------------------------------
import logging
import subprocess
from pathlib import Path
from typing import List, Tuple, Optional, Union
import asyncio
import numpy as np

logger = logging.getLogger(__name__)


async def run_command(cmd: List[str], input_bytes: Optional[bytes] = None) -> Tuple[bytes, bytes]:
    """
    异步运行 ffmpeg 命令，返回 (stdout, stderr)，支持输入管道数据 input_bytes。
    若命令返回码非 0，则抛出 RuntimeError。
    """
    logger.debug(f"[FFmpegUtils] Running command: {' '.join(cmd)}")
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdin=asyncio.subprocess.PIPE if input_bytes is not None else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await process.communicate(input=input_bytes)
    if process.returncode != 0:
        error_msg = stderr.decode() or "Unknown error"
        logger.error(f"[FFmpegUtils] Command failed with error: {error_msg}")
        raise RuntimeError(f"FFmpeg command failed: {error_msg}")
    return stdout, stderr

async def extract_audio(
    input_path: str,
    output_path: str,
    start: float = 0.0,
    duration: Optional[float] = None
) -> None:
    """
    提取音频，可选指定起始时间与持续时长。
    输出为单声道 PCM float32 (48k/16k 视需求).
    """
    cmd = ["ffmpeg", "-y", "-i", input_path]
    if start > 0:
        cmd += ["-ss", str(start)]
    if duration is not None:
        cmd += ["-t", str(duration)]

    cmd += [
        "-vn",                # 去掉视频
        "-acodec", "pcm_f32le",
        "-ac", "1",
        output_path
    ]
    await run_command(cmd)

async def extract_video(
    input_path: str,
    output_path: str,
    start: float = 0.0,
    duration: Optional[float] = None
) -> None:
    """
    提取纯视频（去掉音轨），可选指定起始时间与持续时长。
    """
    cmd = ["ffmpeg", "-y", "-i", input_path]
    if start > 0:
        cmd += ["-ss", str(start)]
    if duration is not None:
        cmd += ["-t", str(duration)]

    cmd += [
        "-an",                # 去掉音频
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "18",
        "-tune", "fastdecode",
        output_path
    ]
    await run_command(cmd)

async def hls_segment(
    input_path: str,
    segment_pattern: str,
    playlist_path: str,
    hls_time: int = 10
) -> None:
    """
    将输入视频切割为 HLS 片段。
    segment_pattern 形如 "out%03d.ts"
    playlist_path   形如 "playlist.m3u8"
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-c", "copy",
        "-f", "hls",
        "-hls_time", str(hls_time),
        "-hls_list_size", "0",
        "-hls_segment_type", "mpegts",
        "-hls_flags", "append_list+omit_endlist",  # 追加模式，不添加endlist
        "-hls_allow_cache", "0",  # 禁用缓存
        "-hls_segment_filename", segment_pattern,
        playlist_path
    ]
    await run_command(cmd)

async def cut_video_track(
    input_path: str,
    output_path: str,
    start: float,
    end: float
) -> None:
    """
    截取 [start, end] 的无声视频段，end为绝对秒数。
    """
    duration = end - start
    if duration <= 0:
        raise ValueError(f"Invalid duration: {duration}")

    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-ss", str(start),
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "superfast",
        "-an",  # 去除音轨
        "-vsync", "vfr",
        output_path
    ]
    await run_command(cmd)

async def cut_video_with_audio(
    input_video_path: str,
    input_audio_path: str,
    output_path: str
) -> None:
    """
    将无声视频与音频合并 (视频copy，音频AAC)。
    """
    cmd = [
        "ffmpeg", "-y",
        "-i", input_video_path,
        "-i", input_audio_path,
        "-c:v", "copy",
        "-c:a", "aac",
        output_path
    ]
    await run_command(cmd)

async def cut_video_with_subtitles_and_audio(
    input_video_path: str,
    input_audio_path: str,
    subtitles_path: str,
    output_path: str
) -> None:
    """
    将无声视频 + 音频 + .ass字幕 合并输出到 output_path。
    (无 force_style, 由 .ass 内样式全权决定)
    
    若字幕渲染失败，则回退到仅合并音视频。
    """
    # 检查输入文件是否存在
    for file_path in [input_video_path, input_audio_path, subtitles_path]:
        if not Path(file_path).exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

    # 构建"subtitles"过滤器, 不带 force_style
    escaped_path = subtitles_path.replace(':', r'\\:')

    try:
        # 方式1: subtitles 滤镜
        # 当前设置是合理的，但需要注意：
        cmd = [
            "ffmpeg", "-y",
            "-i", input_video_path,
            "-i", input_audio_path,
            "-filter_complex",
            f"[0:v]subtitles='{escaped_path}'[v]",
            "-map", "[v]",
            "-map", "1:a",
            "-c:v", "libx264",
            "-preset", "superfast",
            "-crf", "23",  # 建议添加 CRF 参数控制视频质量
            "-c:a", "aac",
            output_path
        ]
        await run_command(cmd)

    except RuntimeError as e:
        logger.warning(f"[FFmpegUtils] subtitles滤镜方案失败: {str(e)}")
        # 方式2: 最终回退 - 仅合并音视频
        cmd = [
            "ffmpeg", "-y",
            "-i", input_video_path,
            "-i", input_audio_path,
            "-c:v", "copy",
            "-c:a", "aac",
            output_path
        ]
        await run_command(cmd)
        logger.warning("[FFmpegUtils] 已跳过字幕，仅合并音视频")

async def get_duration(input_path: str) -> float:
    """
    获取视频/音频文件的持续时长（秒）。
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        input_path
    ]
    try:
        stdout, _ = await run_command(cmd)
        return float(stdout.decode().strip())
    except (ValueError, RuntimeError) as e:
        logger.error(f"[FFmpegUtils] 获取时长失败: {str(e)}, 输入: {input_path}")
        raise

async def concat_videos(input_list: str, output_path: str) -> Union[Path, None]:
    """
    根据合并列表文件合并视频片段。
    
    Args:
        input_list: 合并列表文件路径
        output_path: 输出视频路径
        
    Returns:
        Path: 合并后的视频文件路径，若失败则返回None
    """
    cmd = [
        "ffmpeg", "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", input_list,
        "-c", "copy",
        output_path
    ]
    
    try:
        await run_command(cmd)
        return Path(output_path)
    except Exception as e:
        logger.error(f"[FFmpegUtils] 合并视频失败: {e}")
        return None

async def change_speed_ffmpeg(audio: np.ndarray, speed: float, sample_rate: int = 24000) -> np.ndarray:
    """使用 FFmpeg 的 atempo 滤镜对 PCM float32 数组进行变速，保持音高不变（异步）。"""
    if speed <= 0:
        raise ValueError(f"Invalid speed factor: {speed}")
    
    # FFmpeg atempo滤镜的限制：速度必须在0.5到100之间
    # 但如果出现异常值，应该记录错误并抛出异常，而不是强制限制
    if speed < 0.5 or speed > 100.0:
        raise ValueError(f"Speed factor {speed} is out of FFmpeg atempo range [0.5, 100.0]. This indicates a calculation error in duration alignment.")
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "f32le", "-ar", str(sample_rate), "-ac", "1", "-i", "pipe:0",
        "-filter:a", f"atempo={speed}",
        "-f", "f32le", "pipe:1"
    ]
    stdout, _ = await run_command(cmd, input_bytes=audio.tobytes())
    return np.frombuffer(stdout, dtype=np.float32)
