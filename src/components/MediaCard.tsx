/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Play, Check, FileWarning, Sparkles } from 'lucide-react';
import { VaultMedia } from '../types/vault';
import { ThumbnailManager, ThumbnailData } from '../lib/thumbnailManager';
import { VideoManager } from '../lib/videoManager';
import { EventBus } from '../lib/eventBus';
import { ObjectUrlManager } from '../lib/objectUrlManager';
import { pipelineDebugger } from '../lib/pipelineDebugger';

interface MediaCardProps {
  media: VaultMedia;
  isSelected: boolean;
  isInSelectionMode: boolean;
  onSelect: (media: VaultMedia) => void;
  onOpen: (media: VaultMedia) => void;
}

function MediaCard({
  media,
  isSelected,
  isInSelectionMode,
  onSelect,
  onOpen,
}: MediaCardProps) {
  const [isVisible, setIsVisible] = useState(false);

  // Synchronous checks to completely eliminate black/blank flashing during scroll
  const initialCachedMeta = ThumbnailManager.getThumbnailSync(media.path);

  const [cardState, setCardState] = useState<'READY' | 'LOADING_THUMBNAIL' | 'READING_METADATA' | 'GENERATING_PREVIEW' | 'FAILED'>(
    initialCachedMeta ? 'READY' : 'LOADING_THUMBNAIL'
  );
  const [isHovered, setIsHovered] = useState(false);
  const [cachedMeta, setCachedMeta] = useState<ThumbnailData | null>(initialCachedMeta);
  const [src, setSrc] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const ext = (media.extension || '').toLowerCase();
  const isVideo = media.type === 'video';

  // 1. Instrumentation: Log Card Mounted & Placeholder Visible
  useEffect(() => {
    pipelineDebugger.log(media.name, 'Card Mounted');
    if (!initialCachedMeta) {
      pipelineDebugger.log(media.name, 'Placeholder Visible');
    }
  }, [media.name]);

  // Instrumentation: Log Render Time
  const renderStart = performance.now();
  useEffect(() => {
    const duration = performance.now() - renderStart;
    pipelineDebugger.log(media.name, 'Render Time', `${duration.toFixed(2)}ms`);
  });

  // Intersection Observer for lazy loading and active unloading of file contents
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        setIsVisible(entry.isIntersecting);
        if (entry.isIntersecting) {
          pipelineDebugger.log(media.name, 'Intersection Trigger', { isIntersecting: true });
        }
      },
      { rootMargin: '350px 0px', threshold: 0.01 } // Preload buffer ahead of scroll
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [media.name]);

  // Centralized media/thumbnail loader
  useEffect(() => {
    let active = true;

    // Listen to real-time event-driven thumbnail updates
    const unsubscribe = EventBus.on('THUMBNAIL_READY', (data: { path: string; meta: ThumbnailData }) => {
      if (data.path === media.path && active) {
        pipelineDebugger.log(media.name, 'Thumbnail Ready (via EventBus)');
        setCachedMeta(data.meta);
        setCardState('READY');
      }
    });

    // Check sync cache immediately on mount or visibility change
    const syncMeta = ThumbnailManager.getThumbnailSync(media.path);
    if (syncMeta) {
      setCachedMeta(syncMeta);
      setCardState('READY');
      return unsubscribe;
    }

    // IF not visible in viewport -> DO NOT fetch or generate anything
    // "Invisible cards must never read files. No unnecessary disk access."
    if (!isVisible) {
      ThumbnailManager.cancelThumbnail(media.path);
      return unsubscribe;
    }

    // Lazy load: Schedule ONLY when the browser is idle
    let idleId: any = null;
    const requestIdle = typeof window !== 'undefined' ? (window as any).requestIdleCallback : null;

    const triggerThumbnailGeneration = () => {
      if (!active) return;
      pipelineDebugger.log(media.name, 'Idle Trigger (requestIdleCallback)');

      // Async/non-blocking request: do not await inside React hooks
      ThumbnailManager.requestThumbnail(
        media, 
        10, // High priority since it is visible in active viewport
        (state) => {
          if (active) {
            setCardState(state);
          }
        }
      );
    };

    if (requestIdle) {
      idleId = requestIdle(triggerThumbnailGeneration, { timeout: 150 });
    } else {
      idleId = setTimeout(triggerThumbnailGeneration, 50);
    }

    return () => {
      active = false;
      unsubscribe();
      ThumbnailManager.cancelThumbnail(media.path);
      if (idleId) {
        if (requestIdle) {
          (window as any).cancelIdleCallback(idleId);
        } else {
          clearTimeout(idleId);
        }
      }
    };
  }, [media, isVisible]);

  // Video hover playback controller with pooled URL reuse
  useEffect(() => {
    if (media.type !== 'video' || !isHovered) {
      if (videoRef.current) {
        videoRef.current.pause();
      }
      return;
    }

    let active = true;

    async function startHoverPlayback() {
      try {
        const objectUrl = await VideoManager.getVideoUrl(media);
        if (!active) return;
        setSrc(objectUrl);

        // Wait for next tick to play
        setTimeout(() => {
          if (!active || !videoRef.current) return;
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        }, 50);
      } catch (e) {
        console.error('Failed to start hover video playback:', e);
      }
    }

    startHoverPlayback();

    return () => {
      active = false;
      setSrc(null);
    };
  }, [isHovered, media]);


  // Long press gesture to toggle Selection Mode
  const handleTouchStart = () => {
    if (isInSelectionMode) return;
    longPressTimer.current = setTimeout(() => {
      onSelect(media);
      // Vibrate if browser supports it
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, 600); // 600ms long press threshold
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isInSelectionMode) {
      onSelect(media);
    } else {
      onOpen(media);
    }
  };

  // Render a beautiful, lightweight placeholder instantly when thumbnail is not yet loaded
  const renderPlaceholder = () => {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-[1px] animate-pulse">
        {isVideo ? (
          <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Play className="h-5 w-5 fill-indigo-400/20" />
          </div>
        ) : (
          <div className="p-3 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-500">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <span className="absolute bottom-2.5 left-2.5 right-2.5 truncate text-[9px] font-mono text-slate-500/70 text-center">
          {media.name}
        </span>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      id={`media-card-${media.name}`}
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        handleTouchEnd();
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchEnd}
      className={`group relative aspect-square w-full cursor-pointer overflow-hidden rounded-xl border bg-slate-950/60 shadow-md transition-all duration-300 select-none
        ${isSelected 
          ? 'border-emerald-500 ring-2 ring-emerald-500/30' 
          : 'border-slate-900 hover:border-slate-700/60'
        }
      `}
    >
      {/* Selection Checkbox Overlay */}
      {(isInSelectionMode || isSelected) && (
        <div className="absolute left-2.5 top-2.5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-950/80 backdrop-blur-md transition-all">
          <div
            className={`flex h-4 w-4 items-center justify-center rounded-full transition-all duration-200 
              ${isSelected ? 'bg-emerald-500 text-slate-950 scale-110' : 'bg-transparent scale-100'}
            `}
          >
            {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
          </div>
        </div>
      )}

      {/* Show beautiful placeholder instantly if we don't have the thumbnail yet */}
      {!cachedMeta?.thumbnailUrl && renderPlaceholder()}

      {/* Error State */}
      {cardState === 'FAILED' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/90 p-4 text-center">
          {cachedMeta?.thumbnailUrl ? (
            <img 
              src={cachedMeta.thumbnailUrl} 
              alt={media.name}
              className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[1px]" 
              referrerPolicy="no-referrer"
            />
          ) : null}
          <FileWarning className="h-8 w-8 text-rose-500 mb-1 z-20" />
          <span className="text-[10px] font-mono text-rose-400 truncate w-full px-2 z-20">{media.name}</span>
          <span className="text-[8px] font-sans text-slate-500 mt-1 z-20">Read error</span>
        </div>
      )}

      {/* Media Rendering */}
      {(cardState !== 'FAILED' && cachedMeta?.thumbnailUrl) && (
        <div className="h-full w-full relative animate-fade-in animate-duration-300">
          {media.type === 'image' || media.type === 'gif' ? (
            <img
              src={cachedMeta.thumbnailUrl}
              alt={media.name}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full relative">
              {isHovered && src ? (
                <video
                  ref={videoRef}
                  src={src}
                  muted
                  playsInline
                  loop
                  preload="metadata"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                />
              ) : (
                cachedMeta?.thumbnailUrl && (
                  <img
                    src={cachedMeta.thumbnailUrl}
                    alt={media.name}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                  />
                )
              )}
              
              {/* Play HUD Overlay for Videos */}
              <div className="absolute inset-0 bg-black/10 flex items-center justify-center transition-all group-hover:bg-black/20">
                {!isHovered && (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-950/80 border border-slate-800 text-indigo-400 shadow-md">
                    <Play className="h-4 w-4 fill-indigo-400 translate-x-[1px]" />
                  </div>
                )}
              </div>

              {/* Video Badge with duration */}
              <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-slate-950/85 border border-slate-900 text-[9px] font-mono font-bold tracking-wide text-indigo-400 flex items-center gap-1 shadow-md">
                <span>VIDEO</span>
                {cachedMeta && cachedMeta.duration > 0 && (
                  <span className="text-slate-300 font-medium">({Math.floor(cachedMeta.duration / 60)}:{(Math.floor(cachedMeta.duration % 60) < 10 ? '0' : '')}{Math.floor(cachedMeta.duration % 60)})</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Subtle hover gradient frame */}
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
    </div>
  );
}

export default React.memo(MediaCard);
