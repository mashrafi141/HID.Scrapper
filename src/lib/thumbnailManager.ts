/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia } from '../types/vault';
import { getCacheItem, setCacheItem } from './db';
import { PriorityScheduler } from './priorityScheduler';
import { WorkerPool } from './workerPool';
import { EventBus } from './eventBus';
import { computeFileHash } from './hash';
import { pipelineDebugger } from './pipelineDebugger';

export interface ThumbnailData {
  thumbnailUrl: string; // Base64 JPEG data-url
  duration: number;
}

export function getVideoPlaceholder(name: string): string {
  const escapedName = name.substring(0, 20); // Keep it short
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135">
    <rect width="100%" height="100%" fill="#090d16"/>
    <rect width="100%" height="100%" fill="none" stroke="#1e293b" stroke-width="2"/>
    <circle cx="120" cy="67" r="22" fill="#111827" stroke="#6366f1" stroke-width="2"/>
    <polygon points="116,57 130,67 116,77" fill="#6366f1"/>
    <text x="120" y="112" font-family="monospace" font-size="9" fill="#818cf8" text-anchor="middle" font-weight="bold">${escapedName}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function getImagePlaceholder(name: string): string {
  const escapedName = name.substring(0, 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
    <rect width="100%" height="100%" fill="#090d16"/>
    <rect width="100%" height="100%" fill="none" stroke="#1e293b" stroke-width="2"/>
    <path d="M40,170 L80,110 L120,150 L160,90 L200,170 Z" fill="#111827" stroke="#6366f1" stroke-width="2"/>
    <circle cx="160" cy="55" r="10" fill="#111827" stroke="#6366f1" stroke-width="2"/>
    <text x="120" y="210" font-family="monospace" font-size="9" fill="#818cf8" text-anchor="middle" font-weight="bold">${escapedName}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

class CentralThumbnailManager {
  // Bounded Memory Cache for Thumbnails to prevent Out-Of-Memory on large folders
  private memoryCache = new Map<string, ThumbnailData>();
  private cacheUsageOrder: string[] = []; // Track LRU key sequence
  private MAX_MEMORY_CACHE_SIZE = 400; // Cap memory cache at 400 active elements

  private activeCallbacks = new Map<string, Set<(state: any) => void>>();
  private mediaList: VaultMedia[] = [];

  // Dedicated Thumbnail Queues & Concurrency Guards
  private activeImageGens = 0;
  private MAX_CONCURRENT_IMAGES = 5; // Recommended: 4-6 image tasks
  private activeVideoGens = 0;
  private MAX_CONCURRENT_VIDEOS = 2; // Recommended: 2 video tasks

  // Cancellation and Active Abort Controllers
  private activeAbortControllers = new Map<string, AbortController>();

  constructor() {
    EventBus.on('MEMORY_PRESSURE_EVICT', () => {
      this.clearMemoryCache();
    });

    // Pause PriorityScheduler during fullscreen active media playback
    EventBus.on('FULLSCREEN_OPEN', () => {
      PriorityScheduler.setPaused(true);
    });

    EventBus.on('FULLSCREEN_CLOSE', () => {
      PriorityScheduler.setPaused(false);
    });

    // Register Event-Driven Thumbnail Request handler
    EventBus.on('THUMBNAIL_REQUEST', async ({ media, priority }: { media: VaultMedia; priority: number }) => {
      await this.processThumbnailRequest(media, priority);
    });

    EventBus.on('THUMBNAIL_CANCEL', ({ path }: { path: string }) => {
      this.cancelThumbnail(path);
    });
  }

  public setMediaList(list: VaultMedia[]) {
    this.mediaList = list;
  }

  /**
   * Fast synchronous memory lookup to prevent blinking and flashing during virtual scroll re-rendering.
   */
  public getThumbnailSync(path: string): ThumbnailData | null {
    const cached = this.memoryCache.get(path);
    if (cached) {
      this.touchCacheKey(path);
      return cached;
    }
    return null;
  }

  private touchCacheKey(path: string) {
    this.cacheUsageOrder = this.cacheUsageOrder.filter((k) => k !== path);
    this.cacheUsageOrder.push(path);
    if (this.cacheUsageOrder.length > this.MAX_MEMORY_CACHE_SIZE) {
      const oldest = this.cacheUsageOrder.shift();
      if (oldest) {
        this.memoryCache.delete(oldest);
      }
    }
  }

  public requestThumbnail(
    media: VaultMedia,
    priority: number = 1,
    onStateChange?: (state: any) => void
  ): void {
    const path = media.path;
    if (onStateChange) {
      if (!this.activeCallbacks.has(path)) {
        this.activeCallbacks.set(path, new Set());
      }
      this.activeCallbacks.get(path)!.add(onStateChange);
    }
    EventBus.emit('THUMBNAIL_REQUEST', { media, priority });
  }

  /**
   * Cancel task and abort active operations when card leaves the viewport.
   * This immediately stops CPU and Disk/File work for offscreen content.
   */
  public cancelThumbnail(path: string): void {
    this.activeCallbacks.delete(path);
    PriorityScheduler.cancel(`thumb_gen_${path}`);
    
    // Abort active fetch/generate work
    const controller = this.activeAbortControllers.get(path);
    if (controller) {
      controller.abort();
      this.activeAbortControllers.delete(path);
    }
  }

  private triggerStateChange(path: string, state: any) {
    const callbacks = this.activeCallbacks.get(path);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(state);
        } catch (e) {
          // ignore
        }
      });
    }
  }

  private async processThumbnailRequest(media: VaultMedia, priority: number): Promise<void> {
    const path = media.path;

    // 1. Fast Cache checks: check memory cache first
    const cachedMem = this.getThumbnailSync(path);
    if (cachedMem) {
      this.triggerStateChange(path, 'READY');
      EventBus.emit('THUMBNAIL_READY', { path, meta: cachedMem });
      return;
    }

    this.triggerStateChange(path, 'LOADING_THUMBNAIL');

    // Create a new AbortController for this thumbnail task
    const controller = new AbortController();
    this.activeAbortControllers.set(path, controller);

    PriorityScheduler.schedule(`thumb_gen_${path}`, priority, async () => {
      const isVideo = media.type === 'video';
      try {
        if (controller.signal.aborted) return;

        // Double check memory cache
        if (this.memoryCache.has(path)) {
          this.triggerStateChange(path, 'READY');
          return;
        }

        // 2. Fast IndexedDB check: Path-based lookup
        const legacyKey = `thumb_v3_${path}`;
        let cached = await getCacheItem<{ meta: ThumbnailData; lastModified?: number; size?: number }>(legacyKey);

        if (controller.signal.aborted) return;

        if (cached && cached.meta) {
          this.memoryCache.set(path, cached.meta);
          this.touchCacheKey(path);
          this.triggerStateChange(path, 'READY');
          EventBus.emit('THUMBNAIL_READY', { path, meta: cached.meta });
          this.activeAbortControllers.delete(path);
          return;
        }

        // 3. Fast IndexedDB check: Hash-based lookup
        const hashKey = computeFileHash(media.path, media.size || 0, media.modified || 0);
        const cacheKey = `thumb_hash_${hashKey}`;
        let cachedByHash = await getCacheItem<{ meta: ThumbnailData; lastModified: number }>(cacheKey);

        if (controller.signal.aborted) return;

        if (cachedByHash && cachedByHash.meta) {
          this.memoryCache.set(path, cachedByHash.meta);
          this.touchCacheKey(path);
          this.triggerStateChange(path, 'READY');
          EventBus.emit('THUMBNAIL_READY', { path, meta: cachedByHash.meta });
          this.activeAbortControllers.delete(path);
          return;
        }

        // 4. Generation Path: Allocate Concurrency and retrieve file handle
        pipelineDebugger.log(media.name, 'Generating normal thumbnail');

        // Check and acquire specific concurrency limit tokens (Non-blocking)
        if (isVideo) {
          while (this.activeVideoGens >= this.MAX_CONCURRENT_VIDEOS) {
            if (controller.signal.aborted) return;
            await new Promise((resolve) => setTimeout(resolve, 80));
          }
          this.activeVideoGens++;
        } else {
          while (this.activeImageGens >= this.MAX_CONCURRENT_IMAGES) {
            if (controller.signal.aborted) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          this.activeImageGens++;
        }

        try {
          if (controller.signal.aborted) return;

          const file = await media.handle.getFile();
          media.size = file.size;
          media.modified = file.lastModified;

          if (controller.signal.aborted) return;

          this.triggerStateChange(path, isVideo ? 'READING_METADATA' : 'GENERATING_PREVIEW');

          let meta: ThumbnailData;
          if (isVideo) {
            meta = await this.generateVideoThumbnailOffThread(file, controller.signal);
          } else {
            meta = await this.generateImageThumbnailWithRetry(file, controller.signal, async () => {
              return this.generateImageThumbnailMainThread(file);
            });
          }

          if (controller.signal.aborted) return;

          if (meta && meta.thumbnailUrl) {
            this.memoryCache.set(path, meta);
            this.touchCacheKey(path);

            const savedObj = { meta, lastModified: file.lastModified, size: file.size };
            await setCacheItem(legacyKey, savedObj);
            
            const newHashKey = computeFileHash(media.path, file.size, file.lastModified);
            await setCacheItem(`thumb_hash_${newHashKey}`, savedObj);

            if (controller.signal.aborted) return;

            this.triggerStateChange(path, 'READY');
            EventBus.emit('THUMBNAIL_READY', { path, meta });
          } else {
            throw new Error('No thumbnail data URL generated');
          }
        } finally {
          // Release concurrency tokens
          if (isVideo) {
            this.activeVideoGens = Math.max(0, this.activeVideoGens - 1);
          } else {
            this.activeImageGens = Math.max(0, this.activeImageGens - 1);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error(`[ThumbnailManager] Failed to generate thumbnail for ${media.name}:`, err);
          const fallbackMeta = {
            thumbnailUrl: isVideo ? getVideoPlaceholder(media.name) : getImagePlaceholder(media.name),
            duration: 0
          };
          this.memoryCache.set(path, fallbackMeta);
          this.touchCacheKey(path);
          this.triggerStateChange(path, 'FAILED');
          EventBus.emit('THUMBNAIL_READY', { path, meta: fallbackMeta });
        }
      } finally {
        this.activeAbortControllers.delete(path);
      }
    });

    // Decoupled lazy background preloading of next +10 viewport cards (Priority 3)
    const requestIdle = typeof window !== 'undefined' ? (window as any).requestIdleCallback : null;
    if (requestIdle) {
      requestIdle(() => this.preloadNextTenAhead(path), { timeout: 300 });
    } else {
      setTimeout(() => this.preloadNextTenAhead(path), 150);
    }
  }

  private preloadNextTenAhead(path: string) {
    if (this.mediaList.length === 0) return;
    const index = this.mediaList.findIndex((m) => m.path === path);
    if (index === -1) return;

    // Queue ONLY the next 10 items
    for (let i = 1; i <= 10; i++) {
      const nextMedia = this.mediaList[index + i];
      if (!nextMedia) break;

      const nextPath = nextMedia.path;
      if (!this.memoryCache.has(nextPath)) {
        // Preload with Priority 3 (low priority)
        PriorityScheduler.schedule(`thumb_gen_${nextPath}`, 3, async () => {
          try {
            const legacyKey = `thumb_v3_${nextPath}`;
            let cached = await getCacheItem<{ meta: ThumbnailData }>(legacyKey);
            if (cached && cached.meta) {
              this.memoryCache.set(nextPath, cached.meta);
              this.touchCacheKey(nextPath);
              EventBus.emit('THUMBNAIL_READY', { path: nextPath, meta: cached.meta });
              return;
            }

            // Do not force generation for preload, check if we can generate quickly
            const file = await nextMedia.handle.getFile();
            let meta: ThumbnailData;
            if (nextMedia.type === 'video') {
              // Only generate video if CPU is idle
              if (this.activeVideoGens >= this.MAX_CONCURRENT_VIDEOS) return;
              this.activeVideoGens++;
              try {
                meta = await this.generateVideoThumbnailOffThread(file);
              } finally {
                this.activeVideoGens = Math.max(0, this.activeVideoGens - 1);
              }
            } else {
              if (this.activeImageGens >= this.MAX_CONCURRENT_IMAGES) return;
              this.activeImageGens++;
              try {
                meta = await this.generateImageThumbnailWithRetry(file, undefined, async () => {
                  return this.generateImageThumbnailMainThread(file);
                });
              } finally {
                this.activeImageGens = Math.max(0, this.activeImageGens - 1);
              }
            }

            if (meta && meta.thumbnailUrl) {
              this.memoryCache.set(nextPath, meta);
              this.touchCacheKey(nextPath);
              await setCacheItem(legacyKey, { meta, lastModified: file.lastModified, size: file.size });
              EventBus.emit('THUMBNAIL_READY', { path: nextPath, meta });
            }
          } catch (e) {
            // Quietly ignore preloader exceptions
          }
        });
      }
    }
  }

  private async generateImageThumbnailWithRetry(
    imageBlob: Blob | ImageBitmap,
    signal?: AbortSignal,
    fallbackFn?: () => Promise<ThumbnailData>
  ): Promise<ThumbnailData> {
    const isBitmap = imageBlob instanceof ImageBitmap;
    
    try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      
      pipelineDebugger.startTimer('worker_thumb', 'Worker image thumbnail');
      const transfer = isBitmap ? [imageBlob as ImageBitmap] : undefined;
      const workerResult = await WorkerPool.runTask('generateImageThumbnail', {
        imageBlob,
        targetWidth: 240
      }, transfer, { signal });

      pipelineDebugger.endTimer('worker_thumb');
      pipelineDebugger.trackWorkerSuccess();
      return { thumbnailUrl: workerResult.thumbnailUrl, duration: 0 };
    } catch (err: any) {
      pipelineDebugger.endTimer('worker_thumb');
      if (err.name === 'AbortError' || signal?.aborted) {
        throw err;
      }
      
      pipelineDebugger.trackWorkerFailure(err?.message || String(err));
      console.warn(`[ThumbnailManager] Worker image thumbnail failed. Retrying...`, err);

      try {
        if (!isBitmap && !signal?.aborted) {
          pipelineDebugger.startTimer('worker_thumb_retry', 'Worker image thumbnail retry');
          const workerResult = await WorkerPool.runTask('generateImageThumbnail', {
            imageBlob,
            targetWidth: 240
          }, undefined, { signal });
          pipelineDebugger.endTimer('worker_thumb_retry');
          pipelineDebugger.trackWorkerSuccess();
          return { thumbnailUrl: workerResult.thumbnailUrl, duration: 0 };
        }
      } catch (retryErr: any) {
        if (retryErr.name === 'AbortError' || signal?.aborted) throw retryErr;
        console.warn(`[ThumbnailManager] Worker retry failed, falling back to UI thread.`, retryErr);
      }

      if (fallbackFn) {
        pipelineDebugger.trackFallback();
        pipelineDebugger.startTimer('fallback_thumb', 'Main thread fallback image thumbnail');
        const result = await fallbackFn();
        pipelineDebugger.endTimer('fallback_thumb');
        return result;
      }
      return { thumbnailUrl: '', duration: 0 };
    }
  }

  /**
   * Fast, multi-frame video representative frame selection.
   * Samples candidate frames at proportional intervals, scores their exposure and contrast,
   * and terminates early when an excellent frame is found, keeping resource consumption minimal.
   */
  private async generateVideoThumbnailOffThread(blob: Blob, signal?: AbortSignal): Promise<ThumbnailData> {
    return new Promise<ThumbnailData>(async (resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Aborted generateVideoThumbnailOffThread', 'AbortError'));
        return;
      }

      const objectUrl = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const failTimeout = setTimeout(() => {
        cleanup();
        resolve({ thumbnailUrl: '', duration: 0 });
      }, 9500);

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted generateVideoThumbnailOffThread', 'AbortError'));
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      const cleanup = () => {
        clearTimeout(failTimeout);
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
        video.src = '';
        video.load();
        URL.revokeObjectURL(objectUrl);
      };

      video.onloadedmetadata = async () => {
        try {
          if (signal?.aborted) {
            onAbort();
            return;
          }

          const duration = video.duration || 0;
          let ratios: number[] = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9];
          if (duration > 0) {
            if (duration <= 20) {
              ratios = [0.2, 0.5, 0.8];
            } else if (duration <= 120) {
              ratios = [0.1, 0.3, 0.5, 0.7, 0.9];
            } else {
              ratios = [0.1, 0.25, 0.4, 0.6, 0.75, 0.9];
            }
          }
          const timestamps = ratios.map(r => r * duration);

          let bestFrame: { score: number; thumbnailUrl: string } | null = null;

          for (let i = 0; i < timestamps.length; i++) {
            if (signal?.aborted) {
              onAbort();
              return;
            }

            const time = timestamps[i];
            try {
              // Promise-based seek
              await new Promise<void>((resSeek, rejSeek) => {
                const onSeeked = () => {
                  video.removeEventListener('seeked', onSeeked);
                  video.removeEventListener('error', onError);
                  resSeek();
                };
                const onError = (e: any) => {
                  video.removeEventListener('seeked', onSeeked);
                  video.removeEventListener('error', onError);
                  rejSeek(e);
                };
                video.addEventListener('seeked', onSeeked);
                video.addEventListener('error', onError);
                video.currentTime = time;
              });

              if (signal?.aborted) {
                onAbort();
                return;
              }

              // Capture frame as ImageBitmap
              const bitmap = await createImageBitmap(video);

              if (signal?.aborted) {
                bitmap.close();
                onAbort();
                return;
              }

              // Send to Worker for scoring and thumbnail generation
              pipelineDebugger.startTimer('worker_video_analysis', `Analyzing frame at ${time}s`);
              const res = await WorkerPool.runTask('analyzeAndGenerateVideoFrame', {
                imageBlob: bitmap,
                targetWidth: 360 // high quality size
              }, [bitmap], { signal });
              pipelineDebugger.endTimer('worker_video_analysis');

              if (signal?.aborted) {
                onAbort();
                return;
              }

              const score = res.score || 0;

              if (score >= 95) {
                // Excellent frame! Stop seeking immediately and return.
                cleanup();
                resolve({ thumbnailUrl: res.thumbnailUrl, duration });
                return;
              }

              if (!bestFrame || score > bestFrame.score) {
                bestFrame = { score, thumbnailUrl: res.thumbnailUrl };
              }
            } catch (seekErr) {
              console.warn(`[VideoThumbnailEngine] Failed seeking/capturing frame at timestamp ${time}:`, seekErr);
            }
          }

          // If we reached here, return the best candidate we found
          cleanup();
          if (bestFrame && bestFrame.thumbnailUrl) {
            resolve({ thumbnailUrl: bestFrame.thumbnailUrl, duration });
          } else {
            resolve({ thumbnailUrl: '', duration });
          }
        } catch (err) {
          cleanup();
          resolve({ thumbnailUrl: '', duration: video.duration || 0 });
        }
      };

      video.onerror = () => {
        cleanup();
        resolve({ thumbnailUrl: '', duration: 0 });
      };

      video.src = objectUrl;
    });
  }

  private async generateImageThumbnailMainThread(blob: Blob | ImageBitmap): Promise<ThumbnailData> {
    if (blob instanceof ImageBitmap) {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const targetWidth = 240;
          const aspectRatio = blob.width / (blob.height || 1) || 1;
          const targetHeight = Math.round(targetWidth / aspectRatio);

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.drawImage(blob, 0, 0, targetWidth, targetHeight);
          
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
          blob.close();
          return { thumbnailUrl, duration: 0 };
        }
      } catch (err) {
        // Silent fallback
      }
      return { thumbnailUrl: '', duration: 0 };
    }

    if (typeof window !== 'undefined' && window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const targetWidth = 240;
          const aspectRatio = bitmap.width / (bitmap.height || 1) || 1;
          const targetHeight = Math.round(targetWidth / aspectRatio);

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
          
          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
          bitmap.close();
          return { thumbnailUrl, duration: 0 };
        }
      } catch (err) {
        // Silent fallback
      }
    }

    return new Promise<ThumbnailData>((resolve) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();

      const failTimeout = setTimeout(() => {
        cleanup();
        resolve({ thumbnailUrl: '', duration: 0 });
      }, 5000);

      const cleanup = () => {
        clearTimeout(failTimeout);
        URL.revokeObjectURL(objectUrl);
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            resolve({ thumbnailUrl: '', duration: 0 });
            return;
          }

          const targetWidth = 240;
          const aspectRatio = img.width / (img.height || 1) || 1;
          const targetHeight = Math.round(targetWidth / aspectRatio);

          canvas.width = targetWidth;
          canvas.height = targetHeight;
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.6);
          cleanup();
          resolve({ thumbnailUrl, duration: 0 });
        } catch (e) {
          cleanup();
          resolve({ thumbnailUrl: '', duration: 0 });
        }
      };

      img.onerror = () => {
        cleanup();
        resolve({ thumbnailUrl: '', duration: 0 });
      };

      img.src = objectUrl;
    });
  }

  public async warmupMemoryCache(mediaList: VaultMedia[]): Promise<void> {
    if (!mediaList || mediaList.length === 0) return;
    
    // Warm up memory cache with lightweight IndexedDB items
    await Promise.all(
      mediaList.map(async (media) => {
        const path = media.path;
        if (this.memoryCache.has(path)) return;
        
        try {
          const hashKey = computeFileHash(media.path, media.size || 0, media.modified || 0);
          const cacheKey = `thumb_hash_${hashKey}`;
          let cached = await getCacheItem<{ meta: ThumbnailData; lastModified: number }>(cacheKey);
          
          if (!cached) {
            const legacyKey = `thumb_v3_${path}`;
            cached = await getCacheItem<{ meta: ThumbnailData; lastModified: number }>(legacyKey);
            if (cached && cached.meta) {
              await setCacheItem(cacheKey, cached);
            }
          }

          if (cached && cached.meta) {
            this.memoryCache.set(path, cached.meta);
            this.touchCacheKey(path);
          }
        } catch (e) {
          // Ignore
        }
      })
    );
  }

  public queueFolderThumbnails(mediaList: VaultMedia[]): void {
    return;
  }

  public prioritizeThumbnail(media: VaultMedia): void {
    return;
  }

  public clearMemoryCache(): void {
    this.memoryCache.clear();
    this.cacheUsageOrder = [];
  }
}

export const ThumbnailManager = new CentralThumbnailManager();
export const thumbnailMemoryCache = ThumbnailManager;
