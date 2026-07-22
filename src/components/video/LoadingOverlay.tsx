/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { VaultMedia } from '../../types/vault';
import { ThumbnailManager } from '../../lib/thumbnailManager';

export interface LoadingOverlayProps {
  loading: boolean;
  activeMedia: VaultMedia;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  loading,
  activeMedia,
}) => {
  const thumbUrl = ThumbnailManager.getThumbnailSync(activeMedia.path)?.thumbnailUrl;

  return (
    <AnimatePresence>
      {loading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeInOut" }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black select-none pointer-events-auto"
        >
          {thumbUrl && (
            <img 
              src={thumbUrl}
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover blur-3xl opacity-40 scale-105 select-none pointer-events-none"
              alt=""
            />
          )}
          
          {/* Glass background gradient */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/90 pointer-events-none" />
          
          {/* Main loader card */}
          <div className="relative z-10 flex flex-col items-center gap-4 text-center max-w-sm px-6">
            <div className="relative flex items-center justify-center h-16 w-16 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
              <div className="h-8 w-8 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
            </div>
            
            <div className="flex flex-col gap-1 mt-1">
              <h3 className="text-white text-sm font-sans font-semibold tracking-tight truncate max-w-[240px]">
                {activeMedia.name}
              </h3>
              <p className="text-[9px] font-mono tracking-widest text-indigo-400 uppercase animate-pulse">
                Initializing Player...
              </p>
            </div>
            
            <div className="h-1 w-28 bg-white/10 rounded-full overflow-hidden mt-1 border border-white/5">
              <motion.div 
                className="h-full bg-indigo-500 rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingOverlay;
