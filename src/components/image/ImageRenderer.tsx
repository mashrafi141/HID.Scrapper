/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VaultMedia } from '../../types/vault';
import { ThumbnailManager } from '../../lib/thumbnailManager';

interface ImageRendererProps {
  media: VaultMedia;
  src: string;
  scale: number;
  offset: { x: number; y: number };
  imgRef: React.RefObject<HTMLImageElement | null>;
  rotation?: number;
}

export const ImageRenderer = React.memo(function ImageRenderer({
  media,
  src,
  scale,
  offset,
  imgRef,
  rotation = 0,
}: ImageRendererProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  // Load thumbnail if available for placeholder
  useEffect(() => {
    setIsLoaded(false);
    const thumb = ThumbnailManager.getThumbnailSync(media.path);
    if (thumb?.thumbnailUrl) {
      setThumbnailUrl(thumb.thumbnailUrl);
    } else {
      setThumbnailUrl(null);
    }
  }, [media.path]);

  // Handle high-res image loaded
  const handleLoadComplete = () => {
    setIsLoaded(true);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
      {/* 1. BLURRED PREVIEW BACKDROP: Avoid black/white flashes */}
      <AnimatePresence>
        {!isLoaded && thumbnailUrl && (
          <motion.img
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            src={thumbnailUrl}
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 pointer-events-none z-0"
            alt=""
          />
        )}
      </AnimatePresence>

      {/* 2. MAIN TRANSFORM LAYER (Hardware-Accelerated via Framer Motion) */}
      <motion.div
        animate={{
          scale,
          x: offset.x,
          y: offset.y,
          rotate: rotation,
        }}
        transition={{
          type: 'spring',
          damping: 30,
          stiffness: 260,
          mass: 0.8,
        }}
        style={{
          transformOrigin: 'center center',
        }}
        className="relative max-h-full max-w-full flex items-center justify-center z-10"
      >
        {/* Thumbnail preview loaded instantly inside the transform bounds */}
        {!isLoaded && thumbnailUrl && (
          <img
            src={thumbnailUrl}
            referrerPolicy="no-referrer"
            className="absolute max-h-screen max-w-full object-contain pointer-events-none filter blur-sm select-none"
            alt=""
          />
        )}

        {/* High-Resolution / High-Quality Image or GIF */}
        <motion.img
          ref={imgRef}
          src={src}
          alt={media.name}
          onLoad={handleLoadComplete}
          draggable={false}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 0.25 }}
          className="max-h-screen max-w-full object-contain pointer-events-auto select-none select-none shadow-2xl rounded-sm"
          style={{
            willChange: 'transform, opacity',
          }}
        />
      </motion.div>
    </div>
  );
});
