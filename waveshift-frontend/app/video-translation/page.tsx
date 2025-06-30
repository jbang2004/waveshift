'use client';

import { useState, useRef, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { useTheme } from "next-themes";
import { useAuth } from '@/contexts/auth-context';
import { useMediaQuery } from "@/hooks/use-media-query";
import { useMediaWorkflow } from "@/hooks/use-media-workflow";
import { useSubtitles } from "@/hooks/use-subtitles";
import { useVideoPlayer } from "@/hooks/use-video-player";
import { useHLSPlayer } from "@/hooks/use-hls-player";
import { cn } from "@/lib/utils";
import { getTranslations, Language as AppLanguage } from "@/lib/translations";
import dynamic from "next/dynamic";
import { m as motion } from "@/lib/lazy-motion";

// Import the new components
import { BlurFade } from "@/components/magicui/blur-fade";

// 重型组件懒加载，首屏更快，切换更流畅
const VideoPanel = dynamic(() => import("@/components/video-translation/VideoPanel"), {
  loading: () => <div className="h-[280px] w-full" />,
  ssr: false,
});

const SubtitlesPanel = dynamic(() => import("@/components/video-translation/SubtitlePanel"), {
  loading: () => <div className="min-h-[400px] w-full" />,
  ssr: false,
});

const WabiSabiBackground = dynamic(() => import("@/components/wabi-sabi-background"), {
  ssr: false,
});


const AnimatePresence = dynamic(() => import("framer-motion").then(mod => mod.AnimatePresence), {
  ssr: false,
  loading: () => null,
});

export default function VideoTranslation() {
  const { language: currentInterfaceLanguage } = useLanguage();
  const { resolvedTheme } = useTheme();
  const T = getTranslations(currentInterfaceLanguage as AppLanguage);

  const { user, isLoading } = useAuth();
  const currentUser = user;
  const authLoading = isLoading;
  const isMobile = useMediaQuery('(max-width: 767px)');
  
  const [targetLanguage, setTargetLanguage] = useState<string>("en");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [displaySubtitlesPanel, setDisplaySubtitlesPanel] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translationCompleted, setTranslationCompleted] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitlesContainerRef = useRef<HTMLDivElement>(null);

  // NextAuth.js 用户会话管理

  const {
    isUploading,
    uploadProgress,
    uploadComplete,
    processingComplete,
    videoPreviewUrl,
    uploadError,
    processingError,
    taskId,
    createAndUploadTask,
    resetWorkflow: resetVideoUploadHookState
  } = useMediaWorkflow();

  const {
    isPlaying,
    setIsPlaying,
    togglePlayback,
    jumpToTime,
  } = useVideoPlayer({ videoRef: videoRef as React.RefObject<HTMLVideoElement> });

  const {
    isGenerating,
    hlsPlaylistUrl,
    canPlay,
    generatingError,
    isVideoCompleted,
    startGenerating: startHLSGenerating,
    resetHLSState,
  } = useHLSPlayer();

  const {
    subtitles,
    showSubtitles, 
    editingSubtitleId,
    isLoadingSubtitles,
    subtitleError,   
    fetchSubtitles,  
    updateSubtitleTranslation,
    toggleEditMode,
    closeSubtitlesPanel: closeSubtitlesPanelHook,
    resetSubtitlesState,
  } = useSubtitles({ 
    loadCondition: processingComplete && !!videoPreviewUrl && displaySubtitlesPanel,
  });

  useEffect(() => {
    if (uploadError) {
      alert(T.alertMessages.uploadFailed(uploadError.message));
    }
  }, [uploadError, T.alertMessages]);

  useEffect(() => {
    if (generatingError) {
      alert(`生成失败: ${generatingError.message}`);
    }
  }, [generatingError]);

  useEffect(() => {
    if (videoRef.current && videoPreviewUrl) {
      videoRef.current.src = videoPreviewUrl;
    }
  }, [videoPreviewUrl]);
  
  useEffect(() => {
    if (processingComplete && !displaySubtitlesPanel) {
      setDisplaySubtitlesPanel(true);
    }
  }, [processingComplete, displaySubtitlesPanel]);

  useEffect(() => {
    if (processingComplete && displaySubtitlesPanel && taskId) {
      fetchSubtitles(taskId, targetLanguage);
    }
  }, [processingComplete, displaySubtitlesPanel, taskId, targetLanguage, fetchSubtitles]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      resetVideoUploadHookState();
      resetSubtitlesState();
      if (videoRef.current) {
        videoRef.current.src = "";
      }
      setIsPlaying(false);
      setDisplaySubtitlesPanel(false); 
      if (showSubtitles) closeSubtitlesPanelHook(); 
      startActualUploadProcess(file);
    }
  };

  // This function is passed to VideoPanel to trigger the hidden file input
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };
  
  const startActualUploadProcess = async (fileToUpload: File) => {
    if (!fileToUpload) {
      alert(T.alertMessages.selectVideoFirst);
      return;
    }
    if (authLoading) {
      alert("Auth loading, please wait...");
      return;
    }
    const userIdForUpload = currentUser?.id;
    if (!userIdForUpload) {
      alert(T.alertMessages.userInfoIncomplete);
      return;
    }
    if (userIdForUpload) {
      await createAndUploadTask(fileToUpload, {
        targetLanguage: targetLanguage === "en" ? "english" : "chinese",
        style: "normal"
      }); 
    }
  };

  const resetFullUploadAndPlayer = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
    }
    setSelectedFile(null);
    resetVideoUploadHookState();
    resetSubtitlesState();
    resetHLSState();
    setIsPlaying(false);
    setDisplaySubtitlesPanel(false); 
    if(fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handlePreprocessingTrigger = () => {
    if (processingComplete) {
      setDisplaySubtitlesPanel(true); 
    } else {
      alert(T.alertMessages.uploadNotComplete);
    }
  };
  
  const startGenerating = async () => {
    if (!taskId) {
      alert('任务 ID 缺失，无法触发 TTS');
      return;
    }
    await startHLSGenerating(taskId);
  };

  const getLanguageLabel = (value: string) => {
    const option = T.languageOptions.find(lang => lang.value === value);
    return option?.label || "";
  };

  const handleCloseSubtitlesPanel = () => {
    closeSubtitlesPanelHook(); 
    setDisplaySubtitlesPanel(false); 
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />
      
      {/* 内容区域 */}
      <motion.div
        className="relative z-10 container mx-auto px-2 sm:px-4 py-12 overflow-x-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
      <div className={cn(
        "flex flex-wrap justify-center",
        isMobile ? "mx-auto" : "-mx-2 md:-mx-3",
        isMobile && displaySubtitlesPanel ? "items-center flex-col" : "items-start"
      )}>
        <BlurFade
          layout
          className={cn(
            "px-2 md:px-3 mb-8",
            isMobile ? "w-full mx-auto max-w-md" :
              (displaySubtitlesPanel ? "md:mx-0 w-full max-w-md md:shrink-0" : "w-full max-w-md mx-auto")
          )}
          delay={0.25}
          inView={true}
        >
          <VideoPanel
            theme={resolvedTheme}
            selectedFile={selectedFile}
            videoPreviewUrl={videoPreviewUrl}
            isUploading={isUploading}
            uploadProgress={uploadProgress}
            uploadComplete={uploadComplete}
            processingComplete={processingComplete}
            processingError={processingError}
            isPlaying={isPlaying}
            displaySubtitlesPanel={displaySubtitlesPanel} 
            translations={T}
            handleUploadClick={triggerFileInput} 
            resetUpload={resetFullUploadAndPlayer}
            togglePlayback={togglePlayback} 
            handlePreprocessingTrigger={handlePreprocessingTrigger}
            startGenerating={startGenerating}
            videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            fileInputRef={fileInputRef as React.RefObject<HTMLInputElement>}
            isGenerating={isGenerating}
            canPlay={canPlay}
            hlsPlaylistUrl={hlsPlaylistUrl}
            isTranslating={isTranslating}
            translationCompleted={translationCompleted}
            isVideoCompleted={isVideoCompleted}
          />
        </BlurFade>
        
        <AnimatePresence mode="popLayout">
          {displaySubtitlesPanel && ( 
            <BlurFade
              layout
              className={cn(
                "w-full px-2 md:px-3 mx-auto",
                isMobile ? "mt-8 max-w-xl" : "mt-0 md:mx-0 md:basis-[36rem] md:grow md:shrink h-full"
              )}
              inView={true}
              delay={0.1}
              direction={isMobile ? "up" : "left"}
              offset={isMobile ? 20 : 50}
              duration={0.5}
            >
              <SubtitlesPanel
                theme={resolvedTheme}
                subtitles={subtitles}
                editingSubtitleId={editingSubtitleId}
                targetLanguage={targetLanguage}
                translations={T}
                isMobile={isMobile}
                isLoading={isLoadingSubtitles}
                error={subtitleError}
                getLanguageLabel={getLanguageLabel}
                jumpToTime={jumpToTime}
                updateSubtitleTranslation={updateSubtitleTranslation}
                toggleEditMode={toggleEditMode}
                setTargetLanguage={setTargetLanguage}
                fetchSubtitles={fetchSubtitles}
                closeSubtitlesPanel={handleCloseSubtitlesPanel}
                subtitlesContainerRef={subtitlesContainerRef as React.RefObject<HTMLDivElement>}
                currentTaskId={taskId || ""}
                onTranslationStart={() => {
                  setIsTranslating(true);
                  setTranslationCompleted(false);
                }}
                onTranslationComplete={() => {
                  setIsTranslating(false);
                  setTranslationCompleted(true);
                }}
              />
            </BlurFade>
          )}
        </AnimatePresence>
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileChange}
      />
      </motion.div>
    </div>
  );
}