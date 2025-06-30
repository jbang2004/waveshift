import { 
  PlusIcon,
  VideoCameraIcon,
  XMarkIcon,
  PlayIcon,
  PauseIcon,
  SparklesIcon
} from "@heroicons/react/24/solid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Translations } from "@/lib/translations";
import TVStaticEffect from "./TVStaticEffect";
import HLSPlayer from "./HLSPlayer";

interface VideoPanelProps {
  theme: string | undefined;
  selectedFile: File | null;
  videoPreviewUrl: string | null;
  isUploading: boolean;
  uploadProgress: number;
  uploadComplete: boolean;
  isPlaying: boolean;
  displaySubtitlesPanel: boolean;
  translations: Translations;
  handleUploadClick: () => void;
  resetUpload: () => void;
  togglePlayback: () => void;
  handlePreprocessingTrigger: () => void;
  startGenerating: () => void;
  videoRef: React.RefObject<HTMLVideoElement>;
  fileInputRef: React.RefObject<HTMLInputElement>;
  processingComplete: boolean;
  processingError: Error | null;
  isGenerating: boolean;
  canPlay: boolean;
  hlsPlaylistUrl: string | null;
  isTranslating: boolean;
  translationCompleted: boolean;
  isVideoCompleted: boolean;
}

export default function VideoPanel({
  theme,
  selectedFile,
  videoPreviewUrl,
  isUploading,
  uploadProgress,
  uploadComplete,
  isPlaying,
  displaySubtitlesPanel,
  translations: T,
  handleUploadClick,
  resetUpload,
  togglePlayback,
  // handlePreprocessingTrigger,
  startGenerating,
  videoRef,
  // fileInputRef,
  processingComplete,
  processingError,
  isGenerating,
  canPlay,
  hlsPlaylistUrl,
  isTranslating,
  translationCompleted,
  isVideoCompleted
}: VideoPanelProps) {

  return (
    <div className={cn(
      "p-6 rounded-3xl shadow-lg", 
      theme === "dark" ? "bg-zinc-900" : "bg-gray-100"
    )}>
      <div className="h-[280px] mb-6 flex items-center justify-center">
        {canPlay && hlsPlaylistUrl ? (
          <div className="w-full h-full rounded-2xl overflow-hidden bg-black relative">
            <HLSPlayer
              src={hlsPlaylistUrl}
              className="w-full h-full object-contain"
              controls={true}
              autoPlay={false}
            />
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 h-8 w-8 bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 rounded-full z-10" 
              onClick={resetUpload}
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
            
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-white text-xs max-w-[70%] truncate z-10">
              翻译后的视频 (HLS流)
            </div>
          </div>
        ) : selectedFile && videoPreviewUrl ? (
          <div className="w-full h-full rounded-2xl overflow-hidden bg-black relative group/video">
            <video 
              ref={videoRef}
              src={videoPreviewUrl}
              className="w-full h-full object-contain cursor-pointer"
              playsInline
              preload="auto"
              onClick={togglePlayback}
            >
              您的浏览器不支持视频标签。
            </video>
            
            <div 
              className="absolute inset-0 flex items-center justify-center pointer-events-none" 
            >
              <div className={cn(
                "bg-white/20 backdrop-blur-sm h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 ease-out",
                isPlaying ? "opacity-0 scale-75 group-hover/video:opacity-100 group-hover/video:scale-100" : "opacity-100 scale-100"
              )}>
                {isPlaying ? <PauseIcon className="h-10 w-10 text-white" /> : <PlayIcon className="h-10 w-10 text-white" />}
              </div>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 h-8 w-8 bg-black/60 backdrop-blur-sm text-white hover:bg-black/80 rounded-full z-10" 
              onClick={resetUpload}
            >
              <XMarkIcon className="h-4 w-4" />
            </Button>
            
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm rounded-lg px-2 py-1 text-white text-xs max-w-[70%] truncate z-10">
              {selectedFile?.name || "sample-video.mp4"}
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full overflow-hidden rounded-2xl bg-black flex items-center justify-center">
            <TVStaticEffect />
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <VideoCameraIcon className="w-12 h-12 text-white opacity-75" />
            </div>
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-center mb-3">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center mr-3",
          theme === "dark" ? "bg-zinc-800" : "bg-blue-100"
        )}>
          <VideoCameraIcon className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold">{T.title}</h1>
      </div>
      
      <p className="text-muted-foreground text-sm text-center mb-6">
        {T.description}
      </p>
      
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-5 w-full mt-6">
        {!isUploading && !uploadComplete && (
          <Button
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors"
            onClick={handleUploadClick}
          >
            <PlusIcon className="w-6 h-6 mr-2" />
            <span className="text-base">{T.uploadVideoLabel}</span>
          </Button>
        )}

        {isUploading && (
          <div className="w-full sm:flex-1 h-14 rounded-xl bg-gray-200 dark:bg-zinc-700 overflow-hidden relative flex items-center justify-center border border-gray-300 dark:border-zinc-600">
            <div
              className="absolute top-0 left-0 h-full bg-green-500 transition-all duration-300 ease-linear"
              style={{ width: `${uploadProgress}%` }}
            />
            <span className="relative z-10 text-sm font-semibold text-white mix-blend-screen"> 
              {`${T.uploadingLabel} ${uploadProgress}%`}
            </span>
          </div>
        )}
        
        {!isUploading && uploadComplete && !processingComplete && processingError && (
          <Button
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-red-600 flex items-center justify-center transition-colors"
          >
            <span className="text-base font-semibold">
              {processingError.message === 'TASK_ERROR'
                ? T.preprocessingErrorLabel
                : processingError.message}
            </span>
          </Button>
        )}
        {!isUploading && uploadComplete && !processingComplete && !processingError && (
          <Button
            disabled
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-green-600 flex items-center justify-center transition-colors"
          >
            <span className="text-lg font-bold shiny-text">{T.startPreprocessingLabel}</span>
          </Button>
        )}

        {!isUploading && uploadComplete && processingComplete && displaySubtitlesPanel && !isGenerating && !canPlay && (
          <Button
            className={cn(
              "w-full sm:flex-1 h-14 rounded-xl transition-colors flex items-center justify-center",
              theme === "dark" ? "dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-blue-400" : "bg-slate-200 hover:bg-slate-300 text-blue-600"
            )}
            onClick={startGenerating}
            disabled={isTranslating || !translationCompleted}
          >
            <SparklesIcon className="w-6 h-6 mr-2" />
            <span className="text-base">
              {isTranslating ? "翻译中..." : !translationCompleted ? "请先完成翻译" : T.generateLabel}
            </span>
          </Button>
        )}

        {!isUploading && uploadComplete && processingComplete && displaySubtitlesPanel && isGenerating && !canPlay && (
          <Button
            disabled
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-blue-600 flex items-center justify-center transition-colors"
          >
            <SparklesIcon className="w-6 h-6 mr-2" />
            <span className="text-lg font-bold shiny-text">{T.generatingLabel}</span>
          </Button>
        )}

        {!isUploading && uploadComplete && processingComplete && displaySubtitlesPanel && isGenerating && canPlay && !isVideoCompleted && (
          <Button
            disabled
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-blue-600 flex items-center justify-center transition-colors"
          >
            <SparklesIcon className="w-6 h-6 mr-2" />
            <span className="text-lg font-bold shiny-text">{T.generatingLabel}</span>
          </Button>
        )}

        {!isUploading && uploadComplete && processingComplete && displaySubtitlesPanel && isVideoCompleted && (
          <Button
            disabled
            className="w-full sm:flex-1 h-14 text-white rounded-xl bg-green-600 flex items-center justify-center transition-colors"
          >
            <SparklesIcon className="w-6 h-6 mr-2" />
            <span className="text-lg font-bold">已完成</span>
          </Button>
        )}
      </div>
      
      <div className="text-center mt-6 text-xs text-muted-foreground">
        Max 75MB / 15 seconds
      </div>
    </div>
  );
} 