/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventBus } from './eventBus';
import { ObjectUrlManager } from './objectUrlManager';
import { clearMediaCache } from './mediaManager';

class CentralMemoryPressureManager {
  private memoryCheckInterval: any = null;

  constructor() {
    this.startMonitoring();
  }

  public startMonitoring() {
    if (typeof window === 'undefined') return;

    // 1. Central Interval Memory Checking (using performance.memory)
    this.memoryCheckInterval = setInterval(() => {
      this.checkMemoryAndEvict();
    }, 15000); // Check every 15 seconds

    // 2. Storage Pressure API Support
    if ('navigator' in window && 'storage' in navigator && navigator.storage.estimate) {
      navigator.storage.estimate().then((estimate) => {
        const usage = estimate.usage || 0;
        const quota = estimate.quota || 1;
        if (usage / quota > 0.9) {
          console.warn('[MemoryPressureManager] Storage pressure high. Evicting caches...');
          this.triggerEviction('storage_pressure');
        }
      });
    }
  }

  public stopMonitoring() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  private checkMemoryAndEvict() {
    const perf = (performance as any).memory;
    if (perf && perf.usedJSHeapSize && perf.jsHeapSizeLimit) {
      const threshold = perf.jsHeapSizeLimit * 0.70; // 70% threshold
      if (perf.usedJSHeapSize > threshold) {
        console.warn(`[MemoryPressureManager] Heap memory high (${Math.round(perf.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(perf.jsHeapSizeLimit / 1024 / 1024)}MB). Triggering eviction.`);
        this.triggerEviction('high_heap_usage');
      }
    }
  }

  /**
   * Run global eviction to release precious RAM and Object URLs.
   */
  public triggerEviction(reason: string) {
    console.warn(`[MemoryPressureManager] Evicting memory. Reason: ${reason}`);

    // Revoke all Object URLs
    ObjectUrlManager.clear();

    // Clear centralized media LRU file caches and canvas cache
    clearMediaCache();

    // Notify any custom video components/views to evict their active decoders
    EventBus.emit('MEMORY_PRESSURE_EVICT', { reason });

    if (typeof window.gc === 'function') {
      try {
        window.gc();
      } catch (e) {}
    }
  }
}

export const MemoryPressureManager = new CentralMemoryPressureManager();
export type { CentralMemoryPressureManager };
