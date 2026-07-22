/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventBus } from './eventBus';

class AdaptiveConcurrencyController {
  private baseConcurrency = 2;
  private currentConcurrency = 2;
  private lastTime = performance.now();
  private lagSamples: number[] = [];
  private monitorInterval: any = null;

  constructor() {
    this.detectHardware();
    this.startMonitoring();
  }

  private detectHardware() {
    if (typeof window === 'undefined') return;

    const cores = navigator.hardwareConcurrency || 4;
    const ram = (navigator as any).deviceMemory || 8; // GB (default to 8 if unsupported)

    // Set a conservative starting concurrency
    let calculated = Math.max(2, Math.floor(cores / 2));
    if (ram < 4) {
      calculated = Math.min(2, calculated);
    } else if (ram >= 16) {
      calculated = Math.min(6, calculated);
    } else {
      calculated = Math.min(4, calculated);
    }

    this.baseConcurrency = calculated;
    this.currentConcurrency = calculated;
  }

  private startMonitoring() {
    if (typeof window === 'undefined') return;

    this.monitorInterval = setInterval(() => {
      this.measureEventLoopLag();
    }, 2000); // Check every 2 seconds
  }

  public stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  private measureEventLoopLag() {
    const start = performance.now();
    setTimeout(() => {
      const delta = performance.now() - start;
      const lag = Math.max(0, delta - 4); // 4ms is minimum setTimeout delay
      this.lagSamples.push(lag);
      if (this.lagSamples.length > 5) {
        this.lagSamples.shift();
      }

      this.adaptConcurrency();
    }, 4);
  }

  private adaptConcurrency() {
    // 1. Calculate Average Event Loop Lag (CPU Pressure Proxy)
    const avgLag = this.lagSamples.reduce((a, b) => a + b, 0) / (this.lagSamples.length || 1);

    // 2. Calculate JS Memory Usage (RAM Pressure Proxy)
    let memoryPressure = 1.0;
    const perf = (performance as any).memory;
    if (perf && perf.usedJSHeapSize && perf.jsHeapSizeLimit) {
      memoryPressure = perf.usedJSHeapSize / perf.jsHeapSizeLimit;
    }

    // 3. Dynamic Scaling Logic
    let scaleFactor = 1.0;

    // High event loop lag indicates CPU is busy or frame rate is dropping
    if (avgLag > 50) {
      // Extremely high lag: throttle down to minimum concurrency
      scaleFactor = 0.5;
    } else if (avgLag > 15) {
      // Moderate lag
      scaleFactor = 0.75;
    }

    // High memory pressure throttles down concurrency to prevent OOM
    if (memoryPressure > 0.8) {
      scaleFactor = Math.min(scaleFactor, 0.5);
    } else if (memoryPressure > 0.6) {
      scaleFactor = Math.min(scaleFactor, 0.8);
    }

    const calculated = Math.max(1, Math.round(this.baseConcurrency * scaleFactor));
    
    if (calculated !== this.currentConcurrency) {
      this.currentConcurrency = calculated;
      EventBus.emit('CONCURRENCY_CHANGE', { limit: this.currentConcurrency });
    }
  }

  public getLimit(): number {
    return this.currentConcurrency;
  }
}

export const AdaptiveConcurrency = new AdaptiveConcurrencyController();
