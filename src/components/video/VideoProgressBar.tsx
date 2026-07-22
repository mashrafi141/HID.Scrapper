/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';

export interface VideoProgressBarProps {
  currentTime: number;
  duration: number;
  bufferedEnd: number;
  onSeek: (time: number) => void;
}

export const VideoProgressBar: React.FC<VideoProgressBarProps> = ({
  currentTime,
  duration,
  bufferedEnd,
  onSeek,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    handleSeekUpdate(e);
    barRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      handleSeekUpdate(e);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    barRef.current?.releasePointerCapture(e.pointerId);
  };

  const handleSeekUpdate = (e: React.PointerEvent) => {
    if (!barRef.current || duration === 0) return;
    const rect = barRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const time = Math.max(0, Math.min(duration, pos * duration));
    onSeek(time);
  };

  const currentPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;

  return (
    <div 
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative w-full h-4 flex items-center cursor-pointer group touch-none"
    >
      {/* Background Track */}
      <div className="absolute inset-x-0 h-1 rounded-full bg-white/10 group-hover:h-1.5 transition-all duration-150" />
      {/* Buffered Range Track */}
      <div 
        className="absolute h-1 rounded-full bg-white/20 group-hover:h-1.5 transition-all duration-150"
        style={{ left: 0, width: `${Math.min(100, bufferedPercent)}%` }}
      />
      {/* Active Played Track */}
      <div 
        className="absolute h-1 rounded-full bg-indigo-500 group-hover:h-1.5 transition-all duration-150"
        style={{ left: 0, width: `${Math.min(100, currentPercent)}%` }}
      />
      {/* Seek Handle (Thumb) */}
      <div 
        className="absolute h-3.5 w-3.5 rounded-full bg-indigo-400 border border-white scale-0 group-hover:scale-100 transition-transform duration-150 shadow-md"
        style={{ 
          left: `${Math.min(100, currentPercent)}%`, 
          transform: `translateX(-50%) ${isDragging ? 'scale(1.25)' : ''}` 
        }}
      />
    </div>
  );
};

export default VideoProgressBar;
