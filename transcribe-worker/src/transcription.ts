/**
 * 转录核心模块
 * 包含Gemini转录的核心功能，从Python版本移植而来
 * 
 * v2.0 更新：
 * - 增强的系统提示词，通过指令层面防止重复内容生成
 * - 优化的防重复机制，提高转录质量
 * - 简化代码结构，移除重复逻辑
 */

// 转录风格类型
export type TranscriptionStyle = 'normal' | 'classical';

// 转录结果类型
export interface TranscriptionSegment {
  sequence: number;
  start: string;
  end: string;
  content_type: 'speech' | 'singing' | 'non_speech_human_vocalizations' | 'non_human_sounds';
  speaker: string;
  original: string;
  translation: string;
}

/**
 * 生成基础翻译要求
 */
function getTranslationRequirements(targetLanguage: string, style: TranscriptionStyle): string {
  const targetLangName = targetLanguage === 'chinese' ? '中文(简体)' : 'English';
  
  if (style === 'normal') {
    return `
### **Translation Requirements**

**Target Language:** ${targetLangName}
**Translation Style:** Natural and Modern Style

- Use natural, contemporary language that sounds fluent and idiomatic
- Maintain the original meaning while adapting to target language conventions
- Preserve emotional tone and context
- Translate colloquialisms and slang appropriately for the target audience
- Keep technical terms accurate and consistent
`;
  } else {
    return `
### **Translation Requirements**

**Target Language:** ${targetLangName}
**Translation Style:** Adaptive Hybrid Style

The translation should dynamically switch between a modern, natural style and a classical, elevated style based on the context of the dialogue. Follow these rules:

**1. Default to a Modern/Natural Style for most content, including:**
- Everyday conversations, small talk, and functional exchanges
- Technical or procedural explanations
- Direct questions and answers
- Colloquialisms, slang, and filler words (translate them naturally)

**2. Switch to a Classical/Elevated Style ONLY for specific contexts, such as:**
- Quotations from literature, historical texts, or philosophical works
- Formal declarations, solemn vows, or official pronouncements
- Literary or poetic narration
- Moments of profound, universal emotion (e.g., reflections on fate, honor, or destiny)

**Style Definitions:**
- **For English Classical Style:** Use elevated vocabulary, more complex sentence structures, and a formal, dignified tone. Think of high-quality literary prose, not archaic language like "thee" and "thou."
- **For Chinese Classical Style:** Use a semi-classical (半文半白) approach. Employ concise, elegant vocabulary, use idioms (成语) where appropriate, and create a compact sentence structure to achieve a scholarly and refined tone.
`;
  }
}

/**
 * 生成转录提示词
 */
export function getTranscriptionPrompt(targetLanguage: string, style: TranscriptionStyle = 'normal'): string {
  const translationBlock = getTranslationRequirements(targetLanguage, style);
  
  return `
**Transcription Task: Complete Audio/Video Transcription**

Transcribe this audio/video file completely with the following requirements:

**Key Principle:** The primary goal is a clean, readable transcript focused on dialogue. All non-speech sounds are secondary and must be consolidated to support the narrative, not interrupt it.

---
${translationBlock}
---

### **Speaker Identification Guidelines (CRITICAL)**

**Primary Goal:** Use Real Names whenever possible (e.g., \`John\`, \`Dr. Emily Chen\`, \`Maria\`, \`Interviewer\`)

**Speaker Identification Strategy:**
1. **Listen for Direct Mentions**: Names mentioned in conversation, introductions, or direct address
2. **Professional Titles**: Use titles like "Doctor", "Professor", "Interviewer", "Host" when names aren't available
3. **Context Clues**: Infer from conversation context, roles, or relationships
4. **Voice Characteristics**: Distinguish between different speakers by voice, tone, and speaking patterns

**Fallback Method:** Only when names absolutely cannot be determined, use sequential placeholders: \`Speaker A\`, \`Speaker B\`, \`Speaker C\`, etc.

**Speaker Switching Detection:**
- Listen carefully for voice changes, tone differences, and speaking patterns
- Assign the most appropriate identifier when detecting a clear change in speaker
- Prioritize real names and titles over generic placeholders
- For non-speech content, always use "N/A" as the speaker

---

### **1. Content Classification**

**Speech:** Clear dialogue and conversation with meaningful semantic content
**Singing:** Vocal performance with musical elements, including humming, singing songs, or any melodic vocal expressions
**Non-Speech Human Vocalizations:** Laughter, sighs, gasps, filler words ("um", "uh"), exclamations, interjections, emotional vocal sounds, breathing, throat clearing, coughing, sniffling
**Non-Human Sounds:** Music, sound effects, ambient sounds

### **2. Segmentation Rules (CRITICAL)**

- Segment speech by natural pauses, breathing, and speaker changes
- Record all content types as separate segments when they occur
- Each segment must contain distinct content with accurate timing
- Maintain chronological order without overlaps

### **3. Time Rules (CRITICAL)**

- Start time of each segment ≥ end time of previous segment
- End time of each segment > start time of itself
- All segments in chronological order without time overlaps or gaps
- Use format: "XmYsZms" (e.g., "0m1s682ms", "1m15s0ms", "2m30s500ms")

### **4. Output Format (CRITICAL)**

Output each segment as a complete JSON object on a separate line (NDJSON format):

**Example Output:**
\`\`\`
{"sequence":1,"start":"0m0s0ms","end":"0m2s500ms","content_type":"speech","speaker":"John","original":"I think we should go now.","translation":"我觉得我们现在应该走了。"}
{"sequence":2,"start":"0m2s500ms","end":"0m4s200ms","content_type":"non_human_sounds","speaker":"N/A","original":"Tense music begins to play","translation":"紧张的音乐开始播放"}
{"sequence":3,"start":"0m4s200ms","end":"0m5s100ms","content_type":"singing","speaker":"Maria","original":"Happy birthday to you","translation":"祝你生日快乐"}
{"sequence":4,"start":"0m5s100ms","end":"0m6s800ms","content_type":"non_speech_human_vocalizations","speaker":"John","original":"Deep sigh and throat clearing","translation":"深深叹气和清嗓子"}
{"sequence":5,"start":"0m6s800ms","end":"0m9s300ms","content_type":"speech","speaker":"Maria","original":"I agree. It's not safe here.","translation":"我同意。这里不安全。"}
{"sequence":6,"start":"0m9s300ms","end":"0m11s800ms","content_type":"speech","speaker":"Interviewer","original":"Can you tell us more about this?","translation":"你能告诉我们更多关于这件事的信息吗？"}
\`\`\`

**IMPORTANT OUTPUT GUIDELINES:**
- Write content naturally without any brackets, parentheses, or special symbols
- For non_human_sounds: Describe sounds directly (e.g., "Background music fades", "Door closes loudly")
- For singing: Write the actual lyrics or melody description (e.g., "La la la melody", "Happy birthday song")  
- For non_speech_human_vocalizations: Describe the vocalization plainly (e.g., "Loud laughter", "Coughing fit", "Nervous giggle")
- Never use [], (), <>, 【】, 《》, or any other bracketing symbols in original or translation fields

---

### **CRITICAL ANTI-REPETITION INSTRUCTIONS**

**🚫 ABSOLUTELY FORBIDDEN:**
- Repetitive or similar content across segments
- Copying identical sentences or phrases
- Creating multiple segments with same content
- Circular or looping content
- Any form of content duplication or redundancy
- Using brackets, parentheses, or special symbols: [], (), <>, 【】, 《》, {}, etc.
- Wrapping descriptions in quotation marks or other delimiters

**✅ MANDATORY REQUIREMENTS:**
- Each segment must contain unique, distinct content
- Use varied expressions for similar concepts
- Every segment must advance the narrative or provide new information
- Follow DRY Principle (Don't Repeat Yourself)
- Ensure lexical and semantic diversity across all segments
- Write all descriptions in plain, natural language without symbolic formatting
- If content seems repetitive, STOP and move to next distinct audio segment

**Number all segments sequentially, focusing on accurate speech transcription while maintaining clear narrative flow and content uniqueness.**
`;
} 