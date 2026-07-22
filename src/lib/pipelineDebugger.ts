/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class PipelineDebugger {
  public enabled = false; // Disabled by default in production
  
  // Track counts
  public workerUsage = 0;
  public workerFailureCount = 0;
  public fallbackCount = 0;

  // Track timings
  private timings: Map<string, { start: number; label: string }> = new Map();

  constructor() {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      (window as any).DEBUG_MEDIA_PIPELINE = false;
      (window as any).getPipelineStats = () => this.getStats();
      (window as any).printPipelineStats = () => this.printStats();
    }
  }

  public isEnabled(): boolean {
    if (typeof window !== 'undefined' && (window as any).DEBUG_MEDIA_PIPELINE !== undefined) {
      return !!(window as any).DEBUG_MEDIA_PIPELINE;
    }
    return this.enabled;
  }

  public trackWorkerSuccess() {
    this.workerUsage++;
  }

  public trackWorkerFailure(errorMsg: string) {
    this.workerFailureCount++;
  }

  public trackFallback() {
    this.fallbackCount++;
  }

  public log(mediaName: string, event: string, extra?: any) {
  }

  public startTimer(id: string, label: string) {
    this.timings.set(id, { start: performance.now(), label });
  }

  public endTimer(id: string) {
    const timing = this.timings.get(id);
    if (timing) {
      const duration = performance.now() - timing.start;
      this.timings.delete(id);
      return duration;
    }
    return 0;
  }

  public getStats() {
    return {
      workerUsage: this.workerUsage,
      workerFailureCount: this.workerFailureCount,
      fallbackCount: this.fallbackCount,
    };
  }

  public printStats() {
  }
}

export const pipelineDebugger = new PipelineDebugger();
