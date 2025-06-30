import { LazyMotion, domAnimation, m } from "framer-motion";
import React from "react";

// 官方推荐的懒加载方式：LazyMotion + domAnimation + m
// 使用 framer-motion 而不是 motion 包，以避免重复依赖
export { LazyMotion, domAnimation, m };

// 便捷的 LazyMotion Provider 组件
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(
    LazyMotion,
    { features: domAnimation },
    children
  );
}

// 重新导出常用的 motion 组件，统一使用 framer-motion
export { motion } from "framer-motion"; 