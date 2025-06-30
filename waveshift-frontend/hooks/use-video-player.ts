import { useState, useRef, useEffect, RefObject } from 'react';

interface UseVideoPlayerProps {
  videoRef: RefObject<HTMLVideoElement>;
  onVideoEnd?: () => void;
}

export function useVideoPlayer({ videoRef, onVideoEnd }: UseVideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const togglePlayback = () => {
    if (videoRef.current) {
      if (videoRef.current.paused || videoRef.current.ended) {
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(error => console.error("Error playing video:", error));
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  const jumpToTime = (timeString: string) => {
    if (videoRef.current) {
      const parts = timeString.split(':').map(Number);
      let totalSeconds = 0;
      if (parts.length === 3) { // HH:MM:SS
        totalSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      } else if (parts.length === 2) { // MM:SS
        totalSeconds = parts[0] * 60 + parts[1];
      } else {
        console.error("Invalid time string format:", timeString);
        return;
      }
      videoRef.current.currentTime = totalSeconds;
      if (videoRef.current.paused) {
        // Consider if auto-play after jump is always desired.
        // If the video was intentionally paused, this will resume it.
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch(error => console.error("Error playing video after jump:", error));
      }
    }
  };
  
  // Effect for handling video ended event
  useEffect(() => {
    const videoElement = videoRef.current;
    const handleVideoEnd = () => {
      setIsPlaying(false);
      if (onVideoEnd) {
        onVideoEnd();
      }
    };

    if (videoElement) {
      videoElement.addEventListener('ended', handleVideoEnd);
      // Также обновлять состояние isPlaying, если видео было поставлено на паузу извне
      const handlePause = () => setIsPlaying(false);
      videoElement.addEventListener('pause', handlePause);
       const handlePlay = () => setIsPlaying(true);
      videoElement.addEventListener('play', handlePlay);

      // Clean up listeners
      return () => {
        videoElement.removeEventListener('ended', handleVideoEnd);
        videoElement.removeEventListener('pause', handlePause);
        videoElement.removeEventListener('play', handlePlay);
      };
    }
  }, [videoRef, onVideoEnd]);

  return {
    isPlaying,
    setIsPlaying, // Expose for external control if needed, e.g., when resetting everything
    togglePlayback,
    jumpToTime,
  };
} 