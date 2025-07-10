import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface SubtitleSkeletonProps {
  className?: string;
  theme?: string;
  style?: React.CSSProperties;
}

export function SubtitleSkeleton({ className, theme, style }: SubtitleSkeletonProps) {
  return (
    <div 
      className={cn(
        "p-2 sm:p-3 rounded-xl mb-3 relative overflow-hidden",
        theme === "dark" ? "bg-zinc-800" : "bg-gray-100",
        className
      )}
      style={style}
    >
      {/* Shimmer效果覆盖层 */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
      
      {/* 时间戳和说话人骨架 */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-4 mb-3">
        <div className="flex items-center space-x-1">
          <div className="h-4 w-4 rounded bg-blue-500/20" />
          <Skeleton className="h-3 w-20" />
        </div>
        <div className="flex items-center space-x-1">
          <div className="h-4 w-4 rounded bg-green-500/20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-6 w-16 rounded" />
      </div>
      
      {/* 原文骨架 */}
      <div className="mb-3">
        <Skeleton className="h-3 w-12 mb-2" />
        <div className={cn(
          "p-2 sm:p-3 rounded-lg",
          theme === "dark" ? "bg-zinc-900" : "bg-gray-50"
        )}>
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
      
      {/* 翻译文本骨架 */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-6 w-12 rounded" />
        </div>
        <div className={cn(
          "p-2 sm:p-3 rounded-lg",
          theme === "dark" ? "bg-zinc-900" : "bg-blue-50"
        )}>
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

// 多个骨架屏组件，用于流式加载效果
interface SubtitleSkeletonsProps {
  count?: number;
  theme?: string;
  className?: string;
}

export function SubtitleSkeletons({ count = 5, theme, className }: SubtitleSkeletonsProps) {
  return (
    <div className={className}>
      {Array.from({ length: count }).map((_, index) => (
        <SubtitleSkeleton 
          key={`skeleton-${index}`}
          theme={theme}
          className="animate-pulse"
          style={{
            animationDelay: `${index * 100}ms`, // 错开动画时间
            animationDuration: '1.5s'
          }}
        />
      ))}
    </div>
  );
}