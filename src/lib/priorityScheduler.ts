/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventBus } from './eventBus';
import { AdaptiveConcurrency } from './adaptiveConcurrency';

interface SchedulerTask {
  id: string;
  priority: number;
  fn: () => Promise<any>;
}

class PriorityTaskScheduler {
  private queue: SchedulerTask[] = [];
  private activeCount = 0;
  private maxConcurrency = 2; // Keep low to protect mobile CPU/RAM
  private isScrolling = false;
  private isPaused = false;
  private scrollTimeout: any = null;

  constructor() {
    this.maxConcurrency = AdaptiveConcurrency.getLimit();

    if (typeof window !== 'undefined') {
      const handleScroll = () => {
        this.isScrolling = true;
        if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
          this.isScrolling = false;
          this.processNext();
        }, 150); // Pause background work during scrolling + 150ms after
      };
      
      // Listen to scroll events passively and with capture to ensure we catch scrolls on any container
      window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
      window.addEventListener('touchmove', handleScroll, { passive: true, capture: true });

      // Subscribe to dynamic adaptive concurrency changes
      EventBus.on('CONCURRENCY_CHANGE', ({ limit }) => {
        this.maxConcurrency = limit;
        this.processNext();
      });
    }
  }

  /**
   * Set paused state dynamically
   */
  public setPaused(paused: boolean) {
    this.isPaused = paused;
    if (!paused) {
      this.processNext();
    }
  }

  /**
   * Set max concurrent tasks dynamically
   */
  public setConcurrency(count: number) {
    this.maxConcurrency = count;
    this.processNext();
  }

  /**
   * Schedule or update a task's priority
   */
  public schedule(id: string, priority: number, fn: () => Promise<any>): void {
    // Remove if already exists with lower priority, then re-insert
    const index = this.queue.findIndex((t) => t.id === id);
    if (index !== -1) {
      if (this.queue[index].priority >= priority) {
        // Keep higher priority
        return;
      }
      this.queue.splice(index, 1);
    }

    this.queue.push({ id, priority, fn });
    // Sort queue descending by priority
    this.queue.sort((a, b) => b.priority - a.priority);

    // Run next task
    this.processNext();
  }

  /**
   * Remove a task from the queue
   */
  public cancel(id: string): void {
    this.queue = this.queue.filter((t) => t.id !== id);
  }

  /**
   * Clear the entire task queue
   */
  public clear(): void {
    this.queue = [];
  }

  /**
   * Process the next task in the queue if conditions are met
   */
  public processNext(): void {
    if (this.activeCount >= this.maxConcurrency) return;
    if (this.isScrolling) return; // Yield to scrolling
    if (this.isPaused) return; // Yield to pause state
    if (this.queue.length === 0) return;

    // Retrieve highest priority task
    const task = this.queue.shift()!;
    this.activeCount++;

    // Defer task execution to an idle frame or set timeout to keep UI fluid
    const exec = async () => {
      try {
        await task.fn();
      } catch (err) {
        console.error(`Scheduler task ${task.id} failed:`, err);
      } finally {
        this.activeCount--;
        this.processNext();
      }
    };

    if (typeof window !== 'undefined' && (window as any).requestIdleCallback) {
      (window as any).requestIdleCallback(() => exec(), { timeout: 100 });
    } else {
      setTimeout(exec, 0);
    }
  }
}

export const PriorityScheduler = new PriorityTaskScheduler();
