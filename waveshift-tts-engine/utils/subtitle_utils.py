import pysubs2
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def generate_subtitles_for_segment(
    sentences: List[Any],
    start_time_ms: float,
    output_sub_path: str,
    target_language: str = "en",
    video_width: int = -1,      # New parameter with default
    video_height: int = -1     # New parameter with default
):
    """
    使用 pysubs2 生成 ASS 字幕文件.
    1. 遍历每条 Sentence, 计算其精确的语音起止时间.
    2. 向 pysubs2 中写入事件, 并设置"类YouTube"的默认样式.
    3. 对字幕事件进行后处理, 调整重叠和间距.
    4. 最后保存为 .ass 文件.

    Args:
        sentences: 本段的句子列表
        start_time_ms: 当前片段的起始时间（毫秒）
        output_sub_path: 存放字幕的 .ass 路径
        target_language: 用来确定拆分逻辑(中文/英文/日文/韩文)
        video_width: 视频宽度
        video_height: 视频高度
    """
    subs = pysubs2.SSAFile()

    # --- Define Design Resolution (hardcoded style values are based on this) ---
    DESIGN_VIDEO_WIDTH = 1280
    DESIGN_VIDEO_HEIGHT = 720

    # --- Set PlayResX and PlayResY to actual video dimensions ---
    if video_width > 0 and video_height > 0:
        subs.info['PlayResX'] = str(video_width)
        subs.info['PlayResY'] = str(video_height)
        subs.info['ScaledBorderAndShadow'] = 'yes' # Recommended for consistent scaling
        logger.info(f"ASS PlayResX set to {video_width}, PlayResY set to {video_height}")
        
        # Calculate scaling factors
        width_scale_factor = video_width / DESIGN_VIDEO_WIDTH
        height_scale_factor = video_height / DESIGN_VIDEO_HEIGHT
    else:
        # Fallback if video dimensions are not provided or invalid
        # Use design resolution as PlayRes, no scaling needed for style values
        subs.info['PlayResX'] = str(DESIGN_VIDEO_WIDTH)
        subs.info['PlayResY'] = str(DESIGN_VIDEO_HEIGHT)
        subs.info['ScaledBorderAndShadow'] = 'yes'
        logger.warning("Video dimensions not provided or invalid. Using design resolution for ASS PlayRes. Subtitles might not scale correctly.")
        width_scale_factor = 1.0
        height_scale_factor = 1.0

    for s in sentences:
        sub_text = (s.trans_text or s.raw_text or "").strip()
        if not sub_text:
            logger.debug(f"Sentence {(getattr(s, 'sentence_id', 'N/A'))} has no text, skipping subtitle.")
            continue

        # --- 计算字幕开始时间 ---
        # 处理首句可能有的开头静音
        if s.is_first and s.start_ms > 0:
            subtitle_start_ms = s.start_ms
            logger.debug(f"首句，应用开头静音偏移: {s.start_ms}ms")
        else:
            subtitle_start_ms = s.adjusted_start - start_time_ms
        
        # --- 计算字幕显示时长 ---
        # 直接使用speech_duration (已在duration_utils.py中计算好，包含了速度调整)
        if not hasattr(s, 'speech_duration') or not isinstance(s.speech_duration, (int, float)) or s.speech_duration <= 0:
            logger.error(f"句子 {getattr(s, 'sentence_id', 'N/A')} 缺少有效的speech_duration值: {getattr(s, 'speech_duration', 'N/A')}")
            continue
            
        subtitle_duration_ms = s.speech_duration
        
        # --- 分割长文本并创建字幕块 ---
        lang = target_language or "en"
        if hasattr(s, 'lang') and s.lang:  # 如果句子本身有语言标记，优先使用
            lang = s.lang

        blocks = split_long_text_to_sub_blocks(
            text=sub_text,
            start_ms=subtitle_start_ms,
            duration_ms=subtitle_duration_ms,
            lang=lang
        )

        for block in blocks:
            block_start_for_event = max(0, int(block["start"]))
            block_end_for_event = max(block_start_for_event + 1, int(block["end"]))

            evt = pysubs2.SSAEvent(
                start=block_start_for_event,
                end=block_end_for_event,
                text=block["text"]
            )
            subs.append(evt)

    # --- Adjustments for overlaps and gaps (Point 2 & 3) ---
    if subs.events:
        subs.sort() 
        
        min_event_duration_ms = 100 
        min_gap_between_events_ms = 40 # Based on "一定的间距" and suggest's comment

        adjusted_events = []
        for i in range(len(subs.events)):
            current_event = subs.events[i]
            
            # Ensure minimum duration for the current event first
            if current_event.end < current_event.start + min_event_duration_ms:
                current_event.end = current_event.start + min_event_duration_ms

            if i > 0:
                prev_event = adjusted_events[-1] # Get the last *adjusted* previous event

                # Ensure gap between prev_event and current_event
                # current_event should start at least min_gap after prev_event.end
                if current_event.start < prev_event.end + min_gap_between_events_ms:
                    # Shift current_event later
                    current_event.start = prev_event.end + min_gap_between_events_ms
                    # Recalculate current_event.end to maintain its duration or min_duration
                    # Original duration for current_event was current_event.end (before shift) - (original current_event.start)
                    # For simplicity, just ensure min_duration after shifting start
                    current_event.end = max(current_event.end, current_event.start + min_event_duration_ms)

                # Ensure prev_event does not overlap with (now possibly shifted) current_event
                # prev_event.end should be at most current_event.start - min_gap
                if prev_event.end > current_event.start - min_gap_between_events_ms:
                    prev_event.end = current_event.start - min_gap_between_events_ms
                    # Ensure prev_event still has min_duration
                    if prev_event.end < prev_event.start + min_event_duration_ms:
                        prev_event.end = prev_event.start + min_event_duration_ms
                        # If this re-causes overlap, it's a very dense situation.
                        # The primary rule is prev_event.end <= current_event.start - min_gap
                        if prev_event.end > current_event.start - min_gap_between_events_ms:
                           prev_event.end = current_event.start - min_gap_between_events_ms


            if current_event.end > current_event.start:
                adjusted_events.append(current_event)
            else:
                logger.warning(f"Subtitle event (text: '{current_event.text[:20]}...') "
                               f"has invalid duration ({current_event.start}ms - {current_event.end}ms) "
                               f"after adjustments and will be dropped.")
        
        subs.events = adjusted_events
        
        # Final check on the last event's duration if any events survived
        if subs.events:
            last_event = subs.events[-1]
            if last_event.end < last_event.start + min_event_duration_ms:
                last_event.end = last_event.start + min_event_duration_ms
            if last_event.end <= last_event.start: # If still invalid
                logger.warning(f"Last subtitle event (text: '{last_event.text[:20]}...') became invalid and was removed.")
                subs.events.pop()


    # --- 设置"类YouTube"的默认样式 (original values are for DESIGN_VIDEO_WIDTH x DESIGN_VIDEO_HEIGHT) ---
    style = subs.styles.get("Default", pysubs2.SSAStyle())

    # Original style values (designed for DESIGN_VIDEO_WIDTH x DESIGN_VIDEO_HEIGHT)
    original_fontsize = 60
    original_marginv = 30
    original_marginl = 30
    original_marginr = 30
    original_spacing = 0.5
    # Assuming borderstyle = 3 (opaque box), outline and shadow are less critical for direct scaling here
    # If borderstyle = 1 (outline), then outline thickness would need scaling:
    # original_outline_thickness = 2 # example
    # style.outline = max(1, round(original_outline_thickness * height_scale_factor)) 

    style.fontname = "Arial"             
    style.fontsize = max(1, round(original_fontsize * width_scale_factor))
    style.bold = True
    style.italic = False
    style.underline = False

    style.primarycolor = pysubs2.Color(255, 255, 255, 0)
    style.outlinecolor = pysubs2.Color(0, 0, 0, 100)
    style.borderstyle = 3  
    style.shadow = 0 # If shadow had a distance, it would be scaled by height_scale_factor
    style.alignment = pysubs2.Alignment.BOTTOM_CENTER
    style.marginv = max(0, round(original_marginv * height_scale_factor))
    style.marginl = max(0, round(original_marginl * width_scale_factor))
    style.marginr = max(0, round(original_marginr * width_scale_factor))
    style.spacing = original_spacing * width_scale_factor # Spacing can be float

    subs.styles["Default"] = style

    # 写入文件
    try:
        subs.save(output_sub_path, format="ass", encoding="utf-8")
        logger.info(f"generate_subtitles_for_segment: Subtitles successfully written to => {output_sub_path}")
    except Exception as e:
        logger.error(f"Failed to save subtitle file to {output_sub_path}: {e}", exc_info=True)

def split_long_text_to_sub_blocks(
    text: str,
    start_ms: float,
    duration_ms: float,
    lang: str = "en"
) -> List[Dict[str, Any]]:
    """
    将文本在 [start_ms, start_ms+duration_ms] 区间内拆分成多块 sequential 字幕，
    并按照每块的字符数在总时长内做比例分配。

    Args:
        text: 要拆分的文本
        start_ms: 开始时间（毫秒）
        duration_ms: 持续时间（毫秒）
        lang: 语言代码，"zh"/"ja"/"ko"/"en"，若无匹配则默认英文
        
    Returns:
        字幕块列表，每个块包含开始时间、结束时间和文本
    """
    # 1) 确定每行最大字符数
    recommended_max_chars = {
        "zh": 20,
        "ja": 20,
        "ko": 20,
        "en": 40
    }
    if lang not in recommended_max_chars:
        lang = "en"
    max_chars = recommended_max_chars[lang]

    if len(text) <= max_chars:
        # 不需要拆分
        return [{
            "start": start_ms,
            "end":   start_ms + duration_ms,
            "text":  text
        }]

    # 2) 根据语言拆分成若干行
    chunks = chunk_text_by_language(text, lang, max_chars)

    # 3) 根据各行的字符数在总时长内进行时间分配
    sub_blocks = []
    total_chars = sum(len(c) for c in chunks)
    current_start = start_ms

    for c in chunks:
        chunk_len = len(c)
        chunk_dur = duration_ms * (chunk_len / total_chars) if total_chars > 0 else 0
        block_start = current_start
        block_end   = current_start + chunk_dur

        sub_blocks.append({
            "start": block_start,
            "end":   block_end,
            "text":  c
        })
        current_start += chunk_dur

    # 修正最后一块结束
    if sub_blocks:
        sub_blocks[-1]["end"] = start_ms + duration_ms
    else:
        # 理论上不会发生
        sub_blocks.append({
            "start": start_ms,
            "end":   start_ms + duration_ms,
            "text":  text
        })

    return sub_blocks

def chunk_text_by_language(text: str, lang: str, max_chars: int) -> List[str]:
    """
    根据语言做拆分:
     - 英文: 优先按标点拆分，其次按空格，避免截断单词
     - 中/日/韩: 优先按标点拆分，其次按字符二分法拆分
     
    Args:
        text: 要拆分的文本
        lang: 语言代码
        max_chars: 每行最大字符数
        
    Returns:
        拆分后的文本块列表
    """
    # 关键标点符号：逗号、句号、分号、问号、感叹号
    priority_puncts = set(",.!?;，。！？；")
    
    # 所有可用标点符号
    cjk_puncts = set("，,。.!！？?；;：:、…~—")
    eng_puncts = set(".,!?;:")

    if lang == "en":
        return chunk_english_text(text, max_chars, priority_puncts, eng_puncts)
    else:
        return chunk_cjk_text(text, max_chars, priority_puncts, cjk_puncts)

def chunk_english_text(text: str, max_chars: int, priority_puncts: set, all_puncts: set) -> List[str]:
    """
    英文文本拆分，优先按标点符号拆分，其次按单词边界拆分
    
    Args:
        text: 英文文本
        max_chars: 每行最大字符数
        priority_puncts: 优先考虑的标点符号集合
        all_puncts: 所有标点符号集合
        
    Returns:
        拆分后的文本块列表
    """
    if len(text) <= max_chars:
        return [text]
    
    chunks = []
    remaining_text = text
    
    while len(remaining_text) > 0:
        if len(remaining_text) <= max_chars:
            chunks.append(remaining_text)
            break
            
        # 在max_chars范围内寻找优先标点
        cut_pos = -1
        for i in range(max_chars, 0, -1):
            if i >= len(remaining_text):
                continue
            if remaining_text[i] in priority_puncts:
                cut_pos = i + 1  # 包含标点符号
                break
        
        # 如果没找到优先标点，尝试找其他标点
        if cut_pos == -1:
            for i in range(max_chars, 0, -1):
                if i >= len(remaining_text):
                    continue
                if remaining_text[i] in all_puncts:
                    cut_pos = i + 1  # 包含标点符号
                    break
        
        # 如果没找到标点，尝试在空格处分割
        if cut_pos == -1:
            for i in range(max_chars, 0, -1):
                if i >= len(remaining_text):
                    continue
                if remaining_text[i] == ' ':
                    cut_pos = i + 1  # 包含空格
                    break
        
        # 如果依然没找到合适的分割点，但当前位置是单词中间
        # 向后找到第一个空格，即使超过max_chars
        if cut_pos == -1:
            for i in range(max_chars, min(len(remaining_text), max_chars * 2)):
                if i >= len(remaining_text):
                    break
                if remaining_text[i] == ' ':
                    cut_pos = i + 1  # 包含空格
                    break
        
        # 如果还是找不到，就在max_chars处截断
        if cut_pos == -1 or cut_pos == 0:
            cut_pos = max_chars
        
        chunks.append(remaining_text[:cut_pos].strip())
        remaining_text = remaining_text[cut_pos:].strip()
    
    return chunks

def chunk_cjk_text(text: str, max_chars: int, priority_puncts: set, all_puncts: set) -> List[str]:
    """
    中日韩文本拆分，优先按标点处断行，其次进行二分法拆分
    
    Args:
        text: 中日韩文本
        max_chars: 每行最大字符数
        priority_puncts: 优先考虑的标点符号集合
        all_puncts: 所有标点符号集合
        
    Returns:
        拆分后的文本块列表
    """
    if len(text) <= max_chars:
        return [text]
    
    chunks = []
    remaining_text = text
    
    while len(remaining_text) > 0:
        if len(remaining_text) <= max_chars:
            chunks.append(remaining_text)
            break
            
        # 在max_chars范围内寻找优先标点
        cut_pos = -1
        for i in range(max_chars, 0, -1):
            if i >= len(remaining_text):
                continue
            if remaining_text[i] in priority_puncts:
                cut_pos = i + 1  # 包含标点符号
                break
        
        # 如果没找到优先标点，尝试找其他标点
        if cut_pos == -1:
            for i in range(max_chars, 0, -1):
                if i >= len(remaining_text):
                    continue
                if remaining_text[i] in all_puncts:
                    cut_pos = i + 1  # 包含标点符号
                    break
        
        # 如果没找到合适标点，进行二分法拆分
        if cut_pos == -1:
            # 二分法：取段落长度的一半
            half_length = min(max_chars, len(remaining_text) // 2)
            if half_length > 0:
                cut_pos = half_length
            else:
                cut_pos = max_chars
        
        chunks.append(remaining_text[:cut_pos].strip())
        remaining_text = remaining_text[cut_pos:].strip()
    
    return chunks 