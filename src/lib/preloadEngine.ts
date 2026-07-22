/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia } from '../types/vault';
import { ThumbnailManager } from './thumbnailManager';
import { PriorityScheduler } from './priorityScheduler';

class PredictivePreloadEngine {
  private mediaList: VaultMedia[] = [];
  private lastScrollTop = 0;
  private scrollDirection: 'up' | 'down' | 'idle' = 'idle';
  private scrollTimeout: any = null;
  private activePreloads = new Set<string>();

  constructor() {
    this.setupScrollListener();
  }

  public setMediaList(list: VaultMedia[]) {
    this.mediaList = list;
  }

  private setupScrollListener() {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      
      if (scrollTop > this.lastScrollTop) {
        this.setScrollDirection('down');
      } else if (scrollTop < this.lastScrollTop) {
        this.setScrollDirection('up');
      }

      this.lastScrollTop = scrollTop <= 0 ? 0 : scrollTop;

      if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
      this.scrollTimeout = setTimeout(() => {
        this.setScrollDirection('idle');
      }, 200); // Back to idle after 200ms of no scrolling
    };

    window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
  }

  private setScrollDirection(dir: 'up' | 'down' | 'idle') {
    if (this.scrollDirection === dir) return;
    
    const prevDir = this.scrollDirection;
    this.scrollDirection = dir;

    // Direction changed or stopped: cancel outdated prediction preloads immediately
    if (dir !== 'idle' && prevDir !== 'idle' && dir !== prevDir) {
      this.cancelOppositePreloads(dir);
    }

    this.triggerPrediction();
  }

  private cancelOppositePreloads(currentDir: 'up' | 'down') {
    // Cancel scheduled items in the queue that are in the wrong direction
    this.activePreloads.forEach((path) => {
      PriorityScheduler.cancel(`thumb_gen_${path}`);
    });
    this.activePreloads.clear();
  }

  /**
   * Run prediction logic to find which items to preload
   */
  private triggerPrediction() {
    if (this.mediaList.length === 0) return;

    // Find visible items as anchor
    const visibleCards = Array.from(document.querySelectorAll('[id^="media-card-"]'));
    if (visibleCards.length === 0) return;

    // Extract names and map them to indices in mediaList
    const visibleNames = visibleCards.map((el) => {
      return el.id.replace('media-card-', '');
    });

    let firstVisibleIndex = this.mediaList.length;
    let lastVisibleIndex = -1;

    for (let i = 0; i < this.mediaList.length; i++) {
      if (visibleNames.includes(this.mediaList[i].name)) {
        if (i < firstVisibleIndex) firstVisibleIndex = i;
        if (i > lastVisibleIndex) lastVisibleIndex = i;
      }
    }

    if (lastVisibleIndex === -1) return;

    const viewportSize = lastVisibleIndex - firstVisibleIndex + 1;
    const bufferSize = Math.max(12, Math.round(viewportSize * 1.5)); // 1.5x viewport buffer

    let startPreloadIdx = -1;
    let endPreloadIdx = -1;

    if (this.scrollDirection === 'down' || this.scrollDirection === 'idle') {
      // Predict items ahead (below)
      startPreloadIdx = lastVisibleIndex + 1;
      endPreloadIdx = Math.min(this.mediaList.length - 1, lastVisibleIndex + bufferSize);
    } else if (this.scrollDirection === 'up') {
      // Predict items above
      startPreloadIdx = Math.max(0, firstVisibleIndex - bufferSize);
      endPreloadIdx = firstVisibleIndex - 1;
    }

    // Prediction preloading is disabled to strictly satisfy the rule:
    // "Invisible cards must never read files. No unnecessary disk access."
    // Only visible cards in the active viewport can perform File Reads, Thumbnails, or Metadata.
    return;
  }
}

export const PreloadEngine = new PredictivePreloadEngine();
export type { PredictivePreloadEngine };
