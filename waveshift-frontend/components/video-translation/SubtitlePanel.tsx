import { m as motion } from "@/lib/lazy-motion";
import { AnimatePresence } from "framer-motion";
import {
  XMarkIcon,
  ClockIcon,
  PlayIcon,
  UserIcon,
  GlobeAltIcon
} from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LanguageSwitch } from "@/components/ui/language-switch";
import { cn } from "@/lib/utils";
import { Subtitle } from "@/types";
import { Translations } from "@/lib/translations";
import { useState, useEffect } from "react";
// NextAuth.js + D1 数据库架构，通过 API 路由访问数据
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { SubtitleSkeleton, SubtitleSkeletons } from "@/components/ui/subtitle-skeleton";


interface SubtitlesPanelProps {
  theme: string | undefined;
  subtitles: Subtitle[];
  editingSubtitleId: string | null;
  targetLanguage: string;
  translations: Translations;
  isMobile: boolean;
  isLoading: boolean;
  error: string | null;
  showSkeletons?: boolean; // 新增：是否显示骨架屏
  getLanguageLabel: (value: string) => string;
  jumpToTime: (timeString: string) => void;
  updateSubtitleTranslation: (id: string, newTranslation: string, sync?: boolean) => void | Promise<void>;
  toggleEditMode: (id: string) => void;
  setTargetLanguage: (language: string) => void;
  fetchSubtitles: (taskId: string, targetLang: string) => Promise<void>;
  closeSubtitlesPanel: () => void;
  subtitlesContainerRef: React.RefObject<HTMLDivElement>;
  currentTaskId: string;
  onTranslationStart: () => void;
  onTranslationComplete: () => void;
}

export default function SubtitlesPanel({
  theme,
  subtitles,
  editingSubtitleId,
  targetLanguage,
  translations: T,
  // isMobile,
  isLoading,
  error,
  showSkeletons = false,
  // getLanguageLabel,
  jumpToTime,
  updateSubtitleTranslation,
  toggleEditMode,
  setTargetLanguage,
  fetchSubtitles,
  closeSubtitlesPanel,
  subtitlesContainerRef,
  currentTaskId,
  onTranslationStart,
  onTranslationComplete
}: SubtitlesPanelProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationStatus, setTranslationStatus] = useState<'idle' | 'translating' | 'translated' | 'error'>('idle');

  // 处理语言切换，避免页面刷新
  const handleLanguageChange = async (newLanguage: string) => {
    if (newLanguage === targetLanguage) return;
    
    setTargetLanguage(newLanguage);
    
    // 如果有当前任务ID，立即获取新语言的字幕
    if (currentTaskId) {
      await fetchSubtitles(currentTaskId, newLanguage);
    }
  };

  // 注意：翻译功能已集成到workflow中，无需单独的轮询机制

  const handleTranslate = async () => {
    if (!currentTaskId || !targetLanguage) return;
    
    // 检查是否已有翻译内容
    const hasExistingTranslations = subtitles.some(s => s.translation && s.translation.trim() !== '');
    
    if (hasExistingTranslations) {
      const confirmRetranslate = window.confirm(
        T.retranslateConfirmLabel || "已有翻译内容，是否重新翻译？这将覆盖现有的翻译。"
      );
      if (!confirmRetranslate) return;
    }
    
    try {
      setIsTranslating(true);
      setTranslationStatus('translating');
      onTranslationStart(); // 通知父组件翻译开始
      
      
      if (process.env.NODE_ENV === 'development') {
        console.log('清空数据库中的翻译内容...');
      }
      
      // 清空前端显示
      subtitles.forEach(s => updateSubtitleTranslation(s.id, "", false));
      
      // 无论是否有现有翻译，都清空数据库中的翻译内容，确保轮询不会获取到旧数据
      const clearResponse = await fetch(`/api/subtitles/${currentTaskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      });
        
      if (!clearResponse.ok) {
        console.error('清空数据库翻译内容失败:', clearResponse.statusText);
        throw new Error('清空现有翻译失败');
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('数据库翻译内容已清空');
      }
      
      // 稍微延迟确保数据库更新完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 新架构：翻译功能已集成到workflow中，直接从数据库获取结果
      console.log('Translation is handled automatically by workflow');
      
      // 直接获取翻译结果，不需要轮询
      await fetchSubtitles(currentTaskId, targetLanguage);
      
      setTranslationStatus('translated');
      setIsTranslating(false);
      onTranslationComplete();

    } catch (err) {
      console.error('翻译失败:', err);
      setTranslationStatus('error');
      setIsTranslating(false);
      onTranslationComplete();
      alert(`翻译失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  useEffect(() => {
    // 切换到新任务或新语言时重置翻译状态
    if (process.env.NODE_ENV === 'development') {
      console.log('任务或语言变更，重置翻译状态');
    }
    setTranslationStatus('idle');
    setIsTranslating(false);
  }, [currentTaskId, targetLanguage]);


  return (
    <div className={cn(
      "p-2 sm:p-3 rounded-3xl relative flex flex-col",
      "bg-transparent"
    )}>
      <Button
        variant="ghost"
        size="sm"
        className="absolute top-3 right-3 h-8 w-8 rounded-full p-0 z-20"
        onClick={closeSubtitlesPanel}
      >
                    <XMarkIcon className="h-4 w-4" />
        <span className="sr-only">{T.closeLabel}</span>
      </Button>
      
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 pr-10">
        <h2 className="text-xl font-bold mb-2 sm:mb-0 whitespace-nowrap">{T.translatedSubtitleLabel}</h2>
        <div className="flex items-center space-x-2 flex-wrap sm:flex-nowrap mt-2 sm:mt-0">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">{T.languageLabel}:</span>
            <LanguageSwitch
              value={targetLanguage}
              onChange={handleLanguageChange}
              disabled={isTranslating}
            />
          </div>
          <Button
            variant="default"
            size="sm"
            className="h-8 px-4 text-sm font-medium whitespace-nowrap"
            onClick={handleTranslate}
            disabled={isLoading || isTranslating || !targetLanguage || !currentTaskId}
          >
            <GlobeAltIcon className="h-4 w-4 mr-1.5" />
            {isTranslating
              ? (T.translatingLabel || "Translating...")
              : (T.translateButtonLabel || "Translate")}
          </Button>
        </div>
      </div>
      
      <div className="h-[500px] overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_5%,black_95%,transparent)]">
        <ScrollArea className={cn("rounded-md h-full")}>
          <div className="space-y-4 pb-4" ref={subtitlesContainerRef}>
            <ProgressiveSubtitleList
              subtitles={subtitles}
              showSkeletons={showSkeletons}
              theme={theme}
              isLoading={isLoading}
              error={error}
              editingSubtitleId={editingSubtitleId}
              jumpToTime={jumpToTime}
              updateSubtitleTranslation={updateSubtitleTranslation}
              toggleEditMode={toggleEditMode}
              translationStatus={translationStatus}
              translations={T}
              onRetry={handleTranslate}
            />
          </div>
        </ScrollArea>
      </div>
      
    </div>
  );
}

// 渐进式字幕列表组件
interface ProgressiveSubtitleListProps {
  subtitles: any[];
  showSkeletons: boolean;
  theme: string | undefined;
  isLoading: boolean;
  error: string | null;
  editingSubtitleId: string | null;
  jumpToTime: (timeString: string) => void;
  updateSubtitleTranslation: (id: string, newTranslation: string, sync?: boolean) => void | Promise<void>;
  toggleEditMode: (id: string) => void;
  translationStatus: string;
  translations: any;
  onRetry: () => void;
}

function ProgressiveSubtitleList({
  subtitles,
  showSkeletons,
  theme,
  isLoading,
  error,
  editingSubtitleId,
  jumpToTime,
  updateSubtitleTranslation,
  toggleEditMode,
  translationStatus,
  translations: T,
  onRetry
}: ProgressiveSubtitleListProps) {
  const skeletonCount = 5;
  
  // 🔥 修复：创建字幕ID到对象的映射，用于快速查找
  const subtitleMap = new Map(subtitles.map(sub => [parseInt(sub.id), sub]));
  
  // 🔥 修复：计算应该显示多少个条目（至少5个骨架屏，或者最大字幕ID+骨架屏）
  const maxSubtitleId = subtitles.length > 0 ? Math.max(...subtitles.map(s => parseInt(s.id))) : 0;
  const totalItems = Math.max(skeletonCount, maxSubtitleId + skeletonCount);
  
  // 生成混合的骨架屏和真实内容
  const renderItems = () => {
    const items = [];
    
    for (let position = 1; position <= totalItems; position++) {
      const subtitle = subtitleMap.get(position); // 根据位置查找对应字幕
      const shouldShowSkeleton = showSkeletons && !subtitle;
      
      if (shouldShowSkeleton) {
        // 显示骨架屏
        items.push(
          <motion.div
            key={`skeleton-${position}`}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <SubtitleSkeleton theme={theme} />
          </motion.div>
        );
      } else if (subtitle) {
        // 显示真实字幕 - 🔥 修复：使用正确的替换动画
        items.push(
          <motion.div 
            key={`subtitle-${subtitle.id}`}
            className={cn(
              "p-2 sm:p-3 rounded-xl",
              theme === "dark" ? "bg-zinc-800" : "bg-gray-100"
            )}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ 
              duration: 0.4, 
              ease: "easeOut",
              delay: 0.1 // 短暂延迟使替换效果更明显
            }}
          >
            <SubtitleContent
              subtitle={subtitle}
              theme={theme}
              editingSubtitleId={editingSubtitleId}
              jumpToTime={jumpToTime}
              updateSubtitleTranslation={updateSubtitleTranslation}
              toggleEditMode={toggleEditMode}
              translationStatus={translationStatus}
              translations={T}
            />
          </motion.div>
        );
      }
    }
    
    return items;
  };
  
  // 错误状态
  if (error && !isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-32 text-red-500">
        <p>{T.errorLabel || "Error"}: {error}</p>
        <Button variant="link" onClick={onRetry} className="mt-2">
          {T.retryLabel || "Try Again"}
        </Button>
      </div>
    );
  }
  
  // 空状态
  if (!isLoading && !error && subtitles.length === 0 && !showSkeletons) {
    return (
      <div className="flex justify-center items-center h-32 text-muted-foreground">
        <p>{T.noSubtitlesFoundLabel || "No subtitles. Select language & click Translate."}</p>
      </div>
    );
  }
  
  // 传统loading状态
  if (subtitles.length === 0 && isLoading && !showSkeletons) {
    return (
      <div className="flex justify-center items-center h-32">
        <p>{T.loadingSubtitlesLabel || T.loadingLabel || "Loading subtitles..."}</p>
      </div>
    );
  }
  
  return (
    <AnimatePresence mode="popLayout">
      {renderItems()}
    </AnimatePresence>
  );
}

// 字幕内容组件
interface SubtitleContentProps {
  subtitle: any;
  theme: string | undefined;
  editingSubtitleId: string | null;
  jumpToTime: (timeString: string) => void;
  updateSubtitleTranslation: (id: string, newTranslation: string, sync?: boolean) => void | Promise<void>;
  toggleEditMode: (id: string) => void;
  translationStatus: string;
  translations: any;
}

function SubtitleContent({
  subtitle,
  theme,
  editingSubtitleId,
  jumpToTime,
  updateSubtitleTranslation,
  toggleEditMode,
  translationStatus,
  translations: T
}: SubtitleContentProps) {
  return (
    <>
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-0 sm:justify-between mb-3">
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4">
          <div className="flex items-center space-x-1">
            <ClockIcon className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-muted-foreground">
              {subtitle.startTime} - {subtitle.endTime} 
            </span>
          </div>
          {subtitle.speaker && (
            <div className="flex items-center space-x-1">
              <UserIcon className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">
                {subtitle.speaker}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
            onClick={() => jumpToTime(subtitle.startTime)}
          >
            <PlayIcon className="h-3 w-3 mr-1" />
            {T.jumpToLabel}
          </Button>
        </div>
      </div>
      
      <div className="mb-3">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">
          {T.originalSubtitleLabel}
        </label>
        <div className={cn(
          "p-2 sm:p-3 rounded-lg text-sm",
          theme === "dark" ? "bg-zinc-900" : "bg-gray-50"
        )}>
          {subtitle.text}
        </div>
      </div>
      
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">
            {T.translatedSubtitleLabel}
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => toggleEditMode(subtitle.id)}
            disabled={translationStatus !== 'translated'}
          >
            {editingSubtitleId === subtitle.id ? T.saveLabel : T.editLabel}
          </Button>
        </div>
        
        {editingSubtitleId === subtitle.id ? (
          <Textarea
            value={subtitle.translation}
            onChange={(e) => updateSubtitleTranslation(subtitle.id, e.target.value, true)}
            className={cn(
              "min-h-[60px] text-sm",
              theme === "dark" ? "bg-zinc-800 border-zinc-700" : "bg-white"
            )}
          />
        ) : subtitle.translation ? (
          <div className={cn(
            "p-2 sm:p-3 rounded-lg text-sm",
            theme === "dark" ? "bg-zinc-900 text-blue-400" : "bg-blue-50 text-blue-700"
          )}>
            {subtitle.translation}
          </div>
        ) : (
          <div className={cn(
            "p-2 sm:p-3 rounded-lg text-sm text-muted-foreground italic",
            theme === "dark" ? "bg-zinc-900" : "bg-gray-50"
          )}>
            {T.noTranslationLabel}
          </div>
        )}
      </div>
    </>
  );
} 