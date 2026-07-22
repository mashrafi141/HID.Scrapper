/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/*File name : FullScreenViewer.tsx*/

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ChevronLeft, ChevronRight, Unlock, Trash2 } from 'lucide-react';
import { VaultMedia } from '../types/vault';
import { VideoManager } from '../lib/videoManager';
import { ThumbnailManager } from '../lib/thumbnailManager';
import { ObjectUrlManager } from '../lib/objectUrlManager';
import ImageViewerLayer from './image/ImageViewerLayer';
import ReelNavigationLayer from './video/ReelNavigationLayer';

// Import newly decoupled sub-components
import VideoPlayer from './video/VideoPlayer';
import VideoControls from './video/VideoControls';
import GestureController from './video/GestureController';
import LoadingOverlay from './video/LoadingOverlay';
import BufferingOverlay from './video/BufferingOverlay';
import ReplayOverlay from './video/ReplayOverlay';
import SeekIndicator from './video/SeekIndicator';
import SpeedIndicator from './video/SpeedIndicator';
import ErrorOverlay from './video/ErrorOverlay';

interface FullScreenViewerProps {
  mediaList: VaultMedia[];
  initialIndex: number;
  onClose: () => void;
  onDeleteSelected?: (media: VaultMedia) => void;
}

export default function FullScreenViewer({
  mediaList,
  initialIndex,
  onClose,
  onDeleteSelected,
}: FullScreenViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Custom Video States
  const [videoStarted, setVideoStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isControlsLocked, setIsControlsLocked] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{ show: boolean; type: 'left' | 'right' }>({ show: false, type: 'left' });

  // Resume state
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);

  // Swipe Gesture HUD States
  const [brightness, setBrightness] = useState(1.0); // maps to overlay opacity
  const [gestureType, setGestureType] = useState<'none' | 'brightness' | 'volume' | 'seek'>('none');
  const [gestureValue, setGestureValue] = useState<string | number>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gestureCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Tracking states for swipe gesture mathematics
  const swipeStartRef = useRef({ volume: 0.8, brightness: 1.0, time: 0 });
  const swipeIsLeftHalfRef = useRef(false);
  const isLongPressingRef = useRef(false);
  const prevSpeedRef = useRef(1.0);

  const activeMedia = mediaList[index];

  // 1. Load the active file handle & handle URL generation
  useEffect(() => {
    let active = true;
    if (!activeMedia) return;

    // Reset Playback states
    setError(false);
    setIsPlaying(activeMedia.type === 'video');
    setCurrentTime(0);
    setDuration(0);
    setIsBuffering(false);
    setShowResumeToast(false);
    setResumeTime(null);
    setVideoStarted(false);
    setIsEnded(false);
    setBufferedEnd(0);
    
    // Playback speed safety reset
    isLongPressingRef.current = false;
    setPlaybackSpeed(1.0);
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = 1.0;
      } catch (err) {}
    }

    // Reset controls timer
    resetControlsTimer();

    // Optimize Loading State / First Frame Strategy
    const cachedUrl = ObjectUrlManager.get(activeMedia.path);
    const hasThumb = activeMedia.type === 'video' && !!ThumbnailManager.getThumbnailSync(activeMedia.path);

    if (cachedUrl) {
      setSrc(cachedUrl);
      setLoading(false);
    } else if (hasThumb) {
      // First frame strategy: bypass loading screen completely since we have a thumbnail to display immediately
      setSrc('placeholder-loading');
      setLoading(false);
    } else {
      setSrc(null);
      setLoading(true);
    }

    async function loadFile() {
      try {
        const objectUrl = await VideoManager.getVideoUrl(activeMedia);
        if (!active) return;
        setSrc(objectUrl);
        setLoading(false);
        checkResumeProgress();
      } catch (err) {
        console.error('Failed to load active media file:', err);
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    }

    loadFile();

    return () => {
      active = false;
    };
  }, [index, activeMedia]);

  // Preload nearby files in the background with adaptive pacing to completely prevent CPU/decoder starvation
  useEffect(() => {
    if (!mediaList || mediaList.length === 0) return;
    
    let timer: NodeJS.Timeout;
    
    if (activeMedia?.type === 'video') {
      // For videos, start adjacent preload only after playback is stable and active (isPlaying = true)
      if (isPlaying) {
        timer = setTimeout(() => {
          VideoManager.manageSlideWindowPreload(index, mediaList);
        }, 150); // Slight offset to allow playback thread to settle
      }
    } else {
      // For images, preload adjacent files almost immediately since there's zero media decoder contention
      timer = setTimeout(() => {
        VideoManager.manageSlideWindowPreload(index, mediaList);
      }, 100);
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [index, isPlaying, activeMedia, mediaList]);

  const checkResumeProgress = () => {
    if (activeMedia?.type !== 'video') return;
    const saved = VideoManager.getPlaybackPosition(activeMedia.path);
    if (saved > 5) {
      setResumeTime(saved);
      setShowResumeToast(true);
      // Hide resume toast automatically after 6 seconds
      setTimeout(() => setShowResumeToast(false), 6000);
    }
  };

  const handleApplyResume = () => {
    if (videoRef.current && resumeTime !== null) {
      videoRef.current.currentTime = resumeTime;
      setCurrentTime(resumeTime);
      setShowResumeToast(false);
      // Trigger play
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, isPlaying, isControlsLocked]);

  const handleNext = () => {
    if (isControlsLocked) return;
    if (index < mediaList.length - 1) {
      setIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (isControlsLocked) return;
    if (index > 0) {
      setIndex((prev) => prev - 1);
    }
  };

  const togglePlay = () => {
    if (isControlsLocked) return;
    if (activeMedia?.type !== 'video' || !videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((e) => console.error('Play request rejected:', e));
      }
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    if (isControlsLocked) return;
    if (!videoRef.current) return;
    const muted = !isMuted;
    setIsMuted(muted);
    videoRef.current.muted = muted;
    videoRef.current.volume = muted ? 0 : volume;
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
      setIsMuted(clamped === 0);
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef.current) {
      const clamped = Math.max(0, Math.min(duration, time));
      videoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      // Verification
      if (videoRef.current.playbackRate !== speed) {
        videoRef.current.playbackRate = speed;
      }
    }
    if (speed === 2.0) {
      console.log('[PlaybackRate] PlaybackRate -> 2');
    } else {
      console.log('[PlaybackRate] PlaybackRate -> 1');
    }
    setShowSpeedMenu(false);
    resetControlsTimer();
  };

  const formatTime = (timeInSeconds: number) => {
    if (isNaN(timeInSeconds)) return '0:00';
    const hours = Math.floor(timeInSeconds / 3600);
    const minutes = Math.floor((timeInSeconds % 3600) / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    
    const secStr = seconds < 10 ? `0${seconds}` : seconds;
    if (hours > 0) {
      const minStr = minutes < 10 ? `0${minutes}` : minutes;
      return `${hours}:${minStr}:${secStr}`;
    }
    return `${minutes}:${secStr}`;
  };

  // Auto-hide controls timer
  const resetControlsTimer = (forceShow = false) => {
    if (forceShow) {
      setShowControls(true);
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (showControls || forceShow) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying && activeMedia?.type === 'video' && !showSpeedMenu && !isControlsLocked) {
          setShowControls(false);
        }
      }, 2000);
    }
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, showSpeedMenu, isControlsLocked]);

  // Decoupled Gesture callbacks for GestureController
  const handleSingleTap = () => {
    setShowControls((prev) => {
      const nextState = !prev;
      if (nextState) {
        resetControlsTimer(true);
      }
      return nextState;
    });
  };

  const handleLongPressStart = () => {
    if (isControlsLocked || activeMedia?.type !== 'video' || !isPlaying) {
      console.log('[GestureController] Long press ignored (controls locked, not video, or paused)');
      return;
    }
    if (isLongPressingRef.current) return;
    isLongPressingRef.current = true;
    
    if (playbackSpeed !== 2.0) {
      prevSpeedRef.current = playbackSpeed;
    } else {
      prevSpeedRef.current = 1.0;
    }
    
    handleSpeedChange(2.0);

    // Speed indicator trigger
    setGestureType('seek');
    setGestureValue('2.0x Speed Boost');

    if ('vibrate' in navigator) navigator.vibrate(30);
  };

  const handleLongPressEnd = () => {
    if (!isLongPressingRef.current) return;
    isLongPressingRef.current = false;
    
    const targetSpeed = prevSpeedRef.current === 2.0 ? 1.0 : prevSpeedRef.current;
    handleSpeedChange(targetSpeed);
    setGestureType('none');
  };

  const handleSwipeStart = (clientX: number, clientY: number, isLeftHalf: boolean) => {
    if (isControlsLocked) return;
    if (gestureCloseTimeoutRef.current) clearTimeout(gestureCloseTimeoutRef.current);
    
    setGestureType('none');
    swipeIsLeftHalfRef.current = isLeftHalf;
    swipeStartRef.current = {
      volume,
      brightness,
      time: currentTime,
    };
  };

  const handleSwipeProgress = (deltaX: number, deltaY: number) => {
    if (isControlsLocked) return;

    let activeType = gestureType;

    // Resolve swipe direction constraint
    if (activeType === 'none') {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 20) {
        activeType = swipeIsLeftHalfRef.current ? 'brightness' : 'volume';
        setGestureType(activeType);
      } else if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 25 && activeMedia?.type === 'video') {
        activeType = 'seek';
        setGestureType(activeType);
      }
    }

    if (activeType === 'none') return;

    const screenWidth = containerRef.current?.getBoundingClientRect().width || 1080;
    const screenHeight = containerRef.current?.getBoundingClientRect().height || 1920;

    if (activeType === 'brightness') {
      const percentChange = -(deltaY / (screenHeight * 0.6));
      const newBrightness = Math.max(0.1, Math.min(1.0, swipeStartRef.current.brightness + percentChange));
      setBrightness(newBrightness);
      setGestureValue(`${Math.round(newBrightness * 100)}%`);
    } else if (activeType === 'volume') {
      const percentChange = -(deltaY / (screenHeight * 0.6));
      const newVol = Math.max(0, Math.min(1.0, swipeStartRef.current.volume + percentChange));
      handleVolumeChange(newVol);
      setGestureValue(`${Math.round(newVol * 100)}%`);
    } else if (activeType === 'seek') {
      const percentChange = deltaX / (screenWidth * 0.7);
      const secondsChange = percentChange * Math.min(180, duration || 120);
      const targetTime = Math.max(0, Math.min(duration, swipeStartRef.current.time + secondsChange));
      setGestureValue(`${secondsChange > 0 ? '+' : ''}${Math.round(secondsChange)}s (${formatTime(targetTime)})`);
      handleSeek(targetTime);
    }
  };

  const handleSwipeEnd = () => {
    if (gestureCloseTimeoutRef.current) clearTimeout(gestureCloseTimeoutRef.current);
    gestureCloseTimeoutRef.current = setTimeout(() => {
      setGestureType('none');
    }, 600);
    resetControlsTimer();
  };

  // Video Reel navigation early return
  if (activeMedia?.type === 'video') {
    return (
      <ReelNavigationLayer
        mediaList={mediaList}
        initialIndex={index}
        onClose={onClose}
        onDeleteSelected={onDeleteSelected}
      />
    );
  }

  // Image / GIF viewer early return for zero image coupling inside Video Viewer
  if (activeMedia?.type === 'image' || activeMedia?.type === 'gif') {
    if (loading) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black select-none">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <div className="h-10 w-10 rounded-full border-4 border-slate-800 border-t-indigo-500 animate-spin" />
            <p className="text-xs font-mono tracking-widest text-indigo-400 animate-pulse">
              LOADING FILE...
            </p>
          </div>
        </div>
      );
    }
    if (error || !src) {
      return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black select-none p-6">
          <div className="flex flex-col items-center gap-3 text-center p-6 bg-slate-950/85 border border-slate-900 rounded-2xl max-w-sm z-30">
            <Unlock className="h-10 w-10 text-rose-500" />
            <h4 className="text-base font-sans font-bold text-white">Error Loading Media</h4>
            <p className="text-xs font-sans text-slate-400 leading-relaxed">
              This file could not be read. The browser may lack storage permission.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
            >
              Back to Gallery
            </button>
          </div>
        </div>
      );
    }
    return (
      <ImageViewerLayer
        media={activeMedia}
        src={src}
        onClose={onClose}
        onNext={handleNext}
        onPrev={handlePrev}
        hasPrev={index > 0}
        hasNext={index < mediaList.length - 1}
        onDelete={onDeleteSelected ? () => onDeleteSelected(activeMedia) : undefined}
        indexInfo={`${index + 1} of ${mediaList.length}`}
      />
    );
  }

  return (
    <div
      ref={containerRef}
      id="fullscreen-viewer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black overflow-hidden select-none touch-none"
    >
      {/* 1. Brightness Overlay Mask */}
      <div 
        className="absolute inset-0 bg-black pointer-events-none z-40 transition-opacity duration-75" 
        style={{ opacity: 1 - brightness }} 
      />

      {/* 2. Desktop Navigation Arrows */}
      {index > 0 && showControls && !isControlsLocked && (
        <button
          id="btn-viewer-prev"
          onClick={(e) => { e.stopPropagation(); handlePrev(); }}
          className="absolute left-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950/60 border border-slate-800 text-white backdrop-blur-md hover:bg-indigo-500/10 hover:border-indigo-500/40 hover:text-indigo-400 transition-all cursor-pointer hidden md:flex"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {index < mediaList.length - 1 && showControls && !isControlsLocked && (
        <button
          id="btn-viewer-next"
          onClick={(e) => { e.stopPropagation(); handleNext(); }}
          className="absolute right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-950/60 border border-slate-800 text-white backdrop-blur-md hover:bg-indigo-500/10 hover:border-indigo-500/40 hover:text-indigo-400 transition-all cursor-pointer hidden md:flex"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* 3. Floating Lock State Overlay (when controls locked) */}
      {isControlsLocked && (
        <button
          onClick={() => {
            setIsControlsLocked(false);
            setShowControls(true);
            resetControlsTimer();
          }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-5 py-3 rounded-full bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
        >
          <Unlock className="h-4.5 w-4.5" />
          <span className="text-xs tracking-wider uppercase font-sans">Unlock Controls</span>
        </button>
      )}

      {/* 4. Swipe Gesture HUD & Double Tap Feedback overlays */}
      <SeekIndicator
        doubleTapFeedback={doubleTapFeedback}
        gestureType={gestureType}
        gestureValue={gestureValue}
      />

      {/* 5. Speed Indicator */}
      <SpeedIndicator
        isLongPressing={isLongPressingRef.current}
        playbackSpeed={playbackSpeed}
      />

      {/* 6. Floating Resume Playback Toast */}
      <AnimatePresence>
        {showResumeToast && showControls && resumeTime !== null && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-28 left-6 right-6 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-40 p-4 rounded-2xl bg-indigo-950/90 border border-indigo-500/30 text-white flex items-center justify-between gap-4 shadow-2xl backdrop-blur-md"
          >
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-indigo-400 font-sans tracking-widest">Resume watching?</span>
              <p className="text-xs text-slate-300 truncate">Previous position at {formatTime(resumeTime)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowResumeToast(false)}
                className="px-3 py-1.5 rounded-xl text-xs hover:bg-indigo-950 text-slate-400 font-semibold cursor-pointer"
              >
                Start Over
              </button>
              <button
                onClick={handleApplyResume}
                className="px-4 py-1.5 rounded-xl text-xs bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                Resume
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 7. Top Header HUD Bar */}
      <AnimatePresence>
        {showControls && !isControlsLocked && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/90 to-transparent p-5 backdrop-blur-xs select-none pointer-events-none"
          >
            <div className="flex items-center gap-3 min-w-0 pointer-events-auto">
              <button
                id="btn-viewer-close"
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950/50 border border-slate-850 text-slate-300 hover:text-white hover:bg-slate-900/80 transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 select-none">
                <h4 className="truncate text-sm font-sans font-semibold text-white">
                  {activeMedia.name}
                </h4>
                <p className="text-[10px] font-mono text-slate-400">
                  {index + 1} of {mediaList.length} • {activeMedia.extension.toUpperCase()}
                </p>
              </div>
            </div>

            {/* Viewer Options */}
            <div className="flex items-center gap-2 pointer-events-auto">
              {activeMedia.type === 'video' && (
                <button
                  onClick={() => setIsControlsLocked(true)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950/50 border border-slate-850 text-slate-300 hover:text-white hover:bg-slate-900/80 transition-all cursor-pointer"
                  title="Lock gestures"
                >
                  <Unlock className="h-4.5 w-4.5" />
                </button>
              )}
              {onDeleteSelected && (
                <button
                  id="btn-viewer-delete"
                  onClick={() => onDeleteSelected(activeMedia)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950/50 border border-rose-950/40 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-all cursor-pointer"
                  title="Delete media from vault"
                >
                  <Trash2 className="h-4.5 w-4.5 text-rose-400" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 8. Active Buffering Progress Spinner */}
      <BufferingOverlay isBuffering={isBuffering} />

      {/* 9. Gesture Controller Layer & Dynamic Video Render container */}
      <GestureController
        onSingleTap={handleSingleTap}
        onLongPressStart={handleLongPressStart}
        onLongPressEnd={handleLongPressEnd}
        onSwipeStart={handleSwipeStart}
        onSwipeProgress={handleSwipeProgress}
        onSwipeEnd={handleSwipeEnd}
        onHorizontalPageSwipe={(dir) => {
          if (dir === 'left') handlePrev();
          else handleNext();
        }}
        isLocked={isControlsLocked}
        className="h-full w-full flex items-center justify-center relative z-10 touch-none select-none"
      >
        {/* Startup Loading Screen (blurred thumbnail backdrop & glassmorphism) */}
        <LoadingOverlay loading={loading} activeMedia={activeMedia} />
        
        {/* Playback Error Overlay */}
        <ErrorOverlay error={error} onClose={onClose} />

        {/* Dynamic Media Renderer */}
        {src && !loading && !error && (
          <motion.div
            key={index}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 28, stiffness: 200 }}
            className="max-h-full max-w-full flex items-center justify-center relative w-full h-full"
          >
            <div className="relative max-h-screen max-w-full flex items-center justify-center w-full h-full">
              {src !== 'placeholder-loading' && (
                <VideoPlayer
                  key={activeMedia.path}
                  media={activeMedia}
                  src={src}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  currentTime={currentTime}
                  setCurrentTime={setCurrentTime}
                  duration={duration}
                  setDuration={setDuration}
                  volume={volume}
                  isMuted={isMuted}
                  setIsMuted={setIsMuted}
                  playbackSpeed={playbackSpeed}
                  setIsBuffering={setIsBuffering}
                  onFirstFrameDecoded={() => setVideoStarted(true)}
                  videoRef={videoRef}
                  setBufferedEnd={setBufferedEnd}
                  setIsEnded={setIsEnded}
                />
              )}

              {/* FIRST FRAME STRATEGY: Instant sharp thumbnail overlay while video loads/starts */}
              {!videoStarted && ThumbnailManager.getThumbnailSync(activeMedia.path)?.thumbnailUrl && (
                <img
                  src={ThumbnailManager.getThumbnailSync(activeMedia.path)!.thumbnailUrl}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-contain z-20 pointer-events-none transition-opacity duration-300"
                  alt=""
                />
              )}

              {/* Replay Overlay */}
              <ReplayOverlay
                isEnded={isEnded}
                onReplay={() => {
                  setIsEnded(false);
                  if (videoRef.current) {
                    videoRef.current.currentTime = 0;
                    const playPromise = videoRef.current.play();
                    if (playPromise !== undefined) {
                      playPromise.then(() => setIsPlaying(true)).catch(() => {});
                    }
                  }
                }}
              />
            </div>
          </motion.div>
        )}
      </GestureController>

      {/* 10. Decoupled Video Controls Layer HUD */}
      <VideoControls
        showControls={showControls && !loading && !error && !isControlsLocked}
        activeMedia={activeMedia}
        currentTime={currentTime}
        duration={duration}
        bufferedEnd={bufferedEnd}
        isPlaying={isPlaying}
        volume={volume}
        isMuted={isMuted}
        playbackSpeed={playbackSpeed}
        showSpeedMenu={showSpeedMenu}
        setShowSpeedMenu={setShowSpeedMenu}
        togglePlay={togglePlay}
        toggleMute={toggleMute}
        handleVolumeChange={handleVolumeChange}
        handleSeek={handleSeek}
        handleSpeedChange={handleSpeedChange}
        handlePrev={handlePrev}
        handleNext={handleNext}
        hasPrev={index > 0}
        hasNext={index < mediaList.length - 1}
        formatTime={formatTime}
      />
    </div>
  );
}
