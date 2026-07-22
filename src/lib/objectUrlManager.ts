/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class CentralObjectUrlManager {
  private urlMap = new Map<string, { url: string; refCount: number }>();

  public acquire(path: string, creator: () => string | Promise<string>): string | Promise<string> {
    const entry = this.urlMap.get(path);
    if (entry) {
      entry.refCount++;
      return entry.url;
    }

    const res = creator();
    if (res instanceof Promise) {
      return res.then((url) => {
        this.urlMap.set(path, { url, refCount: 1 });
        return url;
      });
    } else {
      this.urlMap.set(path, { url: res, refCount: 1 });
      return res;
    }
  }

  public release(path: string): void {
    const entry = this.urlMap.get(path);
    if (!entry) return;

    entry.refCount--;
    if (entry.refCount <= 0) {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (err) {
        console.error(`[ObjectUrlManager] Failed to revoke URL for path: ${path}`, err);
      }
      this.urlMap.delete(path);
    }
  }

  public get(path: string): string | null {
    const entry = this.urlMap.get(path);
    return entry ? entry.url : null;
  }

  public clear(): void {
    this.urlMap.forEach((entry, path) => {
      try {
        URL.revokeObjectURL(entry.url);
      } catch (e) {}
    });
    this.urlMap.clear();
  }
}

export const ObjectUrlManager = new CentralObjectUrlManager();
