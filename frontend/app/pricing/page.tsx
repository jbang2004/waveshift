import { Suspense } from "react";
import dynamic from "next/dynamic";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "定价方案 - WaveShift",
  description: "选择适合您需求的AI视频翻译和语音转换服务方案",
  keywords: ["AI翻译", "视频翻译", "语音转换", "定价", "订阅"],
};

// 动态导入需要客户端交互的组件
const PricingContent = dynamic(() => import("@/components/pricing-content"), {
  loading: () => (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mb-4 w-48 mx-auto" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-96 mx-auto" />
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  ),
});

export default function PricingPage() {
  return (
    <main className="min-h-screen">
      <Suspense 
        fallback={
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse mb-4 w-48 mx-auto" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-md animate-pulse w-96 mx-auto" />
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        }
      >
        <PricingContent />
      </Suspense>
    </main>
  );
} 