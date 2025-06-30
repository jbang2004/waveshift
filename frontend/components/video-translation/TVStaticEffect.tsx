import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TVStaticEffectProps {
  className?: string;
}

const TVStaticEffect: React.FC<TVStaticEffectProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const parent = canvas.parentElement;

    const resizeAndDrawBlack = () => {
      if (!canvas || !ctx || !parent) return;
      const newWidth = parent.clientWidth;
      const newHeight = parent.clientHeight;
      if (canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas.width = newWidth;
        canvas.height = newHeight;
      }
      if (canvas.width > 0 && canvas.height > 0) {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    };
    
    if (parent) {
      resizeAndDrawBlack();
    }

    observerRef.current = new IntersectionObserver((entries) => {
      const entry = entries[0];
      const newVisibility = entry.isIntersecting;
      if (isVisible !== newVisibility) {
        setIsVisible(newVisibility);
      }

      if (newVisibility) {
        resizeAndDrawBlack(); 
      }
    }, { threshold: 0.01 }); 

    observerRef.current.observe(canvas);
    
    if (isVisible) {
      resizeAndDrawBlack();
    }

    const currentObserver = observerRef.current; 

    const resizeObserver = new ResizeObserver(() => {
      if (isVisible) {
        resizeAndDrawBlack();
      }
    });
    if (parent) {
      resizeObserver.observe(parent);
    }

    return () => {
      if (currentObserver) {
        currentObserver.disconnect();
      }
      if (parent) {
        resizeObserver.unobserve(parent);
      }
    };
  }, [isVisible]);

  return <canvas ref={canvasRef} className={cn("w-full h-full", className)} />;
};

export default TVStaticEffect; 