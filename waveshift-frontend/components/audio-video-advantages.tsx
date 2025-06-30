"use client";

import { CheckCircle } from "lucide-react";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Section } from "@/components/ui/section";
import { useLanguage } from "@/hooks/use-language";

export default function AudioVideoAdvantages() {
  const { language } = useLanguage();
  
  const certifications = [
    "ISO 27001", "SOC 2 Type II", "GDPR", "CCPA", 
    "AWS Partner", "Google Cloud", "Azure", "HIPAA"
  ];

  const title = language === "zh" ? "企业级技术保障" : "Enterprise-Grade Technology Assurance";
  const description = language === "zh" 
    ? "通过多项国际认证，为您的音视频处理需求提供可靠保障"
    : "Certified by multiple international standards to provide reliable assurance for your audio and video processing needs";

  return (
    <Section padding="default">
      <BlurFade delay={0.25} inView>
        <div className="text-center">
          <div className="mb-8">
            <h3 className="text-2xl font-semibold mb-4 text-stone-800 dark:text-stone-100">{title}</h3>
            <p className="text-stone-600 dark:text-stone-400 mb-8">
              {description}
            </p>
          </div>

          <div className="flex flex-wrap justify-center items-center gap-6 max-w-4xl mx-auto">
            {certifications.map((cert) => (
              <div
                key={cert}
                className="flex items-center space-x-2 px-4 py-2 rounded-full bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-md border border-stone-300/40 dark:border-stone-600/40 shadow-lg text-stone-700 dark:text-stone-300 text-sm font-medium hover:bg-stone-200 dark:hover:bg-stone-700 hover:text-stone-800 dark:hover:text-stone-200 transition-all duration-300 cursor-default hover:scale-105"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{cert}</span>
              </div>
            ))}
          </div>
        </div>
      </BlurFade>
    </Section>
  );
} 