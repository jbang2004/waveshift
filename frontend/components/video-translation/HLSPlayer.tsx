import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface HLSPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  controls?: boolean;
  muted?: boolean;
}

export default function HLSPlayer({ 
  src, 
  className = "", 
  autoPlay = false, 
  controls = true, 
  muted = false 
}: HLSPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // 清理之前的HLS实例
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      // 优化HLS配置以解决缓冲停滞问题
      const hls = new Hls({
        // 播放列表加载配置
        manifestLoadingTimeOut: 10000,
        manifestLoadingMaxRetry: 3,
        manifestLoadingRetryDelay: 500,
        
        // 缓冲配置 - 关键优化
        maxBufferLength: 60, // 最大缓冲长度（秒）
        maxMaxBufferLength: 120, // 最大允许缓冲长度（秒）
        maxBufferSize: 60 * 1000 * 1000, // 最大缓冲大小（字节）
        maxBufferHole: 0.5, // 最大缓冲空洞（秒）
        
        // 片段加载配置
        fragLoadingTimeOut: 20000, // 片段加载超时
        fragLoadingMaxRetry: 6, // 片段加载最大重试次数
        fragLoadingRetryDelay: 1000, // 片段加载重试延迟
        
        // 启用渐进式增强
        progressive: true,
        enableWorker: true,
      });

      hlsRef.current = hls;

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (process.env.NODE_ENV === 'development') {
          console.log('HLS manifest parsed, ready to play');
        }
        if (autoPlay) {
          video.play().catch(console.error);
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        
        // 处理非致命错误
        if (!data.fatal) {
          // 特别处理缓冲停滞错误
          if (data.details === 'bufferStalledError') {
            if (process.env.NODE_ENV === 'development') {
              console.log('Buffer stalled error detected, attempting recovery...');
            }
            // 尝试跳过小的时间间隔来恢复播放
            const currentTime = video.currentTime;
            if (currentTime > 0) {
              video.currentTime = currentTime + 0.1;
            }
          }
          return;
        }
        
        // 处理致命错误
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (process.env.NODE_ENV === 'development') {
                console.log('Network error, trying to recover...');
              }
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              if (process.env.NODE_ENV === 'development') {
                console.log('Media error, trying to recover...');
              }
              hls.recoverMediaError();
              break;
            default:
              if (process.env.NODE_ENV === 'development') {
                console.log('Fatal error, destroying HLS instance');
              }
              hls.destroy();
              break;
          }
        }
      });

      // 监听缓冲事件
      hls.on(Hls.Events.BUFFER_APPENDED, (event, data) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Buffer appended:', data);
        }
      });

      hls.on(Hls.Events.BUFFER_EOS, (event, data) => {
        if (process.env.NODE_ENV === 'development') {
          console.log('Buffer end of stream:', data);
        }
      });

      // 处理视频卡住的情况
      let stallTimer: NodeJS.Timeout | null = null;
      let lastTime = 0;
      
      const handleTimeUpdate = () => {
        const currentTime = video.currentTime;
        
        // 如果时间没有变化且不是暂停状态，可能卡住了
        if (Math.abs(currentTime - lastTime) < 0.1 && !video.paused && !video.ended) {
          if (!stallTimer) {
            stallTimer = setTimeout(() => {
              if (process.env.NODE_ENV === 'development') {
                console.log('Video appears to be stalled, attempting recovery...');
              }
              // 尝试微调播放位置
              video.currentTime = currentTime + 0.1;
              stallTimer = null;
            }, 2000); // 2秒后尝试恢复
          }
        } else {
          if (stallTimer) {
            clearTimeout(stallTimer);
            stallTimer = null;
          }
          lastTime = currentTime;
        }
      };

      video.addEventListener('timeupdate', handleTimeUpdate);

      // 清理函数
      return () => {
        video.removeEventListener('timeupdate', handleTimeUpdate);
        if (stallTimer) {
          clearTimeout(stallTimer);
        }
      };

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // 原生支持HLS (Safari)
      video.src = src;
      if (autoPlay) {
        video.play().catch(console.error);
      }
    } else {
      console.error('HLS is not supported in this browser');
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, autoPlay]);

  return (
    <video
      ref={videoRef}
      className={className}
      controls={controls}
      muted={muted}
      playsInline
      style={{ width: '100%', height: '100%' }}
    >
      您的浏览器不支持视频播放。
    </video>
  );
} 