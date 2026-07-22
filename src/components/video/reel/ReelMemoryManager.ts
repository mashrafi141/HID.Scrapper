/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { VaultMedia } from '../../../types/vault';
import { ObjectUrlManager } from '../../../lib/objectUrlManager';

export const ReelMemoryManager = {
  /**
   * Identifies URLs that are no longer in the active 3-player sliding window and releases them.
   */
  cleanupSlideWindowUrls(
    currentIndex: number,
    videoList: VaultMedia[],
    resolvedUrls: Record<string, string>,
    onUrlsUpdated: (updater: (prev: Record<string, string>) => Record<string, string>) => void
  ) {
    const keepPaths = new Set(
      [currentIndex - 1, currentIndex, currentIndex + 1]
        .filter((idx) => idx >= 0 && idx < videoList.length)
        .map((idx) => videoList[idx].path)
    );

    Object.keys(resolvedUrls).forEach((path) => {
      if (!keepPaths.has(path)) {
        ObjectUrlManager.release(path);
        onUrlsUpdated((prev) => {
          const copy = { ...prev };
          delete copy[path];
          return copy;
        });
      }
    });
  },

  /**
   * Helper to clear and nullify timer/timeout references safely.
   */
  clearAllTimeouts(refs: React.MutableRefObject<NodeJS.Timeout | null>[]) {
    refs.forEach((ref) => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });
  }
};
