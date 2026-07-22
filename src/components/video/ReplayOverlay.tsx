/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw } from 'lucide-react';

export interface ReplayOverlayProps {
  isEnded: boolean;
  onReplay: () => void;
}

export const ReplayOverlay: React.FC<ReplayOverlayProps> = ({
  isEnded,
  onReplay,
}) => {
  return (
    <AnimatePresence>
      {isEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 backdrop-blur-xs"
        >
          <motion.button
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onReplay}
            className="h-16 w-16 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center border border-white/20 shadow-2xl backdrop-blur-md cursor-pointer"
          >
            <RotateCcw className="h-6 w-6 text-white" strokeWidth={1.5} />
          </motion.button>
          <span className="mt-3 text-xs font-semibold tracking-wider text-white/95 uppercase">
            Replay
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ReplayOverlay;
