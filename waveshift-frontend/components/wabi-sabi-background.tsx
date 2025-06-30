'use client';

export default function WabiSabiBackground() {
  return (
    <div className="fixed inset-0 z-0">
      {/* 主背景 - 温暖的米色调 */}
      <div className="absolute inset-0 bg-gradient-to-br from-stone-50 via-amber-50/30 to-stone-100 dark:from-stone-900 dark:via-stone-800/50 dark:to-stone-900" />
      
      {/* 细微的纹理层 */}
      <div className="absolute inset-0 opacity-30 dark:opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-100/40 via-transparent to-stone-200/30" />
      
      {/* 柔和的几何图形 - 体现诧寂的不完美美学 */}
      <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-gradient-to-br from-amber-200/10 to-stone-300/10 blur-3xl" />
      <div className="absolute bottom-40 left-20 w-96 h-96 rounded-full bg-gradient-to-tl from-stone-200/15 to-amber-100/10 blur-3xl" />
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] rounded-full bg-gradient-to-r from-transparent via-amber-50/5 to-transparent blur-3xl" />
      
      {/* 微妙的噪点纹理 */}
      <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.025]" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
      }} />
    </div>
  );
} 