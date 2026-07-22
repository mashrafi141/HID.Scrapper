/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Gauge } from 'lucide-react';

export interface SpeedIndicatorProps {
  isLongPressing: boolean;
  playbackSpeed: number;
}

export const SpeedIndicator: React.FC<SpeedIndicatorProps> = ({
  isLongPressing,
  playbackSpeed,
}) => {
  return (
    <AnimatePresence>
      {isLongPressing && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-500/90 text-slate-950 font-bold text-xs shadow-lg backdrop-blur-md select-none pointer-events-none"
        >
          <Gauge className="h-4 w-4 animate-pulse" />
          <span>{playbackSpeed.toFixed(1)}x Speed Boost</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SpeedIndicator;
