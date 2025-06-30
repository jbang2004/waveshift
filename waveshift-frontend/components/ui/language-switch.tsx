"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface LanguageSwitchProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

/*
 * 设计：
 *  ┌───┬───┐
 *  │ 中 │ EN│  <–– 轻量分段选择器
 *  └───┴───┘
 */
export function LanguageSwitch({ value, onChange, disabled, className }: LanguageSwitchProps) {
  const handleChange = (lang: string) => {
    if (disabled || lang === value) return;
    onChange(lang);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-background p-0.5 shadow-sm",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {[
        { label: "中", lang: "zh" },
        { label: "EN", lang: "en" },
      ].map(({ label, lang }) => {
        const active = value === lang;
        return (
          <button
            key={lang}
            className={cn(
              "px-2 h-7 text-xs font-medium rounded-[0.25rem] transition-colors",
              active
                ? "bg-blue-600 text-white shadow"
                : "text-muted-foreground hover:bg-accent",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
            )}
            onClick={() => handleChange(lang)}
            disabled={disabled}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
} 