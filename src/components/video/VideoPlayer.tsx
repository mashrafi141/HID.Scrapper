/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { VaultMedia } from '../../types/vault';
import { VideoManager } from '../../lib/videoManager';

export interface VideoPlayerProps {
  media: VaultMedia;
  src: string;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  currentTime: number;
  setCurrentTime: (time: number) => void;
  duration: number;
  setDuration: (duration: number) => void;
  volume: number;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  playbackSpeed: number;
  setIsBuffering: (buffering: boolean) => void;
  onFirstFrameDecoded: () => void;
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  setBufferedEnd: (end: number) => void;
  setIsEnded: (ended: boolean) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  media,
  src,
  isPlaying,
  setIsPlaying,
  currentTime,
  setCurrentTime,
  duration,
  setDuration,
  volume,
  isMuted,
  setIsMuted,
  playbackSpeed,
  setIsBuffering,
  onFirstFrameDecoded,
  videoRef,
  setBufferedEnd,
  setIsEnded,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<{ [key: string]: EventListener }>({});

  useEffect(() => {
    if (!containerRef.current || !src) return;

    // Create a completely NEW HTMLVideoElement on every mount
    const video = document.createElement('video');
    videoRef.current = video;

    // Attributes optimized for mobile, Android Chrome, and WebViews
    video.src = src;
    video.preload = 'auto';
    video.playsInline = true;
    video.muted = isMuted;
    video.volume = isMuted ? 0 : volume;
    video.playbackRate = playbackSpeed;
    video.className = "max-h-screen max-w-full object-contain pointer-events-none w-full h-full";

    containerRef.current.appendChild(video);

    let frameDecoded = false;
    let frameCallbackId: number | null = null;

    const handleFirstFrame = () => {
      if (frameDecoded) return;
      frameDecoded = true;
      onFirstFrameDecoded();
    };

    // First Frame Strategy: requestVideoFrameCallback or loadeddata fallback
    if ('requestVideoFrameCallback' in video) {
      const checkFrame = () => {
        handleFirstFrame();
      };
      frameCallbackId = (video as any).requestVideoFrameCallback(checkFrame);
    }

    const updateBuffered = () => {
      if (video.buffered && video.buffered.length > 0) {
        const buffered = video.buffered;
        let end = 0;
        for (let i = 0; i < buffered.length; i++) {
          if (video.currentTime >= buffered.start(i) && video.currentTime <= buffered.end(i)) {
            end = buffered.end(i);
            break;
          }
        }
        if (end === 0 && buffered.length > 0) {
          end = buffered.end(0);
        }
        setBufferedEnd(end);
      }
    };

    const events: { [key: string]: EventListener } = {
      loadedmetadata: () => {
        setDuration(video.duration || 0);
      },
      loadeddata: () => {
        if (!frameDecoded) {
          handleFirstFrame();
        }
      },
      canplay: () => {
        setIsBuffering(false);
      },
      canplaythrough: () => {
        setIsBuffering(false);
      },
      playing: () => {
        setIsBuffering(false);
        setIsPlaying(true);
        setIsEnded(false);
      },
      waiting: () => {
        setIsBuffering(true);
      },
      stalled: () => {
        setIsBuffering(true);
      },
      suspend: () => {},
      abort: () => {},
      emptied: () => {},
      ended: () => {
        setIsPlaying(false);
        setIsEnded(true);
        VideoManager.setPlaybackPosition(media.path, 0);
      },
      error: (e) => {
        console.error("Video error:", e);
        setIsBuffering(false);
      },
      timeupdate: () => {
        setCurrentTime(video.currentTime);
        VideoManager.setPlaybackPosition(media.path, video.currentTime);
        updateBuffered();
      },
      progress: () => {
        updateBuffered();
      }
    };

    // Register all event listeners
    Object.entries(events).forEach(([eventName, listener]) => {
      video.addEventListener(eventName, listener as any);
    });
    listenersRef.current = events;

    video.load();

    const savedPos = VideoManager.getPlaybackPosition(media.path);
    if (savedPos > 0) {
      video.currentTime = savedPos;
    }

    // Direct playback attempt with browser policy fallback
    if (isPlaying) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          video.muted = true;
          setIsMuted(true);
          video.play().catch((err2) => {
            console.error("Autoplay failed completely:", err2);
            setIsPlaying(false);
          });
        });
      }
    }

    // Cleanup and Decoder Releasing
    return () => {
      if (frameCallbackId !== null && 'cancelVideoFrameCallback' in video) {
        (video as any).cancelVideoFrameCallback(frameCallbackId);
      }

      try {
        video.pause();
      } catch (e) {}

      const currentListeners = listenersRef.current;
      Object.entries(currentListeners).forEach(([eventName, listener]) => {
        video.removeEventListener(eventName, listener as any);
      });
      listenersRef.current = {};

      try {
        video.removeAttribute('src');
        video.load(); // Forces immediate release of the hardware decoder
      } catch (e) {}

      try {
        video.remove();
      } catch (e) {}

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      videoRef.current = null;
    };
  }, [src]);

  // Sync props to native video element dynamically
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = isMuted ? 0 : volume;
    video.muted = isMuted;
  }, [volume, isMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  return (
    <div 
      ref={containerRef} 
      className="max-h-screen max-w-full flex items-center justify-center w-full h-full" 
    />
  );
};

export default VideoPlayer;
