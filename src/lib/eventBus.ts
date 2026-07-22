/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type EventCallback = (data: any) => void;

class CentralEventBus {
  private listeners = new Map<string, Set<EventCallback>>();

  public on(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    return () => {
      const set = this.listeners.get(event);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  public emit(event: string, data?: any): void {
    const set = this.listeners.get(event);
    if (set) {
      // Create a copy to prevent concurrent modification issues during emits
      const callbacks = Array.from(set);
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error executing callback for event "${event}":`, err);
        }
      });
    }
  }

  public clear(): void {
    this.listeners.clear();
  }
}

export const EventBus = new CentralEventBus();
