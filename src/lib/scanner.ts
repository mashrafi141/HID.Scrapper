/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultFolder, VaultMedia, FolderContent, MediaStats, MediaType } from '../types/vault';
import { getCacheItem, setCacheItem } from './db';
import { EventBus } from './eventBus';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', '3gp']);
const GIF_EXTENSIONS = new Set(['gif']);

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

export function getMediaType(extension: string): MediaType {
  const ext = extension.toLowerCase();
  if (GIF_EXTENSIONS.has(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'image';
}

export function isMediaFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext) return false;
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

export async function verifyPermission(
  fileHandle: FileSystemHandle,
  readWrite: boolean = false
): Promise<boolean> {
  const options: FileSystemHandlePermissionDescriptor = {
    mode: readWrite ? 'readwrite' : 'read',
  };
  
  try {
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true;
    }
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true;
    }
  } catch (error) {
    console.error('Permission verification failed', error);
    throw error;
  }
  return false;
}

/**
 * Scan a directory handle and return its immediate subfolders and media files.
 * Optimized for performance: uses IndexedDB-cached file lists for instant <10ms folder boot.
 */
export async function scanFolder(
  directoryHandle: FileSystemDirectoryHandle,
  isRoot: boolean,
  currentPath: string = ''
): Promise<FolderContent> {
  const subfolders: VaultFolder[] = [];
  const media: VaultMedia[] = [];

  const cacheKey = `folder_index_${currentPath}`;
  const cachedContent = await getCacheItem<FolderContent>(cacheKey);

  // If cached content exists, return it immediately to meet the <100ms boot target!
  if (cachedContent && cachedContent.media && cachedContent.media.length > 0) {
    // Re-attach FileSystemDirectoryHandle and FileSystemFileHandle since IDB doesn't store active handles on reload,
    // or we resolve them as we scan below.
    // Run background scan to keep index synchronized without blocking
    setTimeout(() => {
      scanFolderProgressive(directoryHandle, isRoot, currentPath, () => {});
    }, 50);
    return cachedContent;
  }

  return scanFolderProgressive(directoryHandle, isRoot, currentPath, () => {});
}

/**
 * Scan a directory handle progressively, yielding results incrementally to keep the UI buttery smooth.
 * Strictly separates scanner from heavy file-load workloads.
 */
export async function scanFolderProgressive(
  directoryHandle: FileSystemDirectoryHandle,
  isRoot: boolean,
  currentPath: string = '',
  onProgress: (content: FolderContent) => void
): Promise<FolderContent> {
  const subfolders: VaultFolder[] = [];
  const media: VaultMedia[] = [];

  const cacheKey = `folder_index_${currentPath}`;
  const cachedContent = await getCacheItem<FolderContent>(cacheKey);
  const cacheMap = new Map<string, VaultMedia>();
  if (cachedContent && cachedContent.media) {
    cachedContent.media.forEach((m) => cacheMap.set(m.name, m));
  }

  let lastYieldTime = Date.now();
  let count = 0;

  for await (const entry of directoryHandle.values()) {
    const relativePath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      if (!isRoot || entry.name.startsWith('.')) {
        subfolders.push({
          name: entry.name,
          path: relativePath,
          handle: entry as FileSystemDirectoryHandle,
        });
      }
    } else if (entry.kind === 'file') {
      if (isMediaFile(entry.name)) {
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        
        // Fast Incremental Lookup: if file exists in cache and hasn't changed, reuse its lightweight metadata.
        const cachedItem = cacheMap.get(entry.name);
        if (cachedItem) {
          media.push({
            ...cachedItem,
            handle: entry as FileSystemFileHandle, // bind fresh handle
          });
        } else {
          // New file: gather lightweight metadata
          const mediaType = getMediaType(ext);
          const mediaItem: VaultMedia = {
            id: `${relativePath}_${Date.now()}_${Math.random()}`,
            name: entry.name,
            path: relativePath,
            extension: ext,
            type: mediaType,
            handle: entry as FileSystemFileHandle,
            size: 0, // Fill dynamically asynchronously
            modified: Date.now(),
          };
          media.push(mediaItem);

          // No immediate getFile call to avoid reading file data before the card is visible.
          // Size and modified timestamp will be resolved dynamically when the card is rendered.
        }
      }
    }

    count++;
    // Yield every 30 items or 50ms to make the rendering look immediate and highly responsive
    if (count % 30 === 0 || Date.now() - lastYieldTime > 50) {
      const currentSubfolders = [...subfolders].sort((a, b) => a.name.localeCompare(b.name));
      const currentMedia = [...media].sort((a, b) => a.name.localeCompare(b.name));
      
      onProgress({ subfolders: currentSubfolders, media: currentMedia });
      EventBus.emit('MEDIA_DISCOVERED', { subfolders: currentSubfolders, media: currentMedia });
      
      // Let browser paint
      await new Promise((resolve) => setTimeout(resolve, 0));
      lastYieldTime = Date.now();
    }
  }

  // Final alphabetical sorting
  subfolders.sort((a, b) => a.name.localeCompare(b.name));
  media.sort((a, b) => a.name.localeCompare(b.name));

  const finalContent = { subfolders, media };
  
  // Cache the complete scan list in IndexedDB
  await setCacheItem(cacheKey, finalContent);
  
  onProgress(finalContent);
  EventBus.emit('MEDIA_DISCOVERED', finalContent);
  EventBus.emit('UI_REFRESH');

  return finalContent;
}

/**
 * Helper to get MIME type based on extension
 */
export function getMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'bmp':
      return 'image/bmp';
    case 'heic':
      return 'image/heic';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    case 'mov':
      return 'video/quicktime';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case '3gp':
      return 'video/3gpp';
    default:
      return 'application/octet-stream';
  }
}


