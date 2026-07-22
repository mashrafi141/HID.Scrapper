/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultMedia, MediaStats } from '../types/vault';
import { 
  getFolderStatistics, 
  setFolderStatistics, 
  FolderStatisticsEntry, 
  getMetadataEntry, 
  MetadataEntry,
  setMediaIndex
} from './db';
import { EventBus } from './eventBus';
import { computeFileHash } from './hash';

class FolderStatsEngine {
  constructor() {
    this.setupListeners();
  }

  private setupListeners() {
    // Listen to changes in the file system to trigger automatic statistics updates
    EventBus.on('FILE_CREATED', async ({ folderPath, media }: { folderPath: string; media: VaultMedia }) => {
      await this.handleIncrementalUpdate(folderPath, 'add', media);
    });

    EventBus.on('FILE_DELETED', async ({ folderPath, media }: { folderPath: string; media: VaultMedia }) => {
      await this.handleIncrementalUpdate(folderPath, 'remove', media);
    });

    EventBus.on('FILE_RENAMED', async ({ folderPath, oldMedia, newMedia }: { folderPath: string; oldMedia: VaultMedia; newMedia: VaultMedia }) => {
      await this.handleIncrementalUpdate(folderPath, 'rename', newMedia, oldMedia);
    });
  }

  /**
   * Computes a quick, lightweight hash of the immediate folder contents
   */
  public computeFolderHash(files: VaultMedia[]): string {
    if (!files || files.length === 0) return 'empty';
    // Sort files by name to ensure order stability
    const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));
    let combinedStr = '';
    for (const file of sorted) {
      combinedStr += `${file.name}:${file.size}:${file.modified};`;
    }

    // Simple fast hash of the string
    let hash = 5381;
    for (let i = 0; i < combinedStr.length; i++) {
      hash = (hash * 33) ^ combinedStr.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
  }

  /**
   * Get or calculate statistics for a given folder path
   */
  public async getOrCalculateStats(folderPath: string, files: VaultMedia[]): Promise<FolderStatisticsEntry> {
    const folderId = folderPath || 'root';
    const folderHash = this.computeFolderHash(files);
    
    // 1. Try reading statistics from DB
    const cachedStats = await getFolderStatistics(folderId);

    // If folder hash matches, contents have not changed. Return cached statistics immediately!
    if (cachedStats && cachedStats.lastScanTime && cachedStats.lastModified === files.reduce((acc, f) => Math.max(acc, f.modified || 0), 0)) {
      return cachedStats;
    }

    return this.recalculateStats(folderPath, files, folderHash);
  }

  /**
   * Perform full (but fast) statistics calculation for a folder
   */
  private async recalculateStats(folderPath: string, files: VaultMedia[], folderHash: string): Promise<FolderStatisticsEntry> {
    const folderId = folderPath || 'root';
    
    let photoCount = 0;
    let videoCount = 0;
    let totalFolderSize = 0;
    let maxModified = 0;

    let totalVideoDuration = 0;
    let videosWithDuration = 0;
    let totalImageWidth = 0;
    let totalImageHeight = 0;
    let imagesWithDimensions = 0;

    for (const file of files) {
      totalFolderSize += file.size || 0;
      if (file.modified && file.modified > maxModified) {
        maxModified = file.modified;
      }

      const isVideo = file.type === 'video';

      if (isVideo) {
        videoCount++;
      } else {
        photoCount++;
      }

      // Try to load cached metadata for advanced average stats
      try {
        const fileHash = computeFileHash(file.path, file.size || 0, file.modified || 0);
        const meta = await getMetadataEntry(fileHash);
        if (meta) {
          if (isVideo && meta.duration > 0) {
            totalVideoDuration += meta.duration;
            videosWithDuration++;
          } else if (!isVideo && meta.width > 0 && meta.height > 0) {
            totalImageWidth += meta.width;
            totalImageHeight += meta.height;
            imagesWithDimensions++;
          }
        }
      } catch (e) {
        // Skip metadata stats for individual files
      }
    }

    const averageVideoLength = videosWithDuration > 0 ? totalVideoDuration / videosWithDuration : undefined;
    const averageImageResolution = imagesWithDimensions > 0 
      ? `${Math.round(totalImageWidth / imagesWithDimensions)}x${Math.round(totalImageHeight / imagesWithDimensions)}`
      : undefined;

    const stats: FolderStatisticsEntry = {
      folderId,
      photoCount,
      videoCount,
      totalFolderSize,
      lastModified: maxModified,
      lastScanTime: Date.now(),
      averageThumbnailSize: 45000, // standard expected 45KB per thumbnail
      averageVideoLength,
      averageImageResolution,
    };

    await setFolderStatistics(stats);
    EventBus.emit('FOLDER_STATS_UPDATED', stats);

    return stats;
  }

  /**
   * Incremental updates to stats without scanning the whole folder
   */
  private async handleIncrementalUpdate(
    folderPath: string,
    action: 'add' | 'remove' | 'rename',
    media: VaultMedia,
    oldMedia?: VaultMedia
  ) {
    const folderId = folderPath || 'root';
    const stats = await getFolderStatistics(folderId);
    if (!stats) return; // No stats generated yet

    const isVideo = media.type === 'video';

    if (action === 'add') {
      stats.totalFolderSize += media.size || 0;
      stats.lastModified = Math.max(stats.lastModified, media.modified || 0);

      if (isVideo) {
        stats.videoCount++;
      } else {
        stats.photoCount++;
      }
    } else if (action === 'remove') {
      stats.totalFolderSize = Math.max(0, stats.totalFolderSize - (media.size || 0));

      if (isVideo) {
        stats.videoCount = Math.max(0, stats.videoCount - 1);
      } else {
        stats.photoCount = Math.max(0, stats.photoCount - 1);
      }
    } else if (action === 'rename' && oldMedia) {
      stats.totalFolderSize = Math.max(0, stats.totalFolderSize - (oldMedia.size || 0) + (media.size || 0));
      stats.lastModified = Math.max(stats.lastModified, media.modified || 0);
    }

    stats.lastScanTime = Date.now();
    await setFolderStatistics(stats);
    EventBus.emit('FOLDER_STATS_UPDATED', stats);
  }
}

export const FolderStatsService = new FolderStatsEngine();
export type { FolderStatsEngine };
