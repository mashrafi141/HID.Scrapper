/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia, FolderContent } from '../types/vault';
import { EventBus } from './eventBus';
import { ThumbnailManager } from './thumbnailManager';
import { VideoManager } from './videoManager';
import { isMediaFile, getMediaType } from './scanner';
import { setCacheItem, getCacheItem } from './db';

class BackgroundIndexer {
  private isRunning = false;
  private isPaused = false;
  private totalFilesDiscovered = 0;
  private totalFilesIndexed = 0;
  private activeIndexTimer: any = null;

  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Pause background indexing during heavy tasks like fullscreen video playback or scrolling
    EventBus.on('FULLSCREEN_OPEN', () => {
      this.isPaused = true;
    });

    EventBus.on('FULLSCREEN_CLOSE', () => {
      this.isPaused = false;
    });
  }

  public async startIndexing(rootHandle: FileSystemDirectoryHandle) {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isPaused = false;
    this.totalFilesDiscovered = 0;
    this.totalFilesIndexed = 0;

    EventBus.emit('INDEXING_START');

    try {
      await this.traverseAndIndex(rootHandle, '');
    } catch (err) {
      console.error('[BackgroundIndexer] Background indexing error:', err);
    } finally {
      this.isRunning = false;
      EventBus.emit('INDEXING_COMPLETE', {
        discovered: this.totalFilesDiscovered,
        indexed: this.totalFilesIndexed
      });
    }
  }

  private async traverseAndIndex(dirHandle: FileSystemDirectoryHandle, currentPath: string) {
    // Respect pause state and yield control
    while (this.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const subfolderHandles: FileSystemDirectoryHandle[] = [];
    const mediaList: VaultMedia[] = [];

    try {
      for await (const entry of dirHandle.values()) {
        const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        if (entry.kind === 'directory') {
          if (!entry.name.startsWith('.')) {
            subfolderHandles.push(entry as FileSystemDirectoryHandle);
          }
        } else if (entry.kind === 'file') {
          if (isMediaFile(entry.name)) {
            const ext = entry.name.split('.').pop()?.toLowerCase() || '';
            const mediaType = getMediaType(ext);

            const mediaItem: VaultMedia = {
              id: `${relativePath}_index`,
              name: entry.name,
              path: relativePath,
              extension: ext,
              type: mediaType,
              handle: entry as FileSystemFileHandle,
              size: 0,
              modified: Date.now()
            };

            mediaList.push(mediaItem);
            this.totalFilesDiscovered++;
          }
        }
      }

      // 1. Process files in this directory with a yield to keep main thread completely responsive
      for (const media of mediaList) {
        while (this.isPaused) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        try {
          // Do not perform background file reads or background thumbnail generation for invisible files.
          // This keeps disk access and CPU resources completely free for the active visible viewport.
          this.totalFilesIndexed++;
          if (this.totalFilesIndexed % 5 === 0) {
            EventBus.emit('INDEXING_PROGRESS', {
              discovered: this.totalFilesDiscovered,
              indexed: this.totalFilesIndexed,
              currentFolder: currentPath || 'Root'
            });
            // Yield execution to the browser main thread
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
        } catch (e) {
          // Skip file if unreadable
        }
      }

      // 2. Recurse subfolders
      for (const subfolder of subfolderHandles) {
        const subPath = currentPath ? `${currentPath}/${subfolder.name}` : subfolder.name;
        await this.traverseAndIndex(subfolder, subPath);
      }

    } catch (err) {
      console.warn('[BackgroundIndexer] Error scanning directory:', currentPath, err);
    }
  }

  public getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      discovered: this.totalFilesDiscovered,
      indexed: this.totalFilesIndexed
    };
  }
}

export const BackgroundIndexingService = new BackgroundIndexer();
export type { BackgroundIndexer };
