import AudioVideoHero from "@/components/audio-video-hero";
import AudioVideoFeatures from "@/components/audio-video-features";
import VideoShowcase from "@/components/video-showcase";
import AudioVideoAdvantages from "@/components/audio-video-advantages";
import WabiSabiBackground from "@/components/wabi-sabi-background";

export default function HomePage() {
  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />

      {/* 内容区域 */}
      <div className="relative z-10">
        {/* 音视频AI处理平台英雄区域 */}
        <AudioVideoHero />
        
        {/* 核心功能展示区域 */}
        <AudioVideoFeatures />
        
        {/* 视频翻译效果展示区域 */}
        <VideoShowcase />
        
        {/* 平台优势区域 */}
        <AudioVideoAdvantages />
      </div>
    </main>
  );
}
