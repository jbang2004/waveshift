"use client";

import { useState } from "react";
import { PlayIcon, PauseIcon, SpeakerWaveIcon, UsersIcon, ClockIcon } from "@heroicons/react/24/solid";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { SectionHeader } from "@/components/ui/section-header";
import { useLanguage } from "@/hooks/use-language";

export default function VideoShowcase() {
  const { t, language } = useLanguage();
  const [isPlaying, setIsPlaying] = useState(false);

  const highlights = [
    {
      icon: <PlayIcon className="w-5 h-5" />,
      title: t("realtimeTranslation"),
      description: t("realtimeTranslationDesc"),
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: <UsersIcon className="w-5 h-5" />,
      title: t("multiSpeakerVoice"),
      description: t("multiSpeakerVoiceDesc"),
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: <ClockIcon className="w-5 h-5" />,
      title: t("smoothPacing"),
      description: t("smoothPacingDesc"),
      color: "from-green-500 to-teal-500"
    }
  ];

  return (
    <Section padding="large">
      <BlurFade delay={0.25} inView>
        <SectionHeader 
          title={t("videoShowcase")}
          description={t("videoShowcaseDesc")}
        />
      </BlurFade>

      {/* 核心亮点 */}
      <BlurFade delay={0.4} inView>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12 max-w-4xl mx-auto">
          {highlights.map((highlight, index) => (
            <div
              key={index}
              className="relative group"
            >
              <div className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-md border border-stone-300/40 dark:border-stone-600/40 shadow-lg rounded-2xl p-5 text-center hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-800 dark:hover:text-stone-100 hover:border-stone-400/60 dark:hover:border-stone-500/60 transition-all duration-300">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-r ${highlight.color} mb-3 group-hover:scale-110 transition-transform`}>
                  <div className="text-white">
                    {highlight.icon}
                  </div>
                </div>
                <h3 className="text-base font-semibold mb-2">{highlight.title}</h3>
                <p className="text-sm text-stone-600 dark:text-stone-400 group-hover:text-stone-700 dark:group-hover:text-stone-300 leading-relaxed">
                  {highlight.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </BlurFade>

      {/* 视频对比展示 */}
      <BlurFade delay={0.6} inView>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* 原始视频 */}
          <div className="relative group">
            <div className="relative bg-stone-50/50 dark:bg-stone-800/50 backdrop-blur-sm border border-stone-200/50 dark:border-stone-700/50 rounded-3xl p-5 h-full">
              <div className="mb-4">
                <Badge variant="outline" className="mb-2 border-stone-300 dark:border-stone-600 text-stone-700 dark:text-stone-300">
                  {t("originalVideo")}
                </Badge>
                <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100">{t("originalVideo")}</h3>
              </div>
              
              {/* 占位视频区域 */}
              <div className="relative aspect-video bg-stone-200/50 dark:bg-stone-700/50 rounded-xl mb-4 overflow-hidden group-hover:shadow-lg transition-shadow">
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-700 dark:to-stone-800">
                  <div className="text-center">
                    <PlayIcon className="w-16 h-16 mx-auto mb-4 text-stone-500 dark:text-stone-400" />
                    <p className="text-stone-600 dark:text-stone-400">{language === "zh" ? "英文原始视频" : "English Original Video"}</p>
                    <p className="text-sm text-stone-500 dark:text-stone-500 mt-2">
                      {language === "zh" ? "演示视频：商务会议场景" : "Demo Video: Business Meeting Scene"}
                    </p>
                  </div>
                </div>
                
                {/* 播放控制覆盖层 */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button 
                    size="lg" 
                    className="rounded-full bg-white/90 text-black hover:bg-white"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center text-sm text-stone-600 dark:text-stone-400">
                  <SpeakerWaveIcon className="w-4 h-4 mr-2" />
                  {language === "zh" ? "英文 • 2个说话人 • 3:45 时长" : "English • 2 speakers • 3:45 duration"}
                </div>
              </div>
            </div>
          </div>

          {/* 翻译后视频 */}
          <div className="relative group">
            <div className="relative bg-stone-50/50 dark:bg-stone-800/50 backdrop-blur-sm border border-stone-300/60 dark:border-stone-600/60 rounded-3xl p-5 h-full">
              <div className="mb-4">
                <Badge className="mb-2 bg-gradient-to-r from-stone-600 to-stone-700 dark:from-stone-500 dark:to-stone-600 text-white">
                  {t("translatedVideo")}
                </Badge>
                <h3 className="text-xl font-semibold text-stone-800 dark:text-stone-100">{t("translatedVideo")}</h3>
              </div>
              
              {/* 占位视频区域 */}
              <div className="relative aspect-video bg-gradient-to-br from-stone-200/50 to-stone-300/50 dark:from-stone-700/50 dark:to-stone-600/50 rounded-xl mb-4 overflow-hidden group-hover:shadow-lg transition-shadow">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-stone-600 to-stone-700 dark:from-stone-500 dark:to-stone-600 rounded-full flex items-center justify-center">
                      <PlayIcon className="w-8 h-8 text-white" />
                    </div>
                    <p className="text-stone-800 dark:text-stone-100 font-medium">{language === "zh" ? "中文配音视频" : "Chinese Dubbed Video"}</p>
                    <p className="text-sm text-stone-600 dark:text-stone-400 mt-2">
                      {language === "zh" ? "AI智能翻译：声音完美保留" : "AI Smart Translation: Perfect Voice Preservation"}
                    </p>
                  </div>
                </div>
                
                {/* 播放控制覆盖层 */}
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button 
                    size="lg" 
                    className="rounded-full bg-stone-600 dark:bg-stone-500 text-white hover:bg-stone-700 dark:hover:bg-stone-400"
                    onClick={() => setIsPlaying(!isPlaying)}
                  >
                    {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center text-sm text-stone-600 dark:text-stone-400">
                  <SpeakerWaveIcon className="w-4 h-4 mr-2" />
                  {language === "zh" ? "中文 • 保留2个说话人声音 • 3:45 时长" : "Chinese • 2 speakers preserved • 3:45 duration"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </BlurFade>
    </Section>
  );
} 