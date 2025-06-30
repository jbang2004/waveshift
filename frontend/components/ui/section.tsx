import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  className?: string;
  background?: "transparent" | "muted";
  padding?: "default" | "large" | "small";
}

export function Section({ 
  children, 
  className, 
  background = "transparent",
  padding = "default" 
}: SectionProps) {
  const paddingClasses = {
    small: "py-12",
    default: "py-16", 
    large: "py-20"
  };

  const backgroundClasses = {
    transparent: "bg-transparent",
    muted: "bg-stone-50/30 dark:bg-stone-900/30"
  };

  return (
    <section className={cn(
      paddingClasses[padding],
      backgroundClasses[background],
      className
    )}>
      <div className="container mx-auto px-4">
        {children}
      </div>
    </section>
  );
} 