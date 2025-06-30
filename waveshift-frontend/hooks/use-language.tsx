import { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Define all our translation strings
export type TranslationKey = 
  // Auth page
  | "welcomeToKrea"
  | "loginOrSignup"
  | "continueWithGoogle"
  | "continueWithEmail"
  | "or"
  | "email"
  | "bySigningUp"
  | "termsOfService"
  | "privacyPolicy"
  | "googleLoginNotAvailable"
  | "emailLoginNotAvailable"
  | "featureNotImplemented"
  | "emailRequired"
  | "pleaseEnterEmail"
  
  // Site branding and main content
  | "siteName"
  | "siteTagline"
  | "heroTitle"
  | "heroSubtitle"
  | "heroDescription"
  | "getStarted"
  | "learnMore"
  | "tryForFree"
  
  // Navigation and common
  | "home"
  | "audioTranscription"
  | "textToSpeech"
  | "videoTranslation"
  | "pricing"
  | "logIn"
  | "signUp"
  | "logout"
  | "switchLanguage"
  | "english"
  | "chinese"
  | "pageNotFound"
  | "darkMode"
  | "lightMode"
  
  // Core features
  | "coreFeatures"
  | "coreFeaturesDesc"
  | "audioTranscriptionTitle"
  | "audioTranscriptionDesc"
  | "audioTranscriptionFeatures"
  | "textToSpeechTitle"
  | "textToSpeechDesc"
  | "textToSpeechFeatures"
  | "videoTranslationTitle"
  | "videoTranslationDesc"
  | "videoTranslationFeatures"
  
  // Video translation highlights
  | "realtimeTranslation"
  | "realtimeTranslationDesc"
  | "multiSpeakerVoice" 
  | "multiSpeakerVoiceDesc"
  | "smoothPacing"
  | "smoothPacingDesc"
  | "comingSoon"
  | "videoShowcase"
  | "videoShowcaseDesc"
  | "originalVideo"
  | "translatedVideo"
  
  // Features section
  | "whyChooseUs"
  | "featuresDescription"
  | "fastProcessing"
  | "fastProcessingDesc"
  | "highAccuracy"
  | "highAccuracyDesc"
  | "multiLanguage"
  | "multiLanguageDesc"
  | "securePrivate"
  | "securePrivateDesc"
  | "easyIntegration"
  | "easyIntegrationDesc"
  | "realTimeProcessing"
  | "realTimeProcessingDesc"
  
  // Stats and social proof
  | "statsTitle"
  | "processedHours"
  | "supportedLanguages"
  | "activeUsers"
  | "accuracyRate"
  
  // Testimonials
  | "testimonials"
  | "userTestimonials"
  | "testimonialsDescription"
  | "userSatisfaction"
  | "recommendationRate"
  | "avgProcessingTime"
  | "technicalSupport"
  
  // CTA section
  | "ctaTitle"
  | "ctaSubtitle"
  | "ctaDescription"
  | "startCreating"
  | "viewPricing"
  | "ctaBenefits"
  | "noExperienceNeeded"
  | "multipleFormats"
  | "cloudSync"
  | "freeTrialNoCreditCard"
  
  // Pricing page
  | "voiceForgeAiPlans"
  | "upgradeDesc"
  | "enterpriseAvailable"
  | "monthly"
  | "yearly"
  | "saveWithYearly"
  | "freePlan"
  | "basicPlan"
  | "proPlan"
  | "maxPlan"
  | "selectPlan"
  | "freeProcessing"
  | "limitedAccess"
  | "commercialLicense"
  | "faq"
  | "processingUnitsQuestion"
  | "processingUnitsAnswer"
  | "rolloverQuestion"
  | "rolloverAnswer"
  | "exceedLimitQuestion"
  | "exceedLimitAnswer"
  | "needHelp";

type Translations = {
  [key in TranslationKey]: string;
};

// Define the translations for English and Chinese
const translations: Record<"en" | "zh", Translations> = {
  en: {
    // Auth page
    welcomeToKrea: "Welcome to WaveShift",
    loginOrSignup: "Log in or sign up",
    continueWithGoogle: "Continue with Google",
    continueWithEmail: "Continue with email",
    or: "or",
    email: "Email",
    bySigningUp: "By signing up, you agree to our",
    termsOfService: "Terms of Service",
    privacyPolicy: "Privacy Policy",
    googleLoginNotAvailable: "Google login not available",
    emailLoginNotAvailable: "Email login not available",
    featureNotImplemented: "This feature is not implemented yet",
    emailRequired: "Email required",
    pleaseEnterEmail: "Please enter your email address",
    
    // Site branding and main content
    siteName: "Wave Shift",
    siteTagline: "Where Sound Travels, the World Connects",
    heroTitle: "Transform Audio & Video with AI Intelligence", 
    heroSubtitle: "Where Every Voice is Perfectly Conveyed", 
    heroDescription: "Professional audio transcription, text-to-speech, and video translation powered by cutting-edge AI technology. Break language barriers and enhance communication.",
    getStarted: "Get Started",
    learnMore: "Learn More",
    tryForFree: "Try for Free",
    
    // Navigation and common
    home: "Home",
    audioTranscription: "Audio Transcription",
    textToSpeech: "Text to Speech",
    videoTranslation: "Video Translation",
    pricing: "Pricing",
    logIn: "Log In",
    signUp: "Sign Up",
    logout: "Logout",
    switchLanguage: "Switch Language",
    english: "English",
    chinese: "Chinese",
    pageNotFound: "Page Not Found",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    
    // Core features
    coreFeatures: "Core Features",
    coreFeaturesDesc: "Professional AI-powered audio and video processing services with cutting-edge technology",
    audioTranscriptionTitle: "AI Audio Transcription",
    audioTranscriptionDesc: "Convert speech to text with exceptional accuracy and speed, supporting multiple languages and dialects",
    audioTranscriptionFeatures: "99% accuracy • Real-time processing • Auto punctuation • Speaker identification",
    textToSpeechTitle: "Natural Text to Speech",
    textToSpeechDesc: "Transform text into natural, human-like speech with emotional expression and multiple voice options",
    textToSpeechFeatures: "Multi-language support • Natural intonation • Real-time conversion • High-fidelity audio",
    videoTranslationTitle: "Video Translation & Dubbing",
    videoTranslationDesc: "AI-powered video translation with lip-sync preservation and voice tone matching",
    videoTranslationFeatures: "Lip synchronization • Voice preservation • Multi-language • Auto subtitles",
    
    // Video translation highlights
    realtimeTranslation: "Real-Time Translation",
    realtimeTranslationDesc: "AI-powered real-time translation for seamless communication",
    multiSpeakerVoice: "Multi-Speaker Voice",
    multiSpeakerVoiceDesc: "Support for multiple speakers in a single video",
    smoothPacing: "Smooth Pacing",
    smoothPacingDesc: "Natural-sounding translation with smooth pacing",
    comingSoon: "Coming Soon",
    videoShowcase: "Video Showcase",
    videoShowcaseDesc: "Experience the magic of AI video translation while preserving original voice tone and emotion",
    originalVideo: "Original Video",
    translatedVideo: "Translated Video",
    
    // Features section
    whyChooseUs: "Why Choose Wave Shift",
    featuresDescription: "We provide the most advanced AI audio and video processing tools with enterprise-grade security and performance.",
    fastProcessing: "Lightning Fast Processing",
    fastProcessingDesc: "Process audio and video content 10x faster than traditional methods with GPU acceleration",
    highAccuracy: "Exceptional Accuracy",
    highAccuracyDesc: "Industry-leading 99%+ accuracy rates for transcription and translation services",
    multiLanguage: "Multi-Language Support",
    multiLanguageDesc: "Support for 100+ languages and dialects with cultural context understanding",
    securePrivate: "Secure & Private",
    securePrivateDesc: "Enterprise-grade encryption ensures your content remains confidential and secure",
    easyIntegration: "Easy Integration",
    easyIntegrationDesc: "Simple APIs and SDKs for seamless integration into your existing workflows",
    realTimeProcessing: "Real-Time Processing",
    realTimeProcessingDesc: "Live transcription and translation for meetings, broadcasts, and streaming",
    
    // Stats and social proof
    statsTitle: "Trusted by Content Creators Worldwide",
    processedHours: "Audio Hours Processed",
    supportedLanguages: "Languages Supported",
    activeUsers: "Active Users",
    accuracyRate: "Average Accuracy",
    
    // Testimonials
    testimonials: "User Reviews",
    userTestimonials: "What Our Users Say",
    testimonialsDescription: "Hear from content creators, businesses, and professionals who trust Wave Shift for their audio and video processing needs.",
    userSatisfaction: "User Satisfaction",
    recommendationRate: "Recommendation Rate",
    avgProcessingTime: "Avg Processing Time",
    technicalSupport: "24/7 Support",
    
    // CTA section
    ctaTitle: "Ready to Transform Your Audio & Video?",
    ctaSubtitle: "Start Your AI Journey Today",
    ctaDescription: "Join thousands of creators, businesses, and professionals who trust Wave Shift for their audio and video processing needs.",
    startCreating: "Start Processing",
    viewPricing: "View Pricing",
    ctaBenefits: "Why Start Today",
    noExperienceNeeded: "No technical experience required",
    multipleFormats: "Support for all major formats",
    cloudSync: "Cloud-based processing",
    freeTrialNoCreditCard: "Free trial, no credit card required",
    
    // Pricing page
    voiceForgeAiPlans: "Wave Shift Plans",
    upgradeDesc: "Upgrade to access advanced features and process more content faster.",
    enterpriseAvailable: "Enterprise and team plans now available",
    monthly: "Monthly",
    yearly: "Yearly",
    saveWithYearly: "Save with yearly",
    freePlan: "Free",
    basicPlan: "Basic",
    proPlan: "Pro",
    maxPlan: "Enterprise",
    selectPlan: "Select Plan",
    freeProcessing: "Free daily processing",
    limitedAccess: "Limited access to Wave Shift tools",
    commercialLicense: "Commercial license",
    faq: "Frequently Asked Questions",
    processingUnitsQuestion: "What are processing units?",
    processingUnitsAnswer: "Processing units measure the computational resources used for audio and video processing. They represent the processing power, memory, and time required for each task.",
    rolloverQuestion: "Can I roll over unused processing units to the following month?",
    rolloverAnswer: "Processing units do not accumulate or carry over between billing cycles. At the start of each month, your balance is reset to your plan's allocated amount.",
    exceedLimitQuestion: "What options do I have if I exceed my processing limit?",
    exceedLimitAnswer: "If you exceed your limit, you can upgrade to a higher-tier subscription, purchase additional units, or utilize your daily free processing allowance.",
    needHelp: "Need help with your subscription? Reach out to"
  },
  zh: {
    // Auth page
    welcomeToKrea: "欢迎来到 WaveShift",
    loginOrSignup: "登录或注册",
    continueWithGoogle: "使用谷歌账号继续",
    continueWithEmail: "使用邮箱继续",
    or: "或",
    email: "邮箱",
    bySigningUp: "注册即表示您同意我们的",
    termsOfService: "服务条款",
    privacyPolicy: "隐私政策",
    googleLoginNotAvailable: "谷歌登录不可用",
    emailLoginNotAvailable: "邮箱登录不可用",
    featureNotImplemented: "此功能尚未实现",
    emailRequired: "需要邮箱",
    pleaseEnterEmail: "请输入您的邮箱地址",
    
    // Site branding and main content
    siteName: "声渡",
    siteTagline: "声之所至，渡见世界",
    heroTitle: "用AI智能变革音视频处理",
    heroSubtitle: "让每一个声音都被完美传达",
    heroDescription: "基于前沿AI技术的专业音频转录、文本配音和视频翻译服务。打破语言障碍，提升沟通效果。",
    getStarted: "开始使用",
    learnMore: "了解更多",
    tryForFree: "免费试用",
    
    // Navigation and common
    home: "首页",
    audioTranscription: "音频转录",
    textToSpeech: "文本配音",
    videoTranslation: "视频翻译",
    pricing: "价格",
    logIn: "登录",
    signUp: "注册",
    logout: "退出",
    switchLanguage: "切换语言",
    english: "英文",
    chinese: "中文",
    pageNotFound: "页面未找到",
    darkMode: "深色模式",
    lightMode: "浅色模式",
    
    // Core features
    coreFeatures: "核心功能",
    coreFeaturesDesc: "基于前沿AI技术，为您提供专业级的音视频处理服务",
    audioTranscriptionTitle: "AI音频转录",
    audioTranscriptionDesc: "以卓越的准确性和速度将语音转换为文字，支持多种语言和方言",
    audioTranscriptionFeatures: "99%准确率 • 实时处理 • 自动标点 • 说话人识别",
    textToSpeechTitle: "自然语音合成",
    textToSpeechDesc: "将文字转换为自然、拟人的语音，具有情感表达和多种音色选择",
    textToSpeechFeatures: "多语言支持 • 自然语调 • 实时转换 • 高保真音质",
    videoTranslationTitle: "视频翻译配音",
    videoTranslationDesc: "AI驱动的视频翻译，保持唇形同步和原声音调匹配",
    videoTranslationFeatures: "唇形同步 • 保留语调 • 多语言 • 自动字幕",
    
    // Video translation highlights
    realtimeTranslation: "实时翻译",
    realtimeTranslationDesc: "AI驱动的实时翻译，实现无缝沟通",
    multiSpeakerVoice: "多声道语音",
    multiSpeakerVoiceDesc: "支持单个视频中的多个声音",
    smoothPacing: "流畅节奏",
    smoothPacingDesc: "自然流畅的翻译，保持流畅节奏",
    comingSoon: "即将推出",
    videoShowcase: "视频翻译效果展示",
    videoShowcaseDesc: "体验AI视频翻译的神奇效果，保持原声音调和情感",
    originalVideo: "原始视频",
    translatedVideo: "翻译后的视频",
    
    // Features section
    whyChooseUs: "为什么选择 声渡",
    featuresDescription: "我们提供最先进的AI音视频处理工具，具备企业级安全性和性能。",
    fastProcessing: "闪电般处理速度",
    fastProcessingDesc: "采用GPU加速技术，处理速度比传统方法快10倍以上",
    highAccuracy: "卓越准确性",
    highAccuracyDesc: "行业领先的99%+转录和翻译准确率",
    multiLanguage: "多语言支持",
    multiLanguageDesc: "支持100+种语言和方言，具备文化语境理解能力",
    securePrivate: "安全私密",
    securePrivateDesc: "企业级加密确保您的内容保持机密和安全",
    easyIntegration: "轻松集成",
    easyIntegrationDesc: "简单的API和SDK，无缝集成到您现有的工作流程",
    realTimeProcessing: "实时处理",
    realTimeProcessingDesc: "为会议、广播和直播提供实时转录和翻译",
    
    // Stats and social proof
    statsTitle: "全球内容创作者的信赖之选",
    processedHours: "已处理音频时长",
    supportedLanguages: "支持语言",
    activeUsers: "活跃用户",
    accuracyRate: "平均准确率",
    
    // Testimonials
    testimonials: "用户评价",
    userTestimonials: "用户怎么说",
    testimonialsDescription: "听听信赖声渡进行音视频处理的内容创作者、企业和专业人士的声音。",
    userSatisfaction: "用户满意度",
    recommendationRate: "推荐率",
    avgProcessingTime: "平均处理时间",
    technicalSupport: "24/7技术支持",
    
    // CTA section
    ctaTitle: "准备好变革您的音视频处理了吗？",
    ctaSubtitle: "今天就开始您的AI之旅",
    ctaDescription: "加入数千名信赖声渡进行音视频处理的创作者、企业和专业人士。",
    startCreating: "开始处理",
    viewPricing: "查看定价",
    ctaBenefits: "为什么今天开始",
    noExperienceNeeded: "无需技术经验",
    multipleFormats: "支持所有主流格式",
    cloudSync: "云端处理",
    freeTrialNoCreditCard: "免费试用，无需信用卡",
    
    // Pricing page
    voiceForgeAiPlans: "声渡 套餐",
    upgradeDesc: "升级以访问高级功能，更快处理更多内容。",
    enterpriseAvailable: "现已提供企业和团队方案",
    monthly: "月付",
    yearly: "年付",
    saveWithYearly: "年付更省钱",
    freePlan: "免费",
    basicPlan: "基础",
    proPlan: "专业",
    maxPlan: "企业",
    selectPlan: "选择套餐",
    freeProcessing: "每日免费处理",
    limitedAccess: "有限访问声渡工具",
    commercialLicense: "商业许可",
    faq: "常见问题",
    processingUnitsQuestion: "什么是处理单元？",
    processingUnitsAnswer: "处理单元衡量音视频处理所用的计算资源。它们代表每个任务所需的处理能力、内存和时间。",
    rolloverQuestion: "我可以将未用完的处理单元结转到下个月吗？",
    rolloverAnswer: "处理单元不会在计费周期之间累积或结转。每个月初，您的余额将重置为您套餐分配的数量。",
    exceedLimitQuestion: "如果我超出处理限制有哪些选择？",
    exceedLimitAnswer: "如果您超出限制，可以升级到更高级别的订阅，购买额外的单元，或利用每日免费处理额度。",
    needHelp: "需要订阅帮助？请联系"
  },
};

type LanguageContextType = {
  language: "en" | "zh";
  setLanguage: (language: "en" | "zh") => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<"en" | "zh">("en");

  useEffect(() => {
    // Get the saved language preference from localStorage
    const savedLanguage = localStorage.getItem("language") as "en" | "zh";
    if (savedLanguage && (savedLanguage === "en" || savedLanguage === "zh")) {
      setLanguage(savedLanguage);
    }
  }, []);

  const changeLanguage = (newLanguage: "en" | "zh") => {
    setLanguage(newLanguage);
    // Save the language preference to localStorage
    localStorage.setItem("language", newLanguage);
  };

  // Function to get a translated string by key
  const t = (key: TranslationKey): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage: changeLanguage,
        t,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}