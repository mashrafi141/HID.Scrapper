/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia } from '../../../types/vault';
import { VideoManager } from '../../../lib/videoManager';

export const ReelPreloadManager = {
  /**
   * Pre-resolves URLs for active sliding window (current, previous, next) and warms decoder caches.
   */
  prepareSlideWindow(
    currentIndex: number,
    videoList: VaultMedia[],
    onUrlResolved: (path: string, url: string) => void
  ) {
    if (videoList.length === 0) return;

    const activeIndices = [currentIndex - 1, currentIndex, currentIndex + 1].filter(
      (idx) => idx >= 0 && idx < videoList.length
    );

    activeIndices.forEach(async (idx) => {
      const media = videoList[idx];
      try {
        const url = await VideoManager.getVideoUrl(media);
        onUrlResolved(media.path, url);
      } catch (err) {
        console.error('[ReelPreloadManager] Failed to resolve URL for:', media.name, err);
      }
    });

    // Delegate adjacent video preload to Central VideoManager
    VideoManager.manageSlideWindowPreload(currentIndex, videoList);
  }
};
