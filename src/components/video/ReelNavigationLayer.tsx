/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, AnimatePresence } from 'motion/react';
import { X, Unlock, Trash2 } from 'lucide-react';
import { VaultMedia } from '../../types/vault';

// Import newly decoupled sub-components and engines
import ReelStackManager from './reel/ReelStackManager';
import { ReelAnimationController } from './reel/ReelAnimationController';
import { useReelPlayback } from './reel/ReelPlaybackCoordinator';
import { ReelPreloadManager } from './reel/ReelPreloadManager';
import { ReelMemoryManager } from './reel/ReelMemoryManager';

import VideoControls from './VideoControls';
import BufferingOverlay from './BufferingOverlay';
import SeekIndicator from './SeekIndicator';
import SpeedIndicator from './SpeedIndicator';

interface ReelNavigationLayerProps {
  mediaList: VaultMedia[];
  initialIndex: number;
  onClose: () => void;
  onDeleteSelected?: (media: VaultMedia) => void;
}

export default function ReelNavigationLayer({
  mediaList,
  initialIndex,
  onClose,
  onDeleteSelected,
}: ReelNavigationLayerProps) {
  // Filter mediaList to only contain videos for the Reel Navigation Layer
  const videoList = React.useMemo(() => {
    return mediaList.filter((m) => m.type === 'video');
  }, [mediaList]);

  // Find the initial index inside the video list
  const initialVideoIndex = React.useMemo(() => {
    const selectedMedia = mediaList[initialIndex];
    if (!selectedMedia) return 0;
    const foundIdx = videoList.findIndex((m) => m.path === selectedMedia.path);
    return foundIdx !== -1 ? foundIdx : 0;
  }, [mediaList, initialIndex, videoList]);

  const [currentIndex, setCurrentIndex] = useState(initialVideoIndex);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // UI / Controls states
  const [showControls, setShowControls] = useState(true);
  const [isControlsLocked, setIsControlsLocked] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  // Gesture feedback / layout refs
  const [brightness, setBrightness] = useState(1.0);
  const [gestureType, setGestureType] = useState<'none' | 'brightness' | 'volume' | 'seek'>('none');
  const [gestureValue, setGestureValue] = useState<string | number>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeMedia = videoList[currentIndex];
  const activeSrc = activeMedia ? urls[activeMedia.path] : null;

  // Frame animation motion value
  const y = useMotionValue(0);

  // Helper to schedule controls auto-hide
  const resetControlsTimer = (forceShow = false) => {
    if (forceShow) {
      setShowControls(true);
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (showControls || forceShow) {
      controlsTimeoutRef.current = setTimeout(() => {
        if (isPlaying && !showSpeedMenu && !isControlsLocked) {
          setShowControls(false);
        }
      }, 2000);
    }
  };

  // Instantiate our playback coordinator hook
  const {
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
    isBuffering,
    setIsBuffering,
    isEnded,
    setIsEnded,
    bufferedEnd,
    setBufferedEnd,
    videoStarted,
    setVideoStarted,
    error,
    setError,
    loading,
    setLoading,
    doubleTapFeedback,
    setDoubleTapFeedback,
    resumeTime,
    showResumeToast,
    setShowResumeToast,
    currentVideoRef,
    prevVideoRef,
    nextVideoRef,
    togglePlay,
    toggleMute,
    handleVolumeChange,
    handleSeek,
    handleSpeedChange,
    handleApplyResume,
  } = useReelPlayback({
    currentIndex,
    activeMedia,
    activeSrc,
    isControlsLocked,
    resetControlsTimer,
  });

  const isLongPressingRef = useRef(false);
  const prevSpeedRef = useRef(1.0);

  // Auto-hide timer hook
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying, showSpeedMenu, isControlsLocked]);

  // 1. Sliding Window Preloader effect
  useEffect(() => {
    ReelPreloadManager.prepareSlideWindow(currentIndex, videoList, (path, url) => {
      setUrls((prev) => {
        if (prev[path] === url) return prev;
        return { ...prev, [path]: url };
      });
    });

    // Run memory eviction to dump URLs that are out of sliding window
    ReelMemoryManager.cleanupSlideWindowUrls(currentIndex, videoList, urls, setUrls);
  }, [currentIndex, videoList]);

  // 2. Navigation slide callbacks called by Gesture Engine or keyboard navigation
  const handleNextVideo = () => {
    if (isControlsLocked) return;
    if (currentIndex < videoList.length - 1) {
      const H = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
      ReelAnimationController.animateTo(y, -H, () => {
        setCurrentIndex((prev) => prev + 1);
        y.set(0);
      });
    }
  };

  const handlePrevVideo = () => {
    if (isControlsLocked) return;
    if (currentIndex > 0) {
      const H = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
      ReelAnimationController.animateTo(y, H, () => {
        setCurrentIndex((prev) => prev - 1);
        y.set(0);
      });
    }
  };

  const handleCancelNavigation = () => {
    ReelAnimationController.animateTo(y, 0);
  };

  // Vertical drag progress & end callbacks for GestureController
  const handleVerticalDragProgress = (deltaY: number) => {
    if (isControlsLocked) return;
    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < videoList.length - 1;

    let adjustedDeltaY = deltaY;
    if (!hasPrev && deltaY > 0) {
      adjustedDeltaY = deltaY * 0.35;
    } else if (!hasNext && deltaY < 0) {
      adjustedDeltaY = deltaY * 0.35;
    }
    y.set(adjustedDeltaY);
  };

  const handleVerticalDragEnd = (deltaY: number, velocityY: number) => {
    if (isControlsLocked) return;
    const H = containerRef.current?.getBoundingClientRect().height || window.innerHeight;
    const thresholdDist = H / 5;
    const thresholdVel = 0.45;

    const hasPrev = currentIndex > 0;
    const hasNext = currentIndex < videoList.length - 1;

    if (deltaY < -thresholdDist || velocityY < -thresholdVel) {
      if (hasNext) {
        handleNextVideo();
      } else {
        handleCancelNavigation();
      }
    } else if (deltaY > thresholdDist || velocityY > thresholdVel) {
      if (hasPrev) {
        handlePrevVideo();
      } else {
        handleCancelNavigation();
      }
    } else {
      handleCancelNavigation();
    }
  };

  // Keyboard navigation controller
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextVideo();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevVideo();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, isPlaying, isControlsLocked, videoList]);

  // Decoupled single and double-tap interactions
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
    if (isControlsLocked || !isPlaying) {
      console.log('[GestureController] Long press ignored (controls locked or paused)');
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

  // Active resource cleanup on complete unmount and safety resets
  useEffect(() => {
    isLongPressingRef.current = false;
    handleSpeedChange(1.0);
    
    return () => {
      isLongPressingRef.current = false;
      const refsToClear = { current: controlsTimeoutRef.current };
      ReelMemoryManager.clearAllTimeouts([
        refsToClear as React.MutableRefObject<NodeJS.Timeout | null>
      ]);
    };
  }, []);

  // Reset playback speed safety when switching reel videos
  useEffect(() => {
    isLongPressingRef.current = false;
    handleSpeedChange(1.0);
  }, [currentIndex]);

  if (videoList.length === 0) {
    return null;
  }

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

  return (
    <div
      ref={containerRef}
      id="reel-navigation-layer"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black overflow-hidden select-none touch-none w-full h-full"
    >
      {/* 1. Brightness overlay mask */}
      <div
        className="absolute inset-0 bg-black pointer-events-none z-40 transition-opacity duration-75"
        style={{ opacity: 1 - brightness }}
      />

      {/* 2. Lock Overlay Toggle HUD */}
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

      {/* 3. Double Tap / Seek overlays */}
      <SeekIndicator
        doubleTapFeedback={doubleTapFeedback}
        gestureType={gestureType}
        gestureValue={gestureValue}
      />

      {/* 4. Speed multiplier indicator */}
      <SpeedIndicator
        isLongPressing={isLongPressingRef.current}
        playbackSpeed={playbackSpeed}
      />

      {/* 5. Floating Resume Watching Toast */}
      <AnimatePresence>
        {showResumeToast && showControls && resumeTime !== null && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="absolute bottom-28 left-6 right-6 md:left-1/2 md:-translate-x-1/2 md:max-w-md z-40 p-4 rounded-2xl bg-indigo-950/90 border border-indigo-500/30 text-white flex items-center justify-between gap-4 shadow-2xl backdrop-blur-md"
          >
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-bold text-indigo-400 font-sans tracking-widest">
                Resume watching?
              </span>
              <p className="text-xs text-slate-300 truncate">
                Previous position at {formatTime(resumeTime)}
              </p>
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

      {/* 6. Top HUD Title/Close Bar */}
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
                  {currentIndex + 1} of {videoList.length} • {activeMedia.extension.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 pointer-events-auto">
              <button
                onClick={() => setIsControlsLocked(true)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950/50 border border-slate-850 text-slate-300 hover:text-white hover:bg-slate-900/80 transition-all cursor-pointer"
                title="Lock gestures"
              >
                <Unlock className="h-4.5 w-4.5" />
              </button>
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

      {/* 7. Active Buffering Progress Spinner */}
      <BufferingOverlay isBuffering={isBuffering} />

      {/* 8. Vertical Sliding Window Layer */}
      <motion.div
        className="absolute inset-0 w-full h-full"
        style={{ y }}
      >
        <ReelStackManager
          currentIndex={currentIndex}
          videoList={videoList}
          urls={urls}
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
          isBuffering={isBuffering}
          setIsBuffering={setIsBuffering}
          bufferedEnd={bufferedEnd}
          setBufferedEnd={setBufferedEnd}
          isEnded={isEnded}
          setIsEnded={setIsEnded}
          loading={loading}
          error={error}
          videoStarted={videoStarted}
          setVideoStarted={setVideoStarted}
          onClose={onClose}
          currentVideoRef={currentVideoRef}
          prevVideoRef={prevVideoRef}
          nextVideoRef={nextVideoRef}
          handleSingleTap={handleSingleTap}
          handleLongPressStart={handleLongPressStart}
          handleLongPressEnd={handleLongPressEnd}
          handleVerticalDragProgress={handleVerticalDragProgress}
          handleVerticalDragEnd={handleVerticalDragEnd}
          isControlsLocked={isControlsLocked}
        />
      </motion.div>

      {/* 9. Video Controls Overlay */}
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
        handlePrev={handlePrevVideo}
        handleNext={handleNextVideo}
        hasPrev={false} // Disable previous HUD button
        hasNext={false} // Disable next HUD button
        formatTime={formatTime}
      />
    </div>
  );
}
