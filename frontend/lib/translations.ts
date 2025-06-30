export type Language = 'zh' | 'en'; // Add other languages as needed

export interface Translations {
  title: string;
  description: string;
  uploadVideoLabel: string;
  selectLanguageLabel: string;
  startPreprocessingLabel: string;
  startTranslationLabel: string;
  uploadingLabel: string;
  translatingLabel: string;
  processingLabel: string;
  processingSubtitlesLabel: string;
  playLabel: string;
  pauseLabel: string;
  editLabel: string;
  saveLabel: string;
  generateLabel: string;
  generatingLabel: string;
  preprocessingErrorLabel: string;
  originalSubtitleLabel: string;
  translatedSubtitleLabel: string;
  jumpToLabel: string;
  closeLabel: string;
  languageLabel: string;
  translateButtonLabel: string;
  loadingLabel: string;
  loadingSubtitlesLabel: string;
  errorLabel: string;
  retryLabel: string;
  noSubtitlesFoundLabel: string;
  retranslateConfirmLabel: string;
  alertMessages: {
    selectVideoFirst: string;
    userInfoIncomplete: string;
    userInfoRefreshFailed: string;
    uploadFailed: (message: string) => string;
    dbError: (message: string) => string;
    subtitlesTranslated: (language: string) => string;
    generatingVideo: string;
    uploadNotComplete: string;
  };
  languageOptions: Array<{ value: string; label: string }>;
}

const translations: Record<Language, Translations> = {
  en: {
    title: "Video Translation",
    description: "Upload videos, automatically extract subtitles and translate into multiple languages. Support batch export and editing.",
    uploadVideoLabel: "Upload",
    selectLanguageLabel: "Select language",
    startPreprocessingLabel: "Processing video...",
    startTranslationLabel: "Translate",
    uploadingLabel: "Uploading...",
    translatingLabel: "Translating...",
    processingLabel: "Processing...",
    processingSubtitlesLabel: "Extracting subtitles...",
    playLabel: "Play",
    pauseLabel: "Pause",
    editLabel: "Edit",
    saveLabel: "Save",
    generateLabel: "Start Generating",
    generatingLabel: "Generating...",
    preprocessingErrorLabel: "Preprocessing failed",
    originalSubtitleLabel: "Original Subtitle",
    translatedSubtitleLabel: "Translated Subtitle",
    jumpToLabel: "Jump to",
    closeLabel: "Close",
    languageLabel: "Language",
    translateButtonLabel: "Translate Subtitles",
    loadingLabel: "Loading...",
    loadingSubtitlesLabel: "Loading subtitles...",
    errorLabel: "Error",
    retryLabel: "Try Again",
    noSubtitlesFoundLabel: "No subtitles found. Select language and click Translate.",
    retranslateConfirmLabel: "Translation already exists. Do you want to retranslate? This will overwrite existing translations.",
    alertMessages: {
      selectVideoFirst: "Please select a video file first.",
      userInfoIncomplete: "User info incomplete, attempting to refresh...",
      userInfoRefreshFailed: "Could not retrieve valid user information. Please refresh the page or log in again and try.",
      uploadFailed: (message: string) => `Upload failed: ${message}`,
      dbError: (message: string) => `Database error: ${message}`,
      subtitlesTranslated: (language: string) => `Subtitles translated to ${language}`,
      generatingVideo: "Starting to generate translated video!",
      uploadNotComplete: "Video upload is not yet complete. Please wait.",
    },
    languageOptions: [
      { value: "zh", label: "Chinese" },
      { value: "en", label: "English" },
    ],
  },
  zh: {
    title: "视频翻译",
    description: "上传视频，自动提取字幕并翻译成多种语言。支持批量导出与编辑。",
    uploadVideoLabel: "上传视频",
    selectLanguageLabel: "选择语言",
    startPreprocessingLabel: "视频处理中……",
    startTranslationLabel: "开始翻译",
    uploadingLabel: "上传中...",
    translatingLabel: "翻译中...",
    processingLabel: "处理中...",
    processingSubtitlesLabel: "正在提取字幕...",
    playLabel: "播放",
    pauseLabel: "暂停",
    editLabel: "编辑",
    saveLabel: "保存",
    generateLabel: "开始生成",
    generatingLabel: "生成中...",
    preprocessingErrorLabel: "预处理出错",
    originalSubtitleLabel: "原始字幕",
    translatedSubtitleLabel: "翻译字幕",
    jumpToLabel: "跳转",
    closeLabel: "关闭",
    languageLabel: "语言",
    translateButtonLabel: "翻译字幕",
    loadingLabel: "加载中...",
    loadingSubtitlesLabel: "字幕加载中...",
    errorLabel: "错误",
    retryLabel: "重试",
    noSubtitlesFoundLabel: "未找到字幕。请选择语言后点击翻译。",
    retranslateConfirmLabel: "已有翻译内容，是否重新翻译？这将覆盖现有的翻译。",
    alertMessages: {
      selectVideoFirst: "请先选择一个视频文件。",
      userInfoIncomplete: "用户信息不完整，正在尝试重新获取...",
      userInfoRefreshFailed: "无法获取有效的用户信息，请刷新页面或重新登录后尝试。",
      uploadFailed: (message: string) => `上传失败: ${message}`,
      dbError: (message: string) => `数据库错误: ${message}`,
      subtitlesTranslated: (language: string) => `字幕已翻译为${language}`,
      generatingVideo: "开始生成翻译后的视频！",
      uploadNotComplete: "视频尚未上传完成，请稍候。",
    },
    languageOptions: [
      { value: "zh", label: "中文" },
      { value: "en", label: "英文" },
    ],
  },
};

export const getTranslations = (language: Language): Translations => {
  return translations[language] || translations.en; // Fallback to English
}; 