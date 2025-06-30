"use client";

import { m as motion } from "@/lib/lazy-motion";
import { MicrophoneIcon, SpeakerWaveIcon, LanguageIcon, ArrowRightIcon, CheckCircleIcon, ClockIcon } from "@heroicons/react/24/solid";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { SectionHeader } from "@/components/ui/section-header";
import { useLanguage } from "@/hooks/use-language";
import Link from "next/link";

interface FeatureData {
  title: string;
  description: string;
  features: string;
  icon: React.ReactNode;
  href: string;
  gradient: string;
  badge?: string;
  status: 'available' | 'coming-soon';
}

export default function AudioVideoFeatures() {
  const { t, language } = useLanguage();

  const featuresData: FeatureData[] = [
    {
      title: t("audioTranscriptionTitle"),
      description: t("audioTranscriptionDesc"),
      features: t("audioTranscriptionFeatures"),
      icon: <MicrophoneIcon className="w-8 h-8" />,
      href: "/audio-transcription",
      gradient: "from-blue-500 to-cyan-500",
      badge: t("comingSoon"),
      status: 'coming-soon'
    },
    {
      title: t("textToSpeechTitle"),
      description: t("textToSpeechDesc"),
      features: t("textToSpeechFeatures"),
      icon: <SpeakerWaveIcon className="w-8 h-8" />,
      href: "/text-to-speech",
      gradient: "from-purple-500 to-pink-500",
      badge: t("comingSoon"),
      status: 'coming-soon'
    },
    {
      title: t("videoTranslationTitle"),
      description: t("videoTranslationDesc"),
      features: t("videoTranslationFeatures"),
      icon: <LanguageIcon className="w-8 h-8" />,
      href: "/video-translation",
      gradient: "from-green-500 to-teal-500",
      badge: language === "zh" ? "已上线" : "Available",
      status: 'available'
    }
  ];

  const FeatureCard = ({ feature, index }: { feature: FeatureData; index: number }) => {
    const isComingSoon = feature.status === 'coming-soon';
    
    const CardContent = () => (
      <div className={`relative p-6 h-full bg-stone-50/50 dark:bg-stone-800/50 backdrop-blur-sm border border-stone-200/50 dark:border-stone-700/50 rounded-3xl transition-all duration-300 overflow-hidden ${
        isComingSoon 
          ? 'opacity-75 cursor-not-allowed' 
          : 'hover:bg-stone-100/60 dark:hover:bg-stone-700/60 hover:border-stone-300/60 dark:hover:border-stone-600/60 hover:shadow-2xl hover:-translate-y-2'
      } group`}>
        {/* 渐变背景 */}
        {!isComingSoon && (
          <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
        )}
        
        {/* 即将推出的遮罩 */}
        {isComingSoon && (
          <div className="absolute inset-0 bg-stone-200/20 dark:bg-stone-800/20 backdrop-blur-[1px] rounded-3xl" />
        )}
        
        {/* Badge */}
        <div className="absolute top-6 right-6">
          <Badge 
            variant={isComingSoon ? "secondary" : "default"} 
            className={`text-xs ${
              isComingSoon 
                ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' 
                : 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700'
            }`}
          >
            {isComingSoon && <ClockIcon className="w-3 h-3 mr-1" />}
            {feature.badge}
          </Badge>
        </div>

        {/* 图标 */}
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-r ${feature.gradient} mb-4 ${
          isComingSoon ? 'opacity-60' : 'group-hover:scale-110'
        } transition-transform duration-300`}>
          <div className="text-white">
            {feature.icon}
          </div>
        </div>

        {/* 标题和描述 */}
        <h3 className={`text-xl font-bold mb-3 transition-colors ${
          isComingSoon ? 'text-stone-500 dark:text-stone-400' : 'text-stone-800 dark:text-stone-100 group-hover:text-stone-900 dark:group-hover:text-stone-50'
        }`}>
          {feature.title}
        </h3>
        <p className="text-stone-600 dark:text-stone-400 text-sm mb-4 leading-relaxed">
          {feature.description}
        </p>

        {/* 功能特性 */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            {feature.features.split(" • ").map((item, idx) => (
              <div key={idx} className={`flex items-center text-sm bg-stone-200/50 dark:bg-stone-700/50 px-3 py-1 rounded-full ${
                isComingSoon ? 'text-stone-500 dark:text-stone-400' : 'text-stone-700 dark:text-stone-300'
              }`}>
                <CheckCircleIcon className={`w-3 h-3 mr-2 flex-shrink-0 ${
                  isComingSoon ? 'text-stone-500 dark:text-stone-400' : 'text-emerald-500'
                }`} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 按钮 */}
        <Button 
          className={`w-full transition-all duration-300 ${
            isComingSoon 
              ? 'bg-stone-300/50 dark:bg-stone-700/50 text-stone-500 dark:text-stone-400 cursor-not-allowed' 
              : 'bg-stone-200 dark:bg-stone-700 text-stone-800 dark:text-stone-100 hover:bg-stone-700 hover:text-stone-50 dark:hover:bg-stone-600'
          }`}
          variant="outline"
          size="lg"
          disabled={isComingSoon}
        >
          {isComingSoon ? t("comingSoon") : (language === "zh" ? "开始使用" : "Get Started")}
          {!isComingSoon && (
            <ArrowRightIcon className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
          )}
          {isComingSoon && (
            <ClockIcon className="w-4 h-4 ml-2" />
          )}
        </Button>
      </div>
    );

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.2, duration: 0.6 }}
        viewport={{ once: true }}
        className="group relative"
      >
        {isComingSoon ? (
          <CardContent />
        ) : (
          <Link href={feature.href}>
            <CardContent />
          </Link>
        )}
      </motion.div>
    );
  };

  return (
    <section className="py-20 bg-gradient-to-b from-transparent to-muted/5">
      <BlurFade delay={0.25} inView>
        <SectionHeader 
          title={t("coreFeatures")}
          description={t("coreFeaturesDesc")}
        />
      </BlurFade>

      {/* 功能卡片网格 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {featuresData.map((feature, index) => (
          <FeatureCard key={feature.title} feature={feature} index={index} />
        ))}
      </div>
    </section>
  );
} 