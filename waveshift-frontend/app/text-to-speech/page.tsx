'use client';

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { m as motion } from "@/lib/lazy-motion";
import { 
  Plus,
  Volume2,
  User,
  Settings,
  Play,
  Download,
  ChevronDown,
  Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { BlurFade } from "@/components/magicui/blur-fade";
import dynamic from "next/dynamic";

const WabiSabiBackground = dynamic(() => import("@/components/wabi-sabi-background"), {
  ssr: false,
});

interface Voice {
  id: string;
  name: string;
  language: string;
  gender: string;
  avatar?: string;
}

export default function TextToSpeech() {
  const { isLoading } = useAuth();
  const { language: currentLanguage } = useLanguage();
  const { theme } = useTheme();
  const [text] = useState<string>("");
  const [selectedVoice] = useState<string | null>(null);
  const [speed, setSpeed] = useState<number[]>([1]);
  const [pitch, setPitch] = useState<number[]>([1]);
  const [isGenerating] = useState<boolean>(false);
  const [isPlaying] = useState<boolean>(false);
  const [generatedAudioUrl] = useState<string | null>(null);
  const [showSettings] = useState<boolean>(false);

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

  // 示例的语音列表
  const voices: Voice[] = [
    { id: "voice1", name: "王小明", language: "zh-CN", gender: "male", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=Felix&eyesColor=0a0a0a" },
    { id: "voice2", name: "李小花", language: "zh-CN", gender: "female", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=Lilly&eyesColor=0a0a0a" },
    { id: "voice3", name: "John", language: "en-US", gender: "male", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=John&eyesColor=0a0a0a" },
    { id: "voice4", name: "Sarah", language: "en-US", gender: "female", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=Sarah&eyesColor=0a0a0a" },
    { id: "voice5", name: "智能女声", language: "zh-CN", gender: "female", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=AI1&eyesColor=0a0a0a" },
    { id: "voice6", name: "智能男声", language: "zh-CN", gender: "male", avatar: "https://api.dicebear.com/7.x/thumbs/svg?seed=AI2&eyesColor=0a0a0a" },
  ];

  const handleTextChange = () => {
    // 即将推出功能，禁用文本输入处理
    return;
  };

  const generateSpeech = () => {
    // 即将推出功能，禁用语音生成
    return;
  };

  // 根据语言选择显示的文本
  const title = currentLanguage === "zh" ? "文本配音" : "Text to Speech";
  const description = currentLanguage === "zh" 
    ? "将文本转换为逼真的语音，提供多种声音和风格选择" 
    : "Convert text to realistic speech with multiple voices and styles";
  const textPlaceholder = currentLanguage === "zh" 
    ? "在此输入您想要转换成语音的文字..." 
    : "Enter text you want to convert to speech here...";
  const generateButtonText = currentLanguage === "zh" ? "生成语音" : "Generate";
  const processingText = currentLanguage === "zh" ? "处理中..." : "Processing...";
  const selectVoiceText = currentLanguage === "zh" ? "选择声音" : "Select Voice";
  const speedText = currentLanguage === "zh" ? "速度" : "Speed";
  const pitchText = currentLanguage === "zh" ? "音高" : "Pitch";
  const characterCountText = currentLanguage === "zh" ? "字符数" : "Characters";
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
            <div className="relative w-full h-full overflow-hidden rounded-2xl bg-gradient-to-br from-purple-100 to-purple-300 flex items-center justify-center opacity-75">
              {/* 语音相关图像 */}
              <div className="relative flex justify-center scale-110">
                <div className="absolute w-24 h-36 bg-purple-500 rounded-lg transform -rotate-6 translate-x-6"></div>
                <div className="absolute w-24 h-36 bg-purple-600 rounded-lg transform rotate-3 -translate-x-6"></div>
                <div className="absolute w-24 h-36 bg-purple-400 rounded-lg transform rotate-0 z-10"></div>
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <Volume2 className="w-12 h-12 text-white" />
                </div>
              </div>
            </div>
          </div>
          
          {/* 标题和图标并排 */}
          <div className="flex items-center justify-center mb-3 relative">
            <div className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center mr-3 opacity-60",
              theme === "dark" ? "bg-zinc-800" : "bg-purple-100"
            )}>
              <Volume2 className="w-5 h-5" />
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
                    ? "我们正在开发最自然的AI语音合成技术" 
                    : "We are developing natural AI speech synthesis technology"}
                </p>
              </div>
            </div>
          </div>
          
          {/* 文本输入区域 - 禁用状态 */}
          <div className="mb-5 relative">
            <Textarea 
              value={text}
              onChange={handleTextChange}
              placeholder={textPlaceholder}
              className="w-full p-4 h-28 bg-background rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none text-sm opacity-50"
              disabled
            />
            <div className="flex justify-between mt-2 items-center opacity-50">
              <div className="text-xs text-muted-foreground">
                {characterCountText}: {text.length}
              </div>
            </div>
          </div>
          
          {/* 选择声音部分 - 禁用状态 */}
          {selectedVoice && (
            <div className="mb-5 p-4 bg-background rounded-xl border border-border opacity-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-muted">
                    {voices.find(v => v.id === selectedVoice)?.avatar ? (
                      <Image 
                        src={voices.find(v => v.id === selectedVoice)?.avatar || ''} 
                        alt={voices.find(v => v.id === selectedVoice)?.name || ''} 
                        width={48}
                        height={48}
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <User className="w-full h-full p-2" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-sm font-medium">
                      {voices.find(v => v.id === selectedVoice)?.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {voices.find(v => v.id === selectedVoice)?.language}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 cursor-not-allowed"
                  disabled
                >
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
              
              {/* 语音设置 - 禁用状态 */}
              {showSettings && (
                <div className="mt-4 pt-4 border-t border-border space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs">{speedText}</label>
                      <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                        {speed[0].toFixed(1)}x
                      </span>
                    </div>
                    <Slider
                      value={speed}
                      min={0.5}
                      max={2}
                      step={0.1}
                      onValueChange={setSpeed}
                      className="h-4 opacity-50 pointer-events-none"
                      disabled
                    />
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-xs">{pitchText}</label>
                      <span className="text-xs bg-muted px-2 py-1 rounded text-muted-foreground">
                        {pitch[0].toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      value={pitch}
                      min={0.5}
                      max={2}
                      step={0.1}
                      onValueChange={setPitch}
                      className="h-4 opacity-50 pointer-events-none"
                      disabled
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* 生成的音频显示 - 禁用状态 */}
          {generatedAudioUrl && (
            <div className="mb-5 p-4 bg-background rounded-xl border border-border opacity-50">
              <div className="flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-12 w-12 text-primary cursor-not-allowed"
                  disabled
                >
                  <Play className="h-7 w-7" />
                </Button>
                <div className="flex-1 mx-3 h-3 bg-muted rounded-full">
                  <div 
                    className={`h-full bg-primary rounded-full transition-all duration-200 ${
                      isPlaying ? "w-1/2" : "w-0"
                    }`} 
                  />
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 cursor-not-allowed" disabled>
                  <Download className="h-5 w-5" />
                </Button>
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
              onClick={generateSpeech}
              disabled
            >
              <Plus className="w-6 h-6 mr-2" />
              <span className="text-base">{isGenerating ? processingText : generateButtonText}</span>
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
                  <span className="text-base">{selectVoiceText}</span>
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent 
                className="w-64 p-3 rounded-xl opacity-50 pointer-events-none"
                align="end"
              >
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {voices.map(voice => (
                    <Button
                      key={voice.id}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start text-left font-normal cursor-not-allowed",
                        selectedVoice === voice.id && "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-500"
                      )}
                      disabled
                    >
                      <div className="flex items-center w-full">
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-muted mr-2 flex-shrink-0">
                          {voice.avatar ? (
                            <Image src={voice.avatar} alt={voice.name} width={32} height={32} className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-full h-full p-1.5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{voice.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{voice.language}</p>
                        </div>
                        {selectedVoice === voice.id && (
                          <svg className="h-4 w-4 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="text-center mt-4 text-xs text-muted-foreground opacity-50">
            {currentLanguage === "zh" ? "支持40种语言，100+种声音" : "Supports 40 languages, 100+ voices"}
          </div>
        </BlurFade>
      </div>
      </motion.div>
    </div>
  );
}