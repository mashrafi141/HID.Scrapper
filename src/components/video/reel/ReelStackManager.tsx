/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VaultMedia } from '../../../types/vault';
import VideoPlayer from '../VideoPlayer';
import GestureController from '../GestureController';
import LoadingOverlay from '../LoadingOverlay';
import ErrorOverlay from '../ErrorOverlay';
import ReplayOverlay from '../ReplayOverlay';
import { ThumbnailManager } from '../../../lib/thumbnailManager';

interface ReelStackManagerProps {
  currentIndex: number;
  videoList: VaultMedia[];
  urls: Record<string, string>;

  // Playback States
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
  isBuffering: boolean;
  setIsBuffering: (buffering: boolean) => void;
  bufferedEnd: number;
  setBufferedEnd: (buffered: number) => void;
  isEnded: boolean;
  setIsEnded: (ended: boolean) => void;

  // Status & Flags
  loading: boolean;
  error: boolean;
  videoStarted: boolean;
  setVideoStarted: (started: boolean) => void;
  onClose: () => void;

  // Refs
  currentVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  prevVideoRef: React.MutableRefObject<HTMLVideoElement | null>;
  nextVideoRef: React.MutableRefObject<HTMLVideoElement | null>;

  // Interaction handlers
  handleSingleTap: () => void;
  handleLongPressStart: () => void;
  handleLongPressEnd: () => void;
  handleVerticalDragProgress?: (deltaY: number) => void;
  handleVerticalDragEnd?: (deltaY: number, velocityY: number) => void;
  isControlsLocked: boolean;
}

export default function ReelStackManager({
  currentIndex,
  videoList,
  urls,
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
  bufferedEnd,
  setBufferedEnd,
  isEnded,
  setIsEnded,
  loading,
  error,
  videoStarted,
  setVideoStarted,
  onClose,
  currentVideoRef,
  prevVideoRef,
  nextVideoRef,
  handleSingleTap,
  handleLongPressStart,
  handleLongPressEnd,
  handleVerticalDragProgress,
  handleVerticalDragEnd,
  isControlsLocked,
}: ReelStackManagerProps) {
  const prevIndex = currentIndex - 1;
  const nextIndex = currentIndex + 1;

  const activeMedia = videoList[currentIndex];
  const activeSrc = activeMedia ? urls[activeMedia.path] : null;

  return (
    <>
      {/* Previous Video Player */}
      {prevIndex >= 0 && urls[videoList[prevIndex].path] && (
        <div
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'translateY(-100%)' }}
        >
          <VideoPlayer
            key={videoList[prevIndex].path}
            media={videoList[prevIndex]}
            src={urls[videoList[prevIndex].path]}
            isPlaying={false}
            setIsPlaying={() => {}}
            currentTime={0}
            setCurrentTime={() => {}}
            duration={0}
            setDuration={() => {}}
            volume={0}
            isMuted={true}
            setIsMuted={() => {}}
            playbackSpeed={1.0}
            setIsBuffering={() => {}}
            onFirstFrameDecoded={() => {}}
            videoRef={prevVideoRef}
            setBufferedEnd={() => {}}
            setIsEnded={() => {}}
          />
        </div>
      )}

      {/* Current Interactive Video Player Wrapper */}
      <div className="absolute inset-0 w-full h-full">
        <GestureController
          onSingleTap={handleSingleTap}
          onLongPressStart={handleLongPressStart}
          onLongPressEnd={handleLongPressEnd}
          onVerticalDragProgress={handleVerticalDragProgress}
          onVerticalDragEnd={handleVerticalDragEnd}
          onSwipeStart={() => {}}
          onSwipeProgress={() => {}}
          onSwipeEnd={() => {}}
          onHorizontalPageSwipe={() => {}}
          isLocked={isControlsLocked}
          className="h-full w-full flex items-center justify-center relative z-10 touch-none select-none"
        >
          {/* Startup Loading Screen */}
          <LoadingOverlay loading={loading} activeMedia={activeMedia} />

          {/* Playback Error Overlay */}
          <ErrorOverlay error={error} onClose={onClose} />

          {/* Active Video Player */}
          {activeSrc && !loading && !error && (
            <div className="max-h-full max-w-full flex items-center justify-center relative w-full h-full">
              <VideoPlayer
                key={activeMedia.path}
                media={activeMedia}
                src={activeSrc}
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
                videoRef={currentVideoRef}
                setBufferedEnd={setBufferedEnd}
                setIsEnded={setIsEnded}
              />

              {/* FIRST FRAME STRATEGY: Instant thumbnail overlay */}
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
                  if (currentVideoRef.current) {
                    currentVideoRef.current.currentTime = 0;
                    const playPromise = currentVideoRef.current.play();
                    if (playPromise !== undefined) {
                      playPromise.then(() => setIsPlaying(true)).catch(() => {});
                    }
                  }
                }}
              />
            </div>
          )}
        </GestureController>
      </div>

      {/* Next Video Player */}
      {nextIndex < videoList.length && urls[videoList[nextIndex].path] && (
        <div
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'translateY(100%)' }}
        >
          <VideoPlayer
            key={videoList[nextIndex].path}
            media={videoList[nextIndex]}
            src={urls[videoList[nextIndex].path]}
            isPlaying={false}
            setIsPlaying={() => {}}
            currentTime={0}
            setCurrentTime={() => {}}
            duration={0}
            setDuration={() => {}}
            volume={0}
            isMuted={true}
            setIsMuted={() => {}}
            playbackSpeed={1.0}
            setIsBuffering={() => {}}
            onFirstFrameDecoded={() => {}}
            videoRef={nextVideoRef}
            setBufferedEnd={() => {}}
            setIsEnded={() => {}}
          />
        </div>
      )}
    </>
  );
}
