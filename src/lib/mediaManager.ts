/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCacheItem, setCacheItem } from './db';
import { VaultMedia } from '../types/vault';

export interface ThumbnailData {
  thumbnailUrl: string; // Base64 JPEG data-url
  duration: number;
}

// 1. Centralized Multiplexed File Reads
// Prevents duplicate concurrent handle.getFile() calls for the same path
const fileReadPromises = new Map<string, Promise<File>>();
const FILE_CACHE_MAX_SIZE = 50;
const fileCache = new Map<string, File>();

export function clearFileCache(): void {
  fileCache.clear();
}

export async function getFileWithMultiplexing(media: VaultMedia, signal?: AbortSignal): Promise<File> {
  if (signal?.aborted) {
    throw new DOMException('Aborted getFileWithMultiplexing', 'AbortError');
  }

  const cacheKey = media.path;
  
  const cachedFile = fileCache.get(cacheKey);
  if (cachedFile) {
    fileCache.delete(cacheKey);
    fileCache.set(cacheKey, cachedFile);
    return cachedFile;
  }

  let promise = fileReadPromises.get(cacheKey);
  if (!promise) {
    promise = media.handle.getFile().then((file) => {
      if (fileCache.size >= FILE_CACHE_MAX_SIZE) {
        const oldestKey = fileCache.keys().next().value;
        if (oldestKey) fileCache.delete(oldestKey);
      }
      fileCache.set(cacheKey, file);
      return file;
    });
    fileReadPromises.set(cacheKey, promise);
    
    // Clean up the promise from active reads map once settled to avoid memory leaks
    promise.then(() => {
      fileReadPromises.delete(cacheKey);
    }).catch(() => {
      fileReadPromises.delete(cacheKey);
    });
  }

  if (signal) {
    return Promise.race([
      promise,
      new Promise<File>((_, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted getFileWithMultiplexing', 'AbortError'));
        });
      })
    ]);
  }

  return promise;
}

// 2. Bounded Object URL Pool (LRU Cache)
const MAX_URL_CACHE_SIZE = 120;
const urlCache = new Map<string, string>(); // path -> objectUrl

export function getCachedUrl(path: string): string | null {
  const url = urlCache.get(path);
  if (url) {
    // Move to the end of the Map to mark as most recently used
    urlCache.delete(path);
    urlCache.set(path, url);
    return url;
  }
  return null;
}

export function cacheUrl(path: string, url: string): void {
  if (urlCache.has(path)) {
    urlCache.delete(path);
  } else if (urlCache.size >= MAX_URL_CACHE_SIZE) {
    // Evict the oldest item (first item in Map keys)
    const oldestKey = urlCache.keys().next().value;
    if (oldestKey) {
      const oldestUrl = urlCache.get(oldestKey);
      if (oldestUrl) {
        try {
          URL.revokeObjectURL(oldestUrl);
        } catch (e) {
          console.error('Failed to revoke evicted Object URL:', e);
        }
      }
      urlCache.delete(oldestKey);
    }
  }
  urlCache.set(path, url);
}

export async function getOrCreateObjectUrl(media: VaultMedia): Promise<string> {
  const cached = getCachedUrl(media.path);
  if (cached) {
    return cached;
  }
  const file = await getFileWithMultiplexing(media);
  const url = URL.createObjectURL(file);
  cacheUrl(media.path, url);
  return url;
}

/**
 * Preloads media in the background to make swiping extremely fast.
 */
export function preloadMedia(media: VaultMedia): void {
  if (!media) return;
  // Use getOrCreateObjectUrl to load and cache the object URL in the background
  getOrCreateObjectUrl(media).catch(() => {});
}

/**
 * Clear and revoke all cached Object URLs.
 */
export function clearMediaCache(): void {
  urlCache.forEach((url, path) => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to revoke object URL during cleanup:', e);
    }
  });
  urlCache.clear();
  fileReadPromises.clear();
  clearFileCache();
}
