/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */


const DB_NAME = 'MyVaultDB';
const DB_VERSION = 2; // Incremented version to support new object stores

export const STORE_HANDLES = 'handles';
export const STORE_METADATA = 'metadata'; // legacy cache store

// New production-grade object stores
export const STORE_MEDIA_INDEX = 'MediaIndex';
export const STORE_FOLDER_INDEX = 'FolderIndex';
export const STORE_METADATA_DB = 'Metadata';
export const STORE_THUMBNAIL_CACHE = 'ThumbnailCache';
export const STORE_FOLDER_STATS = 'FolderStatistics';
export const STORE_CACHE_INFO = 'CacheInfo';

export interface MediaIndexEntry {
  id: string; // key (usually unique path)
  hash: string;
  originalPath: string;
  currentPath: string;
  fileName: string;
  extension: string;
  size: number;
  modifiedTime: number;
  createdTime: number;
  mediaType: 'image' | 'video' | 'gif';
  folderId: string;
  thumbnailId?: string;
  metadataId?: string;
}

export interface FolderIndexEntry {
  folderId: string; // key
  folderPath: string;
  folderHash: string;
  lastScan: number;
  totalFiles: number;
  normalFiles: number;
  thumbnailVersion: number;
  scanVersion: number;
}

export interface MetadataEntry {
  id: string; // key (usually file hash)
  width: number;
  height: number;
  rotation: number;
  orientation: number;
  duration: number;
  codec: string;
  bitrate: number;
  fps: number;
  audioChannels: number;
}

export interface ThumbnailCacheEntry {
  thumbnailHash: string; // key
  generationTime: number;
  resolution: string;
  cacheVersion: number;
  thumbnailUrl: string; // Base64 data-url
}

export interface FolderStatisticsEntry {
  folderId: string; // key (usually relative path)
  photoCount: number;
  videoCount: number;
  totalFolderSize: number;
  lastModified: number;
  lastScanTime: number;
  averageThumbnailSize?: number;
  averageVideoLength?: number;
  averageImageResolution?: string;
}

export interface CacheInfoEntry {
  id: string; // key (e.g. 'global')
  cacheHits: number;
  cacheMisses: number;
  lastAccess: number;
  generationVersion: number;
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // Backward compatibility: keep handles and metadata
      if (!db.objectStoreNames.contains(STORE_HANDLES)) {
        db.createObjectStore(STORE_HANDLES);
      }
      if (!db.objectStoreNames.contains(STORE_METADATA)) {
        db.createObjectStore(STORE_METADATA);
      }

      // Create new specialized stores if they do not exist
      if (!db.objectStoreNames.contains(STORE_MEDIA_INDEX)) {
        db.createObjectStore(STORE_MEDIA_INDEX, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDER_INDEX)) {
        db.createObjectStore(STORE_FOLDER_INDEX, { keyPath: 'folderId' });
      }
      if (!db.objectStoreNames.contains(STORE_METADATA_DB)) {
        db.createObjectStore(STORE_METADATA_DB, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_THUMBNAIL_CACHE)) {
        db.createObjectStore(STORE_THUMBNAIL_CACHE, { keyPath: 'thumbnailHash' });
      }
      if (!db.objectStoreNames.contains(STORE_FOLDER_STATS)) {
        db.createObjectStore(STORE_FOLDER_STATS, { keyPath: 'folderId' });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE_INFO)) {
        db.createObjectStore(STORE_CACHE_INFO, { keyPath: 'id' });
      }
    };
  });
}

// Low-level helper to write to a store
export async function dbPut<T>(storeName: string, value: T, key?: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = key ? store.put(value, key) : store.put(value);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Low-level helper to read from a store
export async function dbGet<T>(storeName: string, key: string): Promise<T | null> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

// Low-level helper to delete from a store
export async function dbDelete(storeName: string, key: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Low-level helper to get all items from a store
export async function dbGetAll<T>(storeName: string): Promise<T[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

// Low-level helper to clear a store
export async function dbClear(storeName: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// High-level handle management (backward-compatible)
export async function setDirectoryHandle(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  return dbPut(STORE_HANDLES, handle, key);
}

export async function getDirectoryHandle(key: string): Promise<FileSystemDirectoryHandle | null> {
  return dbGet(STORE_HANDLES, key);
}

export async function deleteDirectoryHandle(key: string): Promise<void> {
  return dbDelete(STORE_HANDLES, key);
}

// High-level generic cache item management (backward-compatible)
export async function setCacheItem<T>(key: string, value: T): Promise<void> {
  return dbPut(STORE_METADATA, value, key);
}

export async function getCacheItem<T>(key: string): Promise<T | null> {
  return dbGet(STORE_METADATA, key);
}

// Dedicated helpers for MediaIndex
export async function getMediaIndex(id: string): Promise<MediaIndexEntry | null> {
  return dbGet<MediaIndexEntry>(STORE_MEDIA_INDEX, id);
}

export async function setMediaIndex(entry: MediaIndexEntry): Promise<void> {
  return dbPut(STORE_MEDIA_INDEX, entry);
}

export async function deleteMediaIndex(id: string): Promise<void> {
  return dbDelete(STORE_MEDIA_INDEX, id);
}

export async function getAllMediaIndices(): Promise<MediaIndexEntry[]> {
  return dbGetAll<MediaIndexEntry>(STORE_MEDIA_INDEX);
}

// Dedicated helpers for FolderIndex
export async function getFolderIndex(folderId: string): Promise<FolderIndexEntry | null> {
  return dbGet<FolderIndexEntry>(STORE_FOLDER_INDEX, folderId);
}

export async function setFolderIndex(entry: FolderIndexEntry): Promise<void> {
  return dbPut(STORE_FOLDER_INDEX, entry);
}

// Dedicated helpers for Metadata DB
export async function getMetadataEntry(id: string): Promise<MetadataEntry | null> {
  return dbGet<MetadataEntry>(STORE_METADATA_DB, id);
}

export async function setMetadataEntry(entry: MetadataEntry): Promise<void> {
  return dbPut(STORE_METADATA_DB, entry);
}

// Dedicated helpers for ThumbnailCache
export async function getThumbnailCache(thumbnailHash: string): Promise<ThumbnailCacheEntry | null> {
  return dbGet<ThumbnailCacheEntry>(STORE_THUMBNAIL_CACHE, thumbnailHash);
}

export async function setThumbnailCache(entry: ThumbnailCacheEntry): Promise<void> {
  return dbPut(STORE_THUMBNAIL_CACHE, entry);
}

// Dedicated helpers for FolderStatistics
export async function getFolderStatistics(folderId: string): Promise<FolderStatisticsEntry | null> {
  return dbGet<FolderStatisticsEntry>(STORE_FOLDER_STATS, folderId);
}

export async function setFolderStatistics(entry: FolderStatisticsEntry): Promise<void> {
  return dbPut(STORE_FOLDER_STATS, entry);
}

// Dedicated helpers for CacheInfo
export async function getCacheInfo(id: string): Promise<CacheInfoEntry | null> {
  return dbGet<CacheInfoEntry>(STORE_CACHE_INFO, id);
}

export async function setCacheInfo(entry: CacheInfoEntry): Promise<void> {
  return dbPut(STORE_CACHE_INFO, entry);
}

// Track cache performance metrics helper
export async function recordCacheAccess(isHit: boolean): Promise<void> {
  const info = (await getCacheInfo('global')) || {
    id: 'global',
    cacheHits: 0,
    cacheMisses: 0,
    lastAccess: Date.now(),
    generationVersion: 1,
  };

  if (isHit) {
    info.cacheHits++;
  } else {
    info.cacheMisses++;
  }
  info.lastAccess = Date.now();
  await setCacheInfo(info);
}

export async function clearAllCache(): Promise<void> {
  const stores = [
    STORE_HANDLES,
    STORE_METADATA,
    STORE_MEDIA_INDEX,
    STORE_FOLDER_INDEX,
    STORE_METADATA_DB,
    STORE_THUMBNAIL_CACHE,
    STORE_FOLDER_STATS,
    STORE_CACHE_INFO,
  ];

  for (const store of stores) {
    try {
      await dbClear(store);
    } catch (e) {
      console.warn(`Failed to clear store ${store}:`, e);
    }
  }
}
