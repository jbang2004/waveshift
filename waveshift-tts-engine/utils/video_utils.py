import os
import soundfile as sf
import numpy as np
import logging
from contextlib import ExitStack
from tempfile import NamedTemporaryFile
from typing import List, Any
from pathlib import Path
import asyncio

from utils.ffmpeg_utils import cut_video_track, cut_video_with_audio, cut_video_with_subtitles_and_audio
from utils.subtitle_utils import generate_subtitles_for_segment

logger = logging.getLogger(__name__)

async def add_video_segment(
    video_path: str,
    start_time: float,
    duration: float,
    audio_data: np.ndarray,
    output_path: str,
    sentences: List[Any],
    generate_subtitle: bool,
    target_language: str,
    sample_rate: int,
    video_width: int,
    video_height: int
):
    """
    从原视频里截取 [start_time, start_time + duration] 的视频段(无声)，
    与合成音频合并。
    若 generate_subtitle=True, 则生成 .ass 字幕并在 ffmpeg 工具中进行"烧制"。
    
    Args:
        video_path: 视频文件路径
        start_time: 开始时间（秒）
        duration: 持续时间（秒）
        audio_data: 音频数据
        output_path: 输出文件路径
        sentences: 句子列表
        generate_subtitle: 是否生成字幕
        target_language: 目标语言
        sample_rate: 采样率
        video_width: 视频宽度
        video_height: 视频高度
    """
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"add_video_segment: 视频文件不存在: {video_path}")
    if len(audio_data) == 0:
        raise ValueError("add_video_segment: 无音频数据")
    if duration <= 0:
        raise ValueError("add_video_segment: 无效时长 <=0")

    with ExitStack() as stack:
        temp_video = stack.enter_context(NamedTemporaryFile(suffix='.mp4'))
        temp_audio = stack.enter_context(NamedTemporaryFile(suffix='.wav'))

        end_time = start_time + duration

        # 1) 截取视频 (无音轨)
        await cut_video_track(
            input_path=video_path,
            output_path=temp_video.name,
            start=start_time,
            end=end_time
        )

        # 2) 写合成音频到临时文件 - 异步写入
        await asyncio.to_thread(sf.write, temp_audio.name, audio_data, sample_rate)

        # 3) 如果需要字幕，则构建 .ass 并用 ffmpeg "烧"进去
        if generate_subtitle:
            temp_ass = stack.enter_context(NamedTemporaryFile(suffix='.ass'))
            # 调用生成字幕的函数 - 异步生成
            await asyncio.to_thread(
                generate_subtitles_for_segment,
                sentences,
                start_time * 1000,   # 开始时间（毫秒）
                temp_ass.name,
                target_language,
                video_width,
                video_height
            )

            # 生成带字幕的视频
            await cut_video_with_subtitles_and_audio(
                input_video_path=temp_video.name,
                input_audio_path=temp_audio.name,
                subtitles_path=temp_ass.name,
                output_path=output_path
            )
        else:
            # 不加字幕，仅合并音频
            await cut_video_with_audio(
                input_video_path=temp_video.name,
                input_audio_path=temp_audio.name,
                output_path=output_path
            )