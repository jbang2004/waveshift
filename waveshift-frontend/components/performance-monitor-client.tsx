'use client';

import { useEffect } from 'react';

export function PerformanceMonitorClient() {
  useEffect(() => {
    // 只在开发环境启用性能监控
    if (process.env.NODE_ENV !== 'development') return;
    
    if (typeof window !== 'undefined' && window.performance) {
      const measurePageLoad = () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            const totalTime = navigation.loadEventEnd - navigation.fetchStart;
            const domTime = navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart;
            
            console.log('📈 页面性能:');
            console.log(`  🚀 总加载: ${totalTime.toFixed(0)}ms`);
            console.log(`  🎯 DOM就绪: ${domTime.toFixed(0)}ms`);
          }
        }, 1000);
      };

      if (document.readyState === 'complete') {
        measurePageLoad();
      } else {
        window.addEventListener('load', measurePageLoad);
        return () => window.removeEventListener('load', measurePageLoad);
      }
    }
  }, []);

  return null;
} 