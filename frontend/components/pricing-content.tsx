'use client';

import { useState } from "react";
import { m as motion } from "@/lib/lazy-motion";
import { SparklesIcon } from "@heroicons/react/24/solid";
import PricingToggle from "@/components/pricing-toggle";
import PlanCard, { PlanProps } from "@/components/plan-card";
import FaqAccordion from "@/components/faq-accordion";
import { useLanguage } from "@/hooks/use-language";
import WabiSabiBackground from "@/components/wabi-sabi-background";

export default function PricingContent() {
  const [isYearly, setIsYearly] = useState(true);
  const { t } = useLanguage();
  
  const handlePricingToggle = (yearly: boolean) => {
    setIsYearly(yearly);
  };

  const plans: Omit<PlanProps, 'onSelect'>[] = [
    {
      title: t("freePlan"),
      monthlyPrice: 0,
      features: [
        { title: t("freeProcessing") },
        { title: t("limitedAccess") }
      ],
      variant: "dark",
      cta: t("selectPlan")
    },
    {
      title: t("basicPlan"),
      monthlyPrice: 10,
      discountedPrice: isYearly ? 8 : undefined,
      features: [
        { title: "~100小时 音频转录" },
        { title: "~50小时 语音合成" },
        { title: "~20小时 视频翻译" },
        { title: "标准音质输出" },
        { title: t("commercialLicense") }
      ],
      variant: "green",
      cta: t("selectPlan")
    },
    {
      title: t("proPlan"),
      monthlyPrice: 35,
      discountedPrice: isYearly ? 28 : undefined,
      features: [
        { title: "~500小时 音频转录" },
        { title: "~300小时 语音合成" },
        { title: "~100小时 视频翻译" },
        { title: "高保真音质输出" },
        { title: "API 接入权限" },
        { title: t("commercialLicense") }
      ],
      variant: "blue",
      cta: t("selectPlan")
    },
    {
      title: t("maxPlan"),
      monthlyPrice: 60,
      discountedPrice: isYearly ? 48 : undefined,
      features: [
        { title: "~无限 音频转录" },
        { title: "~无限 语音合成" },
        { title: "~500小时 视频翻译" },
        { title: "专业级音质输出" },
        { title: "完整 API 访问" },
        { title: "专属技术支持" },
        { title: t("commercialLicense") }
      ],
      variant: "purple",
      cta: t("selectPlan")
    }
  ];

  const faqs = [
    {
      question: t("processingUnitsQuestion"),
      answer: t("processingUnitsAnswer")
    },
    {
      question: t("rolloverQuestion"),
      answer: t("rolloverAnswer")
    },
    {
      question: t("exceedLimitQuestion"),
      answer: (
        <div>
          <p>{t("exceedLimitAnswer")}</p>
        </div>
      )
    }
  ];

  const handleSelectPlan = (_planTitle: string) => {
    // Analytics tracking could go here in production
    // Handle plan selection logic here
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* 统一的诧寂美学背景 */}
      <WabiSabiBackground />
      
      {/* 内容区域 */}
      <motion.div
        className="relative z-10 max-w-6xl mx-auto px-4 py-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">{t("voiceForgeAiPlans")}</h1>
        <p className="text-gray-600">{t("upgradeDesc")}</p>
        
        <div className="bg-blue-50 text-blue-600 py-2 px-4 rounded-lg inline-flex items-center mt-4 text-sm">
                        <SparklesIcon className="h-5 w-5 mr-2" />
          {t("enterpriseAvailable")}
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 ml-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      
      <PricingToggle onToggle={handlePricingToggle} defaultYearly={true} />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        {plans.map((plan, index) => (
          <PlanCard
            key={index}
            {...plan}
            onSelect={() => handleSelectPlan(plan.title)}
          />
        ))}
      </div>
      
      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-6 text-center">{t("faq")}</h2>
        <FaqAccordion items={faqs} />
      </div>
      
      <div className="text-center text-sm text-gray-500">
        {t("needHelp")} 
        <a href="mailto:support@shengdu.ai" className="text-blue-500 hover:underline ml-1">support@shengdu.ai</a>
      </div>
      </motion.div>
    </div>
  );
} 