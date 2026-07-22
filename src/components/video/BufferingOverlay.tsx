/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface BufferingOverlayProps {
  isBuffering: boolean;
}

export const BufferingOverlay: React.FC<BufferingOverlayProps> = ({
  isBuffering,
}) => {
  return (
    <AnimatePresence>
      {isBuffering && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute z-30 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-3 p-5 rounded-3xl bg-slate-950/70 border border-white/10 backdrop-blur-md shadow-2xl pointer-events-none animate-pulse"
        >
          <div className="relative flex items-center justify-center">
            <div className="h-11 w-11 rounded-full border-4 border-slate-900 border-t-indigo-500 animate-spin" />
            <div 
              className="absolute h-7 w-7 rounded-full border-4 border-slate-900 border-b-indigo-400 animate-spin" 
              style={{ animationDirection: 'reverse' }} 
            />
          </div>
          <span className="text-[10px] font-mono font-bold tracking-widest text-indigo-400 uppercase">
            Buffering...
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BufferingOverlay;
