/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCachedUrl, cacheUrl, clearMediaCache } from './mediaManager';

export function getCachedMediaUrl(path: string): string | null {
  return getCachedUrl(path);
}

export function cacheMediaUrl(path: string, url: string): void {
  cacheUrl(path, url);
}

export function clearMediaUrlCache(): void {
  clearMediaCache();
}

