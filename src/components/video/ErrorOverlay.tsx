/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ErrorOverlayProps {
  error: boolean;
  onClose: () => void;
}

export const ErrorOverlay: React.FC<ErrorOverlayProps> = ({
  error,
  onClose,
}) => {
  if (!error) return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 select-none p-6">
      <div className="flex flex-col items-center gap-3 text-center p-6 bg-slate-950/80 border border-white/10 rounded-3xl max-w-sm shadow-2xl backdrop-blur-xl z-30">
        <AlertCircle className="h-10 w-10 text-rose-500" />
        <h4 className="text-base font-sans font-bold text-white">Error Loading Media</h4>
        <p className="text-xs font-sans text-slate-400 leading-relaxed">
          This file could not be read. The browser may lack storage permission or the file was modified outside of the application.
        </p>
        <button
          onClick={onClose}
          className="mt-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl text-xs font-semibold cursor-pointer transition-colors"
        >
          Back to Gallery
        </button>
      </div>
    </div>
  );
};

export default ErrorOverlay;
