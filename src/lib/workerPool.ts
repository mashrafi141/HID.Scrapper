/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventBus } from './eventBus';
import { AdaptiveConcurrency } from './adaptiveConcurrency';

// Web Worker code as an inline Blob string with support for generateImageThumbnail, analyzeAndGenerateVideoFrame, computeHash, and getMetadata
const WORKER_SCRIPT = `
  self.onmessage = async (e) => {
    const { id, type, payload } = e.data;
    
    try {
      if (type === 'generateImageThumbnail') {
        const { imageBlob, targetWidth } = payload;
        
        try {
          // OffscreenCanvas Thumbnail generation inside worker!
          if (typeof self.createImageBitmap !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
            const bitmap = await self.createImageBitmap(imageBlob);
            const aspectRatio = bitmap.width / (bitmap.height || 1) || 1;
            const targetHeight = Math.round(targetWidth / aspectRatio);
            
            const canvas = new OffscreenCanvas(targetWidth, targetHeight);
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
              const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
              
              const reader = new FileReader();
              reader.onloadend = () => {
                bitmap.close();
                self.postMessage({ 
                  id, 
                  type, 
                  success: true, 
                  payload: { 
                    thumbnailUrl: reader.result,
                    width: bitmap.width,
                    height: bitmap.height
                  } 
                });
              };
              reader.readAsDataURL(blob);
              return;
            }
            bitmap.close();
          }
          
          self.postMessage({ id, type, success: false, error: 'OffscreenCanvas or createImageBitmap unsupported' });
        } catch (err) {
          self.postMessage({ id, type, success: false, error: err.message });
        }
      }

      else if (type === 'analyzeAndGenerateVideoFrame') {
        const { imageBlob, targetWidth } = payload;
        try {
          if (typeof self.createImageBitmap !== 'undefined' && typeof OffscreenCanvas !== 'undefined') {
            const bitmap = await self.createImageBitmap(imageBlob);
            
            // 1. Analyze and score the frame on a small canvas to be super fast
            const analysisWidth = 80;
            const analysisHeight = Math.round(analysisWidth * (bitmap.height / (bitmap.width || 1)));
            const analysisCanvas = new OffscreenCanvas(analysisWidth, analysisHeight);
            const actx = analysisCanvas.getContext('2d');
            
            let score = 0;
            let avgLuma = 0;
            let stdDev = 0;

            if (actx) {
              actx.drawImage(bitmap, 0, 0, analysisWidth, analysisHeight);
              const imgData = actx.getImageData(0, 0, analysisWidth, analysisHeight);
              const data = imgData.data;
              const len = data.length;
              
              let totalLuma = 0;
              for (let i = 0; i < len; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                totalLuma += luma;
              }
              avgLuma = totalLuma / (len / 4);

              // Variance / Contrast
              let sumSqDiff = 0;
              for (let i = 0; i < len; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                const diff = luma - avgLuma;
                sumSqDiff += diff * diff;
              }
              const variance = sumSqDiff / (len / 4);
              stdDev = Math.sqrt(variance);

              // Score calculation
              if (avgLuma < 18) {
                score = 1; // extremely dark/black
              } else if (avgLuma > 240) {
                score = 2; // extremely bright/white
              } else if (stdDev < 10) {
                score = 5; // solid / very low contrast
              } else {
                const lumaTargetDiff = Math.abs(avgLuma - 120);
                const brightnessScore = Math.max(0, 100 - (lumaTargetDiff * 0.7));
                const contrastScore = Math.min(100, (stdDev / 38) * 100);
                score = (brightnessScore * 0.45) + (contrastScore * 0.55);
              }
            }

            // 2. Generate actual thumbnail image
            const aspectRatio = bitmap.width / (bitmap.height || 1) || 1;
            const targetHeight = Math.round(targetWidth / aspectRatio);
            const canvas = new OffscreenCanvas(targetWidth, targetHeight);
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
              const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });
              
              const reader = new FileReader();
              reader.onloadend = () => {
                bitmap.close();
                self.postMessage({
                  id,
                  type,
                  success: true,
                  payload: {
                    thumbnailUrl: reader.result,
                    score,
                    avgLuma,
                    stdDev
                  }
                });
              };
              reader.readAsDataURL(blob);
              return;
            }
            bitmap.close();
          }
          self.postMessage({ id, type, success: false, error: 'OffscreenCanvas or createImageBitmap unsupported' });
        } catch (err) {
          self.postMessage({ id, type, success: false, error: err.message });
        }
      }

      else if (type === 'computeHash') {
        const { arrayBuffer, size, modified, name } = payload;
        let hashStr = '';
        try {
          // 1. Try SHA-256 using Crypto API inside Web Worker
          if (self.crypto && self.crypto.subtle) {
            const digestBuffer = await self.crypto.subtle.digest('SHA-256', arrayBuffer);
            const hashArray = Array.from(new Uint8Array(digestBuffer));
            hashStr = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
          } else {
            throw new Error('WebCrypto unavailable');
          }
        } catch (err) {
          // 2. Fallback: CRC32 of chunk data
          let crc = 0xFFFFFFFF;
          const view = new Uint8Array(arrayBuffer);
          for (let i = 0; i < view.length; i++) {
            let c = (crc ^ view[i]) & 255;
            for (let j = 0; j < 8; j++) {
              c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
            }
            crc = (crc >>> 8) ^ c;
          }
          crc = crc ^ 0xFFFFFFFF;

          // 3. Fallback: FNV-1a of metadata to ensure renaming/moving safety
          const metaStr = \`\${size}:\${modified}:\${crc.toString(16)}\`;
          let fnv = 2166136261;
          for (let i = 0; i < metaStr.length; i++) {
            fnv ^= metaStr.charCodeAt(i);
            fnv += (fnv << 1) + (fnv << 4) + (fnv << 7) + (fnv << 8) + (fnv << 24);
          }
          hashStr = \`crc_\${Math.abs(crc | 0).toString(16)}_fnv_\${Math.abs(fnv | 0).toString(36)}\`;
        }

        self.postMessage({ id, type, success: true, payload: { hash: \`fhash_\${hashStr}\` } });
      }

      else if (type === 'getMetadata') {
        const { blob, isVideo } = payload;
        try {
          if (isVideo) {
            // Parse video metadata using fast binary parsing of MP4 container atoms
            const arrayBuffer = await blob.arrayBuffer();
            const view = new DataView(arrayBuffer);
            
            let duration = 0;
            let width = 0;
            let height = 0;
            let timescale = 1000;
            let codec = 'h264';
            let fps = 30;
            let bitrate = 0;
            let audioChannels = 2;

            function findBox(boxType, start, end) {
              let idx = start;
              while (idx < end - 8) {
                const size = view.getUint32(idx);
                const currentType = String.fromCharCode(
                  view.getUint8(idx + 4),
                  view.getUint8(idx + 5),
                  view.getUint8(idx + 6),
                  view.getUint8(idx + 7)
                );
                if (size < 8) break;
                if (currentType === boxType) {
                  return { offset: idx, size };
                }
                idx += size;
              }
              return null;
            }

            const moov = findBox('moov', 0, view.byteLength);
            if (moov) {
              const mvhd = findBox('mvhd', moov.offset + 8, moov.offset + moov.size);
              if (mvhd) {
                const version = view.getUint8(mvhd.offset + 8);
                if (version === 1) {
                  timescale = view.getUint32(mvhd.offset + 20);
                  const durationHigh = view.getUint32(mvhd.offset + 24);
                  const durationLow = view.getUint32(mvhd.offset + 28);
                  duration = durationLow / (timescale || 1000);
                } else {
                  timescale = view.getUint32(mvhd.offset + 12);
                  duration = view.getUint32(mvhd.offset + 16) / (timescale || 1000);
                }
              }

              // Extract video tracks
              let searchOffset = moov.offset + 8;
              while (searchOffset < moov.offset + moov.size - 8) {
                const trak = findBox('trak', searchOffset, moov.offset + moov.size);
                if (!trak) break;
                const tkhd = findBox('tkhd', trak.offset + 8, trak.offset + trak.size);
                if (tkhd) {
                  const version = view.getUint8(tkhd.offset + 8);
                  const widthOffset = version === 1 ? tkhd.offset + 84 : tkhd.offset + 76;
                  const w = view.getUint32(widthOffset) >>> 16;
                  const h = view.getUint32(widthOffset + 4) >>> 16;
                  if (w > 0 && h > 0) {
                    width = w;
                    height = h;
                  }
                }
                searchOffset = trak.offset + trak.size;
              }
            }

            bitrate = Math.round((view.byteLength * 8) / (duration || 1));

            self.postMessage({
              id,
              type,
              success: true,
              payload: {
                duration,
                width,
                height,
                rotation: 0,
                orientation: 1,
                codec,
                bitrate,
                fps,
                audioChannels
              }
            });
          } else {
            // Parse image dimensions inside Web Worker using Offscreen createImageBitmap
            if (typeof self.createImageBitmap !== 'undefined') {
              const bitmap = await self.createImageBitmap(blob);
              const w = bitmap.width;
              const h = bitmap.height;
              bitmap.close();
              
              self.postMessage({
                id,
                type,
                success: true,
                payload: {
                  width: w,
                  height: h,
                  rotation: 0,
                  orientation: 1,
                  duration: 0,
                  codec: 'jpeg',
                  bitrate: 0,
                  fps: 0,
                  audioChannels: 0
                }
              });
            } else {
              self.postMessage({
                id,
                type,
                success: true,
                payload: {
                  width: 1920,
                  height: 1080,
                  rotation: 0,
                  orientation: 1,
                  duration: 0,
                  codec: 'jpeg',
                  bitrate: 0,
                  fps: 0,
                  audioChannels: 0
                }
              });
            }
          }
        } catch (err) {
          self.postMessage({ id, type, success: false, error: err.message });
        }
      }
    } catch (err) {
      self.postMessage({ id, type, success: false, error: err.message });
    }
  };
`;

class CentralWorkerPool {
  private workers: Worker[] = [];
  private activeWorkers = 0;
  private maxWorkers = 4;
  private taskQueue: Array<{
    id: string;
    type: string;
    payload: any;
    transfer?: Transferable[];
    resolve: (val: any) => void;
    reject: (err: any) => void;
  }> = [];
  private taskListeners = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private nextTaskId = 0;
  private workerBlobUrl: string | null = null;

  constructor() {
    this.detectSpecsAndInit();
    
    // Subscribe to adaptive concurrency changes
    EventBus.on('CONCURRENCY_CHANGE', ({ limit }) => {
      this.maxWorkers = limit;
      this.processQueue();
    });
  }

  private createAndAddWorker(): Worker | null {
    if (!this.workerBlobUrl) return null;
    try {
      const worker = new Worker(this.workerBlobUrl);
      worker.onmessage = (e) => this.handleWorkerMessage(e);
      this.workers.push(worker);
      return worker;
    } catch (err) {
      console.error('[WorkerPool] Failed to spawn dynamic worker', err);
      return null;
    }
  }

  private detectSpecsAndInit() {
    if (typeof window === 'undefined') return;

    this.maxWorkers = AdaptiveConcurrency.getLimit();

    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      this.workerBlobUrl = URL.createObjectURL(blob);

      for (let i = 0; i < this.maxWorkers; i++) {
        this.createAndAddWorker();
      }
    } catch (err) {
      console.error('[WorkerPool] Failed to spawn workers, falling back to synchronous main thread', err);
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    const { id, success, payload, error } = e.data;
    const listener = this.taskListeners.get(id);
    if (listener) {
      this.taskListeners.delete(id);
      this.activeWorkers--;
      
      if (success) {
        listener.resolve(payload);
      } else {
        listener.reject(new Error(error));
      }
      
      this.processQueue();
    }
  }

  private processQueue() {
    if (this.taskQueue.length === 0 || this.activeWorkers >= this.maxWorkers) {
      return;
    }

    let worker = this.workers[this.activeWorkers % Math.max(1, this.workers.length)];
    if (!worker && this.workers.length < this.maxWorkers) {
      worker = this.createAndAddWorker()!;
    }
    if (!worker) return;

    const task = this.taskQueue.shift()!;
    this.activeWorkers++;
    this.taskListeners.set(task.id, { resolve: task.resolve, reject: task.reject });
    
    worker.postMessage({
      id: task.id,
      type: task.type,
      payload: task.payload
    }, task.transfer || []);
  }

  /**
   * Runs a task in the worker pool with support for retry limit, timeouts, and cancellation.
   */
  public runTask(
    type: string,
    payload: any,
    transfer?: Transferable[],
    options?: { signal?: AbortSignal; timeoutMs?: number; retries?: number }
  ): Promise<any> {
    const retriesLeft = options?.retries ?? 0;
    
    return new Promise((resolve, reject) => {
      const executeTask = (attempt: number) => {
        const id = `task_${this.nextTaskId++}_\${Date.now()}`;
        let timeoutId: any = null;

        // Abort check
        if (options?.signal?.aborted) {
          reject(new DOMException('Aborted runTask', 'AbortError'));
          return;
        }

        const cleanup = () => {
          if (timeoutId) clearTimeout(timeoutId);
          if (options?.signal) {
            options.signal.removeEventListener('abort', onAbort);
          }
        };

        const onAbort = () => {
          cleanup();
          // Remove from taskQueue if not running yet
          const qIdx = this.taskQueue.findIndex((t) => t.id === id);
          if (qIdx !== -1) {
            this.taskQueue.splice(qIdx, 1);
          }
          this.taskListeners.delete(id);
          reject(new DOMException('Aborted runTask', 'AbortError'));
        };

        if (options?.signal) {
          options.signal.addEventListener('abort', onAbort);
        }

        if (options?.timeoutMs) {
          timeoutId = setTimeout(() => {
            cleanup();
            const qIdx = this.taskQueue.findIndex((t) => t.id === id);
            if (qIdx !== -1) {
              this.taskQueue.splice(qIdx, 1);
            }
            this.taskListeners.delete(id);

            if (attempt < retriesLeft) {
              console.warn(`[WorkerPool] Task \${type} timed out. Retrying (attempt \${attempt + 1}/\${retriesLeft})...`);
              executeTask(attempt + 1);
            } else {
              reject(new Error(`Task \${type} timed out after \${options.timeoutMs}ms`));
            }
          }, options.timeoutMs);
        }

        const taskResolve = (val: any) => {
          cleanup();
          resolve(val);
        };

        const taskReject = (err: any) => {
          cleanup();
          if (attempt < retriesLeft) {
            console.warn(`[WorkerPool] Task \${type} failed: \${err.message}. Retrying (attempt \${attempt + 1}/\${retriesLeft})...`);
            executeTask(attempt + 1);
          } else {
            reject(err);
          }
        };

        this.taskQueue.push({ id, type, payload, transfer, resolve: taskResolve, reject: taskReject });
        this.processQueue();
      };

      executeTask(0);
    });
  }

  public terminate() {
    this.workers.forEach(w => w.terminate());
    this.workers = [];
    if (this.workerBlobUrl) {
      URL.revokeObjectURL(this.workerBlobUrl);
    }
  }
}

export const WorkerPool = new CentralWorkerPool();
