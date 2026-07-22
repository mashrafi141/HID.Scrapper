/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia } from '../types/vault';
import { getFileWithMultiplexing } from './mediaManager';
import { getCacheItem, setCacheItem } from './db';
import { PriorityScheduler } from './priorityScheduler';
import { WorkerPool } from './workerPool';
import { ObjectUrlManager } from './objectUrlManager';
import { EventBus } from './eventBus';
import { computeFileHash } from './hash';

export interface VideoMetadata {
  path: string;
  duration: number;
  width: number;
  height: number;
  mimeType: string;
  fileSize: number;
  lastModified: number;
}

const FILE_CACHE_MAX_SIZE = 50;

class CentralVideoManager {
  private fileCache = new Map<string, File>();
  private playbackCache = new Map<string, number>();
  private metadataCache = new Map<string, VideoMetadata>();
  private pendingMetadataPromises = new Map<string, Promise<VideoMetadata>>();

  // Video Decoder Pool: maximum 3 active decoders, LRU eviction
  private activeDecoders = new Map<string, HTMLVideoElement>();
  private decoderLRU: string[] = [];

  constructor() {
    this.startMemoryMonitor();

    // Listen to central memory pressure manager evictions
    EventBus.on('MEMORY_PRESSURE_EVICT', () => {
      console.warn('[VideoManager] Received MEMORY_PRESSURE_EVICT. Evicting decoders and clearing caches.');
      this.evictAllDecoders();
      this.fileCache.clear();
      this.metadataCache.clear();
    });
  }

  /**
   * Memory management: Monitors performance.memory and releases decoders/object URLs automatically.
   */
  private startMemoryMonitor() {
    if (typeof window === 'undefined') return;
    
    setInterval(() => {
      const perf = (performance as any).memory;
      if (perf && perf.usedJSHeapSize && perf.jsHeapSizeLimit) {
        const threshold = perf.jsHeapSizeLimit * 0.75; // 75% heap threshold
        if (perf.usedJSHeapSize > threshold) {
          console.warn('[VideoManager] Memory usage high. Triggering automatic cache eviction...');
          this.evictAllDecoders();
          ObjectUrlManager.clear();
          this.fileCache.clear();
          if (typeof window.gc === 'function') {
            window.gc();
          }
        }
      }
    }, 10000); // Check every 10 seconds
  }

  public async getFile(media: VaultMedia): Promise<File> {
    const cached = this.fileCache.get(media.path);
    if (cached) {
      this.fileCache.delete(media.path);
      this.fileCache.set(media.path, cached);
      return cached;
    }

    const file = await getFileWithMultiplexing(media);
    if (this.fileCache.size >= FILE_CACHE_MAX_SIZE) {
      const oldestKey = this.fileCache.keys().next().value;
      if (oldestKey) this.fileCache.delete(oldestKey);
    }
    this.fileCache.set(media.path, file);
    return file;
  }

  /**
   * Acquire a ready-to-play Object URL.
   * Leverages URL.createObjectURL on a local file.
   */
  public async getVideoUrl(media: VaultMedia): Promise<string> {
    const cachedUrl = ObjectUrlManager.get(media.path);
    if (cachedUrl) {
      return cachedUrl;
    }

    const file = await this.getFile(media);

    const creator = async () => {
      return URL.createObjectURL(file);
    };

    return ObjectUrlManager.acquire(media.path, creator);
  }

  /**
   * Pre-creates a video decoder/element to make playback load times feel instant (<300ms).
   */
  public acquireDecoder(path: string, url: string): HTMLVideoElement {
    let video = this.activeDecoders.get(path);
    if (video) {
      this.updateDecoderLRU(path);
      return video;
    }

    // Limit active decoders to 3
    if (this.activeDecoders.size >= 3) {
      const oldestPath = this.decoderLRU.shift();
      if (oldestPath) {
        const oldestVideo = this.activeDecoders.get(oldestPath);
        if (oldestVideo) {
          oldestVideo.src = '';
          oldestVideo.load();
          oldestVideo.remove();
        }
        this.activeDecoders.delete(oldestPath);
      }
    }

    video = document.createElement('video');
    video.src = url;
    video.preload = 'auto';
    video.playsInline = true;
    
    this.activeDecoders.set(path, video);
    this.updateDecoderLRU(path);
    
    return video;
  }

  private updateDecoderLRU(path: string) {
    this.decoderLRU = this.decoderLRU.filter((p) => p !== path);
    this.decoderLRU.push(path);
  }

  private evictAllDecoders() {
    this.activeDecoders.forEach((video) => {
      video.src = '';
      video.load();
      video.remove();
    });
    this.activeDecoders.clear();
    this.decoderLRU = [];
  }

  public preloadVideo(media: VaultMedia, priority: number = 2): void {
    PriorityScheduler.schedule(`preload_video_${media.path}`, priority, async () => {
      try {
        const url = await this.getVideoUrl(media);
        // Pre-warm the decoder off-screen
        this.acquireDecoder(media.path, url);
      } catch (err) {
        // Silent error on background preload
      }
    });
  }

  public smartFolderPrepare(mediaList: VaultMedia[]): void {
    if (!mediaList || mediaList.length === 0) return;
    
    // Preload first 6 items likely visible in viewport on folder open
    const initialSlice = mediaList.slice(0, 6);
    initialSlice.forEach((media) => {
      if (media.type === 'video') {
        this.preloadVideo(media, 1);
      }
    });
  }

  public manageSlideWindowPreload(currentIndex: number, mediaList: VaultMedia[]): void {
    if (!mediaList || mediaList.length === 0) return;

    const visibleRange = new Set<string>();
    const preloadTargets: { media: VaultMedia; priority: number }[] = [];

    const indicesToPreload = [
      { idx: currentIndex + 1, priority: 3 }, // Immediate next
      { idx: currentIndex + 2, priority: 2 }, // Second next
      { idx: currentIndex - 1, priority: 2 }, // Previous
    ];

    visibleRange.add(mediaList[currentIndex].path);

    for (const { idx, priority } of indicesToPreload) {
      if (idx >= 0 && idx < mediaList.length) {
        const targetMedia = mediaList[idx];
        if (targetMedia.type === 'video') {
          preloadTargets.push({ media: targetMedia, priority });
          visibleRange.add(targetMedia.path);
        }
      }
    }

    // Release Object URLs of far-away videos
    this.activeDecoders.forEach((video, path) => {
      if (!visibleRange.has(path)) {
        video.src = '';
        video.load();
        video.remove();
        this.activeDecoders.delete(path);
        ObjectUrlManager.release(path);
      }
    });

    // Run preloading
    preloadTargets.forEach(({ media, priority }) => {
      this.preloadVideo(media, priority);
    });
  }

  public getPlaybackPosition(path: string): number {
    if (this.playbackCache.has(path)) {
      return this.playbackCache.get(path)!;
    }
    const saved = localStorage.getItem(`playback_resume_${path}`);
    if (saved) {
      const pos = parseFloat(saved);
      this.playbackCache.set(path, pos);
      return pos;
    }
    return 0;
  }

  public setPlaybackPosition(path: string, seconds: number): void {
    this.playbackCache.set(path, seconds);
    if (seconds > 3) {
      localStorage.setItem(`playback_resume_${path}`, seconds.toString());
    } else {
      localStorage.removeItem(`playback_resume_${path}`);
    }
  }

  public async getVideoMetadata(media: VaultMedia): Promise<VideoMetadata> {
    const path = media.path;

    if (this.metadataCache.has(path)) {
      return this.metadataCache.get(path)!;
    }

    let pending = this.pendingMetadataPromises.get(path);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const file = await this.getFile(media);
        const hashKey = computeFileHash(media.path, file.size, file.lastModified);
        const cacheKey = `video_meta_hash_${hashKey}`;

        let cached = await getCacheItem<VideoMetadata>(cacheKey);
        
        // Backward compatibility fallback
        if (!cached) {
          const legacyKey = `video_full_meta_v2_${path}`;
          cached = await getCacheItem<VideoMetadata>(legacyKey);
          if (cached && cached.lastModified === file.lastModified) {
            // Write legacy cache forward to new hash key
            await setCacheItem(cacheKey, cached);
          }
        }

        if (cached && cached.lastModified === file.lastModified) {
          this.metadataCache.set(path, cached);
          return cached;
        }

        const url = await this.getVideoUrl(media);
        const meta = await new Promise<VideoMetadata>((resolve) => {
          const video = this.acquireDecoder(path, url);

          const failTimeout = setTimeout(() => {
            resolve({
              path,
              duration: 0,
              width: 0,
              height: 0,
              mimeType: file.type || 'video/mp4',
              fileSize: file.size,
              lastModified: file.lastModified,
            });
          }, 5000);

          video.onloadedmetadata = () => {
            clearTimeout(failTimeout);
            resolve({
              path,
              duration: video.duration || 0,
              width: video.videoWidth || 0,
              height: video.videoHeight || 0,
              mimeType: file.type || 'video/mp4',
              fileSize: file.size,
              lastModified: file.lastModified,
            });
          };

          video.onerror = () => {
            clearTimeout(failTimeout);
            resolve({
              path,
              duration: 0,
              width: 0,
              height: 0,
              mimeType: file.type || 'video/mp4',
              fileSize: file.size,
              lastModified: file.lastModified,
            });
          };
        });

        this.metadataCache.set(path, meta);
        await setCacheItem(cacheKey, meta);
        EventBus.emit('METADATA_READY', meta);
        return meta;
      } catch (err) {
        console.error('Metadata extraction error in VideoManager:', err);
        return {
          path,
          duration: 0,
          width: 0,
          height: 0,
          mimeType: 'video/mp4',
          fileSize: 0,
          lastModified: Date.now(),
        };
      }
    })();

    this.pendingMetadataPromises.set(path, promise);
    promise.finally(() => {
      this.pendingMetadataPromises.delete(path);
    });

    return promise;
  }

  public clearAllCaches(): void {
    this.evictAllDecoders();
    ObjectUrlManager.clear();
    this.fileCache.clear();
    this.playbackCache.clear();
    this.metadataCache.clear();
  }
}

export const VideoManager = new CentralVideoManager();
export type { CentralVideoManager };
