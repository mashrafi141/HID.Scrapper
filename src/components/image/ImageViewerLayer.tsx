/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trash2, Heart } from 'lucide-react';
import { VaultMedia } from '../../types/vault';
import { ImageRenderer } from './ImageRenderer';
import { useImageGestureEngine } from './engine/ImageGestureEngine';

interface ImageViewerLayerProps {
  media: VaultMedia;
  src: string;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onDelete?: () => void;
  indexInfo?: string;
}

export default function ImageViewerLayer({
  media,
  src,
  onClose,
  onNext,
  onPrev,
  hasPrev,
  hasNext,
  onDelete,
  indexInfo,
}: ImageViewerLayerProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);

  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Reset zoom and offsets whenever active media changes
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setShowControls(true);
    resetControlsTimer(true);
  }, [media.path]);

  // Controls auto-hide timer
  const resetControlsTimer = (forceShow = false) => {
    if (forceShow) {
      setShowControls(true);
    }
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (showControls || forceShow) {
      controlsTimeoutRef.current = setTimeout(() => {
        // Only auto-hide if scale is 1 and not interacting
        if (scale === 1) {
          setShowControls(false);
        }
      }, 3000);
    }
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  const handleSingleTap = () => {
    setShowControls((prev) => {
      const next = !prev;
      if (next) resetControlsTimer(true);
      return next;
    });
  };

  // Instantiate the gesture engine
  const {
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    gestureType,
  } = useImageGestureEngine({
    scale,
    setScale,
    offset,
    setOffset,
    onNext,
    onPrev,
    onClose,
    hasPrev,
    hasNext,
    containerRef,
    imgRef,
    onSingleTap: handleSingleTap,
  });

  // Desktop keyboard listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && hasNext && scale === 1) {
        onNext();
      } else if (e.key === 'ArrowLeft' && hasPrev && scale === 1) {
        onPrev();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasPrev, hasNext, scale, onClose, onNext, onPrev]);

  // Compute pull-to-dismiss transparency
  const backdropOpacity = Math.max(
    0.4,
    1 - (gestureType === 'swipe-down' ? Math.max(0, offset.y) / 450 : 0)
  );

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center select-none touch-none overflow-hidden transition-colors duration-150"
      style={{ backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})` }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* 1. TOP HUD: Sleek glassmorphism style bar */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between bg-gradient-to-b from-black/95 via-black/75 to-transparent p-5 backdrop-blur-xs select-none"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onClose}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/50 border border-slate-850/80 text-slate-300 hover:text-white transition-all cursor-pointer"
                title="Back"
              >
                <X className="h-5 w-5" />
              </button>
              <div className="min-w-0 text-left">
                <h4 className="truncate text-sm font-sans font-semibold text-white">
                  {media.name}
                </h4>
                {indexInfo && (
                  <p className="text-[10px] font-mono text-slate-400">
                    {indexInfo} • {media.extension.toUpperCase()}
                  </p>
                )}
              </div>
            </div>

            {/* TOP RIGHT TOOLBAR */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsFavorited((f) => !f)}
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/50 border transition-all cursor-pointer ${
                  isFavorited
                    ? 'border-pink-500/30 text-pink-500 bg-pink-950/20'
                    : 'border-slate-850/80 text-slate-300 hover:text-white'
                }`}
                title="Favorite"
              >
                <Heart className={`h-4.5 w-4.5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>

              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/50 border border-rose-950/40 text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-all cursor-pointer"
                  title="Delete media"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. CENTRAL IMAGE/GIF RENDER LAYER */}
      <div className="w-full h-full flex items-center justify-center z-10">
        <ImageRenderer
          media={media}
          src={src}
          scale={scale}
          offset={offset}
          imgRef={imgRef}
        />
      </div>
    </div>
  );
}
