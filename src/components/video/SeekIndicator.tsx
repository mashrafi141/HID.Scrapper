/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sun, Volume2, Loader2 } from 'lucide-react';

export interface SeekIndicatorProps {
  doubleTapFeedback: { show: boolean; type: 'left' | 'right' };
  gestureType: 'none' | 'brightness' | 'volume' | 'seek';
  gestureValue: string | number;
}

export const SeekIndicator: React.FC<SeekIndicatorProps> = ({
  doubleTapFeedback,
  gestureType,
  gestureValue,
}) => {
  return (
    <>
      {/* 1. Double Tap Rewind/Forward Visual Indicator Overlay */}
      <AnimatePresence>
        {doubleTapFeedback.show && (
          <motion.div
            key={doubleTapFeedback.type}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className={`absolute z-35 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center gap-1.5 p-5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md text-white ${
              doubleTapFeedback.type === 'left' ? 'left-1/6 md:left-1/4' : 'right-1/6 md:right-1/4'
            }`}
          >
            <span className="text-xl font-bold tracking-widest font-sans select-none">
              {doubleTapFeedback.type === 'left' ? '« 10' : '10 »'}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300 select-none">
              {doubleTapFeedback.type === 'left' ? 'Rewind' : 'Fast Forward'}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Swipe Gesture HUD Overlay (Brightness / Volume / Seek Swipe) */}
      <AnimatePresence>
        {gestureType !== 'none' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20 }}
            className="absolute z-50 left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2 px-5 py-3.5 rounded-2xl bg-slate-950/90 border border-white/10 text-white font-sans shadow-2xl backdrop-blur-lg select-none pointer-events-none"
          >
            {gestureType === 'brightness' && <Sun className="h-6 w-6 text-amber-400 animate-pulse" />}
            {gestureType === 'volume' && <Volume2 className="h-6 w-6 text-indigo-400 animate-pulse" />}
            {gestureType === 'seek' && <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />}
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{gestureType}</span>
            <span className="text-lg font-extrabold font-mono text-white">{gestureValue}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default SeekIndicator;
