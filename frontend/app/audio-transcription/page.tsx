'use client';

import { useState, useRef } from "react";
import { useAuth } from "@/contexts/auth-context";
import { m as motion } from "@/lib/lazy-motion";
import { 
  Plus,
  Mic,
  User,
  FileText,
  ChevronDown,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";

import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/magicui/blur-fade";
import dynamic from "next/dynamic";

const WabiSabiBackground = dynamic(() => import("@/components/wabi-sabi-background"), {
  ssr: false,
});

export default function AudioTranscription() {
  const { isLoading } = useAuth();
  const { language: currentLanguage } = useLanguage();
  const { theme } = useTheme();
  const [selectedLanguage] = useState<string>(currentLanguage === "zh" ? "zh-CN" : "en-US");
  const [file] = useState<File | null>(null);
  const [transcriptionStarted] = useState(false);
  const [progress] = useState(0);
  const [transcriptionResult] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 简化的加载状态检查
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // 语言选项
  const languageOptions = [
    { value: "zh-CN", label: currentLanguage === "zh" ? "中文（简体）" : "Chinese (Simplified)" },
    { value: "en-US", label: currentLanguage === "zh" ? "英语（美国）" : "English (US)" },
    { value: "ja-JP", label: currentLanguage === "zh" ? "日语" : "Japanese" },
    { value: "ko-KR", label: currentLanguage === "zh" ? "韩语" : "Korean" },
    { value: "fr-FR", label: currentLanguage === "zh" ? "法语" : "French" },
    { value: "de-DE", label: currentLanguage === "zh" ? "德语" : "German" },
    { value: "es-ES", label: currentLanguage === "zh" ? "西班牙语" : "Spanish" },
  ];

  const handleFileClick = () => {
    // 即将推出功能，禁用文件选择
    return;
  };

  const handleFileChange = () => {
    // 即将推出功能，禁用文件处理
    return;
  };

  // 根据语言选择显示的文本
  const title = currentLanguage === "zh" ? "音频转录" : "Audio Transcription";
  const description = currentLanguage === "zh" 
    ? "将语音自动转换为文本，支持多种语言的精准识别和转录" 
    : "Automatically convert speech to text with accurate recognition and transcription in multiple languages";
  const uploadLabel = currentLanguage === "zh" ? "上传音频" : "Upload";
  const selectLanguageLabel = currentLanguage === "zh" ? "选择语言" : "Select language";
  const transcribeText = currentLanguage === "zh" ? "开始转录" : "Start Transcription";
  const processingText = currentLanguage === "zh" ? "处理中..." : "Processing...";
  const transcriptionResultText = currentLanguage === "zh" ? "转录结果" : "Transcription Result";
  const comingSoonText = currentLanguage === "zh" ? "即将推出" : "Coming Soon";



  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />
      
      {/* 内容区域 */}
      <motion.div 
        className="relative z-10 flex flex-col items-center justify-center min-h-[70vh] py-12"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
      <div className="w-full max-w-md mx-auto">
        <BlurFade
          layout
          delay={0.25}
          inView={true}
          className={cn(
            "p-6 rounded-3xl shadow-lg relative", 
            theme === "dark" ? "bg-zinc-900" : "bg-gray-100"
          )}
        >
          {/* 即将推出标识 */}
          <div className="absolute -top-3 -right-3 z-10">
            <Badge className="bg-yellow-500 text-white px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 shadow-lg">
              <Clock className="w-3 h-3" />
              {comingSoonText}
            </Badge>
          </div>
          
          {/* 即将推出遮罩 */}
          <div className="absolute inset-0 bg-muted/20 backdrop-blur-[1px] rounded-3xl pointer-events-none" />
          
          {/* 内容上部区域 - 缩小高度 */}
          <div className="h-[280px] mb-6 flex items-center justify-center relative">
            {/* 静态图片区域 - 苹果风格 */}
            <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-300 flex items-center justify-center opacity-75">
              {/* 音频相关图像 */}
              <div className="relative flex justify-center scale-110">
                <div className="absolute w-24 h-36 bg-indigo-500 rounded-lg transform -rotate-6 translate-x-6"></div>
                <div className="absolute w-24 h-36 bg-indigo-600 rounded-lg transform rotate-3 -translate-x-6"></div>
                <div className="absolute w-24 h-36 bg-indigo-400 rounded-lg transform rotate-0 z-10"></div>
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <Mic className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>
          </div>
          
          {/* 标题和图标并排 */}
          <div className="flex items-center justify-center mb-3 relative">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center mr-3 opacity-60",
              theme === "dark" ? "bg-zinc-800" : "bg-indigo-100"
            )}>
              <Mic className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-muted-foreground">{title}</h1>
          </div>
          
          {/* 描述文字 */}
          <p className="text-muted-foreground text-sm text-center mb-6 opacity-75">
            {description}
          </p>
          
          {/* 即将推出说明 */}
          <div className="mb-5 p-4 bg-yellow-50 border border-yellow-200 rounded-xl relative">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-yellow-600 flex-shrink-0" />
              <div className="flex-1">
                <h3 className="font-medium text-sm text-yellow-800">
                  {currentLanguage === "zh" ? "功能开发中" : "Feature in Development"}
                </h3>
                <p className="text-xs text-yellow-700 mt-1">
                  {currentLanguage === "zh" 
                    ? "我们正在开发最先进的AI音频转录功能" 
                                        : "We are developing advanced AI audio transcription features"}
                </p>
              </div>
            </div>
          </div>
          
          {/* 文件上传状态 - 禁用状态 */}
          {file && !transcriptionStarted && (
            <div className="mb-5 p-4 bg-background rounded-xl border border-border opacity-50">
              <div className="flex items-center gap-3">
                <div className="bg-muted rounded-lg h-12 w-12 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6 text-foreground/70" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm truncate">{file.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <Button 
                  className="bg-muted text-muted-foreground rounded-lg px-3 py-1 text-xs cursor-not-allowed"
                  disabled
                >
                  {transcribeText}
                </Button>
              </div>
            </div>
          )}
          
          {/* 转录进度 - 禁用状态 */}
          {transcriptionStarted && progress < 100 && (
            <div className="mb-5 p-4 bg-background rounded-xl border border-border opacity-50">
              <div className="space-y-3">
                <Progress value={progress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">{processingText} {progress}%</p>
              </div>
            </div>
          )}
          
          {/* 转录结果 - 禁用状态 */}
          {transcriptionResult.length > 0 && (
            <div className="mb-5 p-4 bg-background rounded-xl border border-border opacity-50">
              <h3 className="font-medium text-sm mb-3">{transcriptionResultText}</h3>
              <div className="max-h-36 overflow-y-auto space-y-3 text-xs">
                {transcriptionResult.map((line, index) => (
                  <div key={index} className="p-3 bg-muted rounded-lg">
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* 按钮区域 - 禁用状态 */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full mt-6 relative">
            <Button
              className={cn(
                "w-full sm:flex-1 h-14 rounded-xl transition-colors flex items-center justify-center cursor-not-allowed",
                "bg-muted/50 text-muted-foreground hover:bg-muted/50"
              )}
              onClick={handleFileClick}
              disabled
            >
              <Plus className="w-6 h-6 mr-2" />
              <span className="text-base">{uploadLabel}</span>
            </Button>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full sm:flex-1 h-14 rounded-xl transition-colors flex items-center justify-center cursor-not-allowed",
                    "bg-muted/50 border-muted text-muted-foreground hover:bg-muted/50"
                  )}
                  disabled
                >
                  <User className="w-6 h-6 mr-2" />
                  <span className="text-base">{selectLanguageLabel}</span>
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-64 p-3 rounded-xl opacity-50 pointer-events-none"
                align="end"
              >
                <div className="space-y-1">
                  {languageOptions.map(lang => (
                    <Button
                      key={lang.value}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-left font-normal cursor-not-allowed",
                        selectedLanguage === lang.value && "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-500"
                      )}
                      disabled
                    >
                      {lang.label}
                      {selectedLanguage === lang.value && (
                        <svg className="h-4 w-4 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="text-center mt-4 text-xs text-muted-foreground opacity-50">
            Max 20MB / MP3, WAV, M4A, FLAC
          </div>
        </BlurFade>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.flac"
        className="hidden"
        onChange={handleFileChange}
        disabled
      />
      </motion.div>
    </div>
  );
}