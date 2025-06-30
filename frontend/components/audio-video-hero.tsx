"use client";

import { ArrowRightIcon } from "@heroicons/react/24/solid";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import Link from "next/link";
import Image from "next/image";

export default function AudioVideoHero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* 主要内容 */}
      <div className="relative z-10 container mx-auto px-4 text-center pb-20 -mt-16">
        {/* Logo 和品牌标识 */}
        <BlurFade delay={0.25} inView>
          <div className="flex flex-col items-center">
            {/* Logo - 往上移动 */}
            <div className="-mb-4">
              <Image 
                src="/logo.png" 
                alt="WaveShift声渡 Logo" 
                width={416}
                height={416}
                className="w-72 h-72 sm:w-80 sm:h-80 lg:w-96 lg:h-96 xl:w-[26rem] xl:h-[26rem] object-contain"
                priority
              />
            </div>
            
            {/* WaveShift - 保持呼吸感的间距 */}
            <div className="mb-4">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-stone-800 dark:text-stone-100">
                WaveShift
              </h1>
            </div>
            
            {/* 声渡 - 增加呼吸感的间距 */}
            <div className="mb-8">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-stone-700 dark:text-stone-200">
                声渡
              </h2>
            </div>
            
            {/* Slogan - 使用诧寂美学的自然色调 */}
            <div className="mb-8 px-6 py-3 rounded-full bg-stone-600/90 dark:bg-stone-700/90 text-stone-50 font-medium shadow-lg backdrop-blur-sm border border-stone-500/20">
              <span className="text-sm">
                {t("siteTagline")}
              </span>
            </div>
          </div>
        </BlurFade>

        {/* 行动按钮 */}
        <BlurFade delay={0.5} inView>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/video-translation" prefetch>
              <Button 
                size="lg" 
                className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-md border border-stone-300/40 dark:border-stone-600/40 shadow-lg text-stone-800 dark:text-stone-100 hover:bg-stone-700 hover:text-stone-50 dark:hover:bg-stone-600 dark:hover:text-stone-50 hover:border-stone-600/60 px-8 py-4 text-lg font-semibold transition-all duration-300"
              >
                {t("tryForFree")}
                <ArrowRightIcon className="ml-2 w-5 h-5" />
              </Button>
            </Link>
            
            <Link href="/pricing" prefetch>
              <Button 
                variant="outline" 
                size="lg" 
                className="bg-transparent backdrop-blur-md border-2 border-stone-400/50 dark:border-stone-500/50 shadow-lg text-stone-700 dark:text-stone-200 hover:bg-stone-700 hover:text-stone-50 dark:hover:bg-stone-600 dark:hover:text-stone-50 hover:border-stone-600/60 px-8 py-4 text-lg transition-all duration-300"
              >
                {t("viewPricing")}
              </Button>
            </Link>
          </div>
        </BlurFade>
      </div>
    </section>
  );
} 