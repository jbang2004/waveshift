import { ReactNode, Children, isValidElement } from "react";
import { m as motion } from "@/lib/lazy-motion";

interface StaggeredAnimationProps {
  children: ReactNode;
  staggerDelay?: number;
  initialY?: number;
}

/**
 * 对子元素应用错开的进入动画效果
 */
export default function StaggeredAnimation({ 
  children, 
  staggerDelay = 0.1,
  initialY = 15 
}: StaggeredAnimationProps) {
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: initialY },
    show: { 
      opacity: 1, 
      y: 0,
      transition: {
        type: "tween",
        ease: "easeOut",
        duration: 0.4
      }
    }
  };

  const childrenWithAnimations = Children.map(children, (child, index) => {
    if (isValidElement(child)) {
      return (
        <motion.div
          key={index}
          variants={itemVariants}
          className="w-full"
        >
          {child}
        </motion.div>
      );
    }
    return child;
  });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col w-full"
    >
      {childrenWithAnimations}
    </motion.div>
  );
}