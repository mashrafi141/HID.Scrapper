/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { VaultFolder, VaultMedia, FolderContent, MediaStats } from '../types/vault';
import { 
  getDirectoryHandle, 
  setDirectoryHandle, 
  deleteDirectoryHandle, 
  getCacheItem, 
  setCacheItem 
} from '../lib/db';
import { 
  isFileSystemAccessSupported, 
  scanFolder, 
  scanFolderProgressive,
  verifyPermission, 
} from '../lib/scanner';
import { ThumbnailManager } from '../lib/thumbnailManager';
import { VideoManager } from '../lib/videoManager';
import { BackgroundIndexingService } from '../lib/backgroundIndexer';
import { FolderStatsService } from '../lib/folderStatsEngine';

export function useFileSystem() {
  const [isSupported] = useState(isFileSystemAccessSupported());
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionPromptNeeded, setPermissionPromptNeeded] = useState(false);
  const [loading, setLoading] = useState(false);

  // Navigation State
  const [currentPath, setCurrentPath] = useState<string>(''); // e.g. "", ".mal", ".mal/Photos"
  const [subfolders, setSubfolders] = useState<VaultFolder[]>([]);
  const [mediaFiles, setMediaFiles] = useState<VaultMedia[]>([]);
  const [folderStats, setFolderStats] = useState<Record<string, MediaStats>>({});

  // Navigation History Stack (contains folder paths and handles for instant back navigation)
  const [navHistory, setNavHistory] = useState<Array<{ path: string; handle: FileSystemDirectoryHandle }>>([]);

  // Active directory handle references
  const currentHandleRef = useRef<FileSystemDirectoryHandle | null>(null);

  // Load root folder from database on mount
  useEffect(() => {
    async function loadStoredRoot() {
      if (!isSupported) return;
      try {
        const storedHandle = await getDirectoryHandle('rootFolderHandle');
        if (storedHandle) {
          setRootHandle(storedHandle);
          // Query if we already have permission (browsers usually reject permission on reload)
          const perm = await storedHandle.queryPermission({ mode: 'read' });
          if (perm === 'granted') {
            setPermissionGranted(true);
            setPermissionPromptNeeded(false);
            currentHandleRef.current = storedHandle;
            await loadFolder(storedHandle, true, '');
          } else {
            setPermissionPromptNeeded(true);
            setPermissionGranted(false);
          }
        }
      } catch (error) {
        console.error('Failed to load stored directory handle:', error);
      }
    }
    loadStoredRoot();
  }, [isSupported]);

  // Request/verify folder permissions
  const requestPermission = useCallback(async (handleToRequest?: FileSystemDirectoryHandle) => {
    const targetHandle = handleToRequest || rootHandle;
    if (!targetHandle) return false;

    setLoading(true);
    try {
      const granted = await verifyPermission(targetHandle, false);
      if (granted) {
        setPermissionGranted(true);
        setPermissionPromptNeeded(false);
        if (!rootHandle) {
          setRootHandle(targetHandle);
          await setDirectoryHandle('rootFolderHandle', targetHandle);
        }
        currentHandleRef.current = targetHandle;
        setCurrentPath('');
        setNavHistory([]);
        await loadFolder(targetHandle, true, '');
        return true;
      }
    } catch (error) {
      console.error('Permission request failed:', error);
    } finally {
      setLoading(false);
    }
    return false;
  }, [rootHandle]);

  // Connect to a new folder
  const connectFolder = useCallback(async () => {
    if (!isSupported) return false;
    try {
      // @ts-ignore - showDirectoryPicker is standard on supported browsers
      const handle = await window.showDirectoryPicker();
      if (handle) {
        return await requestPermission(handle);
      }
    } catch (error: any) {
      // User aborted or security block
      console.warn('Folder selection aborted or failed:', error);
      if (error.name !== 'AbortError') {
        throw error; // Let component handle sandbox warning or sub-frame permission blocks
      }
    }
    return false;
  }, [isSupported, requestPermission]);

  // Disconnect connected folder
  const disconnectFolder = useCallback(async () => {
    await deleteDirectoryHandle('rootFolderHandle');
    setRootHandle(null);
    setPermissionGranted(false);
    setPermissionPromptNeeded(false);
    setSubfolders([]);
    setMediaFiles([]);
    setCurrentPath('');
    setNavHistory([]);
    setFolderStats({});
    currentHandleRef.current = null;
  }, []);

  // Scan a directory handle and update current folder state
  const loadFolder = useCallback(async (
    handle: FileSystemDirectoryHandle,
    isRootFolder: boolean,
    path: string
  ) => {
    setLoading(true);
    // Clear previous folder/media state immediately to avoid layout overlays or overlap during scan
    setSubfolders([]);
    setMediaFiles([]);
    
    try {
      let lastUpdate = Date.now();
      const content = await scanFolderProgressive(handle, isRootFolder, path, (incremental) => {
        const now = Date.now();
        // Throttle updates to at most once per 120ms or for small initial scans to avoid thrashing
        if (now - lastUpdate > 120 || incremental.subfolders.length + incremental.media.length < 50) {
          // Non-blocking warmup for progressive scans
          ThumbnailManager.warmupMemoryCache(incremental.media).then(() => {
            setSubfolders(incremental.subfolders);
            setMediaFiles(incremental.media);
          });
          lastUpdate = now;
        }
        // Turn off loading spinner as soon as we have some items to render
        // so the page is immediately interactive for the user!
        if (incremental.subfolders.length > 0 || incremental.media.length > 0) {
          setLoading(false);
        }
      });
      
      // Crucial: Warm up the full RAM cache before committing final folder media list
      await ThumbnailManager.warmupMemoryCache(content.media);
      
      setSubfolders(content.subfolders);
      setMediaFiles(content.media);
      setCurrentPath(path);
      currentHandleRef.current = handle;

      // Smart background prepare for visible folder videos to enable 0ms click start
      VideoManager.smartFolderPrepare(content.media);

      // Start fetching lazy stats for folders inside
      content.subfolders.forEach((folder) => {
        triggerStatsScan(folder);
      });

      // Start background indexing of the root folder
      if (isRootFolder) {
        BackgroundIndexingService.startIndexing(handle).catch((err) => {
          console.error('[useFileSystem] Background indexing failed:', err);
        });
      }
    } catch (error) {
      console.error('Failed to load folder:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Navigate to a subfolder
  const navigateToFolder = useCallback(async (folder: VaultFolder) => {
    if (!currentHandleRef.current) return;
    const previousHandle = currentHandleRef.current;
    const previousPath = currentPath;

    setNavHistory((prev) => [...prev, { path: previousPath, handle: previousHandle }]);
    await loadFolder(folder.handle, false, folder.path);
  }, [currentPath, loadFolder]);

  // Navigate back to the parent folder
  const navigateUp = useCallback(async () => {
    if (navHistory.length === 0) return;
    const newHistory = [...navHistory];
    const parent = newHistory.pop()!;
    setNavHistory(newHistory);
    await loadFolder(parent.handle, parent.path === '', parent.path);
  }, [navHistory, loadFolder]);

  // Navigate directly to a parent directory index from breadcrumbs
  const navigateToBreadcrumb = useCallback(async (index: number) => {
    if (index === -1) {
      // Navigate to root
      if (rootHandle) {
        setNavHistory([]);
        await loadFolder(rootHandle, true, '');
      }
      return;
    }

    if (index >= navHistory.length) return;
    const target = navHistory[index];
    const newHistory = navHistory.slice(0, index);
    setNavHistory(newHistory);
    await loadFolder(target.handle, target.path === '', target.path);
  }, [navHistory, rootHandle, loadFolder]);

  // Background stat scanning for folders
  const triggerStatsScan = useCallback(async (folder: VaultFolder) => {
    try {
      const content = await scanFolderProgressive(folder.handle, false, folder.path, () => {});
      const stats = await FolderStatsService.getOrCalculateStats(folder.path, content.media);
      setFolderStats((prev) => ({
        ...prev,
        [folder.path]: {
          photoCount: stats.photoCount,
          videoCount: stats.videoCount,
          totalFolderSize: stats.totalFolderSize,
          lastModified: stats.lastModified,
          lastScanTime: stats.lastScanTime,
          averageThumbnailSize: stats.averageThumbnailSize,
          averageVideoLength: stats.averageVideoLength,
          averageImageResolution: stats.averageImageResolution,
        },
      }));
    } catch (error) {
      console.error(`Stats scanning failed for ${folder.path}:`, error);
    }
  }, []);

  const refreshCurrentFolder = useCallback(async () => {
    if (currentHandleRef.current) {
      await loadFolder(currentHandleRef.current, currentPath === '', currentPath);
    }
  }, [currentPath, loadFolder]);

  return {
    isSupported,
    rootHandle,
    permissionGranted,
    permissionPromptNeeded,
    loading,
    currentPath,
    subfolders,
    mediaFiles,
    folderStats,
    navHistory,
    connectFolder,
    disconnectFolder,
    requestPermission,
    navigateToFolder,
    navigateUp,
    navigateToBreadcrumb,
    refreshCurrentFolder,
  };
}
