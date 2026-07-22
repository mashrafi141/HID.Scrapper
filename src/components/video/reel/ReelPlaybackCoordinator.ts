/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { VaultMedia } from '../../../types/vault';
import { VideoManager } from '../../../lib/videoManager';

interface UseReelPlaybackProps {
  currentIndex: number;
  activeMedia: VaultMedia | undefined;
  activeSrc: string | null;
  isControlsLocked: boolean;
  resetControlsTimer: (forceShow?: boolean) => void;
}

export function useReelPlayback({
  currentIndex,
  activeMedia,
  activeSrc,
  isControlsLocked,
  resetControlsTimer,
}: UseReelPlaybackProps) {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [videoStarted, setVideoStarted] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const [doubleTapFeedback, setDoubleTapFeedback] = useState<{ show: boolean; type: 'left' | 'right' }>({
    show: false,
    type: 'left',
  });

  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResumeToast, setShowResumeToast] = useState(false);

  const currentVideoRef = useRef<HTMLVideoElement | null>(null);
  const prevVideoRef = useRef<HTMLVideoElement | null>(null);
  const nextVideoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Reset states when active video changes
  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setVideoStarted(false);
    setIsEnded(false);
    setIsBuffering(false);
    setBufferedEnd(0);
    setIsPlaying(true); // Autoplay the active reel
    setError(false);
    setLoading(!activeSrc);

    if (activeMedia) {
      const saved = VideoManager.getPlaybackPosition(activeMedia.path);
      if (saved > 5) {
        setResumeTime(saved);
        setShowResumeToast(true);
        const timer = setTimeout(() => setShowResumeToast(false), 6000);
        return () => clearTimeout(timer);
      } else {
        setResumeTime(null);
        setShowResumeToast(false);
      }
    }
  }, [currentIndex, activeMedia, activeSrc]);

  // 2. Play/Pause controller
  const togglePlay = () => {
    if (isControlsLocked) return;
    if (!currentVideoRef.current) return;
    if (isPlaying) {
      currentVideoRef.current.pause();
      setIsPlaying(false);
    } else {
      const playPromise = currentVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => setIsPlaying(true))
          .catch((e) => console.error('[ReelPlaybackCoordinator] Play failed:', e));
      }
    }
    resetControlsTimer();
  };

  const toggleMute = () => {
    if (isControlsLocked) return;
    if (!currentVideoRef.current) return;
    const muted = !isMuted;
    setIsMuted(muted);
    currentVideoRef.current.muted = muted;
    currentVideoRef.current.volume = muted ? 0 : volume;
  };

  const handleVolumeChange = (newVol: number) => {
    const clamped = Math.max(0, Math.min(1, newVol));
    setVolume(clamped);
    if (currentVideoRef.current) {
      currentVideoRef.current.volume = clamped;
      currentVideoRef.current.muted = clamped === 0;
      setIsMuted(clamped === 0);
    }
  };

  const handleSeek = (time: number) => {
    if (currentVideoRef.current) {
      const clamped = Math.max(0, Math.min(duration, time));
      currentVideoRef.current.currentTime = clamped;
      setCurrentTime(clamped);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (currentVideoRef.current) {
      currentVideoRef.current.playbackRate = speed;
      // Verification
      if (currentVideoRef.current.playbackRate !== speed) {
        currentVideoRef.current.playbackRate = speed;
      }
    }
    if (speed === 2.0) {
      console.log('[PlaybackRate] PlaybackRate -> 2');
    } else {
      console.log('[PlaybackRate] PlaybackRate -> 1');
    }
    resetControlsTimer();
  };

  const handleApplyResume = () => {
    if (currentVideoRef.current && resumeTime !== null) {
      currentVideoRef.current.currentTime = resumeTime;
      setCurrentTime(resumeTime);
      setShowResumeToast(false);
      const playPromise = currentVideoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.then(() => setIsPlaying(true)).catch(() => {});
      }
    }
  };

  return {
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
  };
}
