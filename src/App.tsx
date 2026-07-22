/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useTransition, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FolderClosed, ShieldCheck, Lock, Settings, RefreshCcw, 
  Search, Grid, CheckSquare, Trash2, ArrowUpLeft, Info, 
  ExternalLink, LogOut, Check, Sparkles, FolderUp, HelpCircle
} from 'lucide-react';
import { useFileSystem } from './hooks/useFileSystem';
import LockScreen from './components/LockScreen';
import FolderCard from './components/FolderCard';
import VirtualGrid from './components/VirtualGrid';
import FullScreenViewer from './components/FullScreenViewer';
import Breadcrumbs from './components/Breadcrumbs';
import SettingsScreen from './components/SettingsScreen';
import { clearMediaUrlCache } from './lib/mediaCache';
import { VaultMedia } from './types/vault';
import { ThumbnailManager } from './lib/thumbnailManager';
import { VideoManager } from './lib/videoManager';
import { PreloadEngine } from './lib/preloadEngine';

export default function App() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [activeScreen, setActiveScreen] = useState<'home' | 'folder' | 'settings'>('home');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Selection Mode State
  const [isInSelectionMode, setIsInSelectionMode] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<Record<string, VaultMedia>>({});

  // Active fullscreen image index
  const [activeViewerIndex, setActiveViewerIndex] = useState<number | null>(null);

  // Sandbox Security / Iframe Notice State
  const [showSandboxNotice, setShowSandboxNotice] = useState(false);
  const [isInIframe, setIsInIframe] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }
  }, []);

  // Force lock native screen orientation to portrait for native PWA mobile feel
  useEffect(() => {
    if (typeof window !== 'undefined' && window.screen && window.screen.orientation) {
      try {
        (window.screen.orientation as any).lock('portrait').catch(() => {});
      } catch (err) {}
    }
  }, []);

  // 1. Auto-Lock on App Background/Minimize (Background lock)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 2. Auto-Lock on User Inactivity (Lock Timer / Inactivity App Lock)
  useEffect(() => {
    if (!isUnlocked) return;

    let inactivityTimeout: NodeJS.Timeout;
    const INACTIVITY_DELAY = 5 * 60 * 1000; // 5 minutes standard auto-lock timer

    const resetInactivityTimer = () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      inactivityTimeout = setTimeout(() => {
        handleLock();
      }, INACTIVITY_DELAY);
    };

    // Events that register user activity
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    // Register listeners
    activityEvents.forEach((event) => {
      window.addEventListener(event, resetInactivityTimer);
    });

    // Initialize timer
    resetInactivityTimer();

    return () => {
      if (inactivityTimeout) clearTimeout(inactivityTimeout);
      activityEvents.forEach((event) => {
        window.removeEventListener(event, resetInactivityTimer);
      });
    };
  }, [isUnlocked]);

  // Transition for smooth non-blocking UI
  const [isPending, startTransition] = useTransition();

  const fs = useFileSystem();

  // Filter media files based on search input (declared early to support stable callbacks)
  const filteredMedia = fs.mediaFiles.filter((media) =>
    media.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Trigger background pre-generation of thumbnails when active folder's files load
  useEffect(() => {
    if (isUnlocked && fs.mediaFiles.length > 0) {
      PreloadEngine.setMediaList(fs.mediaFiles);
      ThumbnailManager.warmupMemoryCache(fs.mediaFiles.slice(0, 50)).catch(() => {});
    }
  }, [isUnlocked, fs.mediaFiles]);

  // History API Sync logic for premium native Android navigation emulation
  const isHandlingPopState = useRef(false);

  useEffect(() => {
    if (!isUnlocked) return;

    // Initialize or replace the first history entry
    if (!window.history.state) {
      window.history.replaceState({
        screen: activeScreen,
        path: fs.currentPath,
        viewerIndex: activeViewerIndex
      }, '');
    }
  }, [isUnlocked]);

  useEffect(() => {
    if (!isUnlocked) return;

    if (isHandlingPopState.current) {
      isHandlingPopState.current = false;
      return;
    }

    const currentState = {
      screen: activeScreen,
      path: fs.currentPath,
      viewerIndex: activeViewerIndex
    };

    const existingState = window.history.state;
    if (
      existingState &&
      existingState.screen === currentState.screen &&
      existingState.path === currentState.path &&
      existingState.viewerIndex === currentState.viewerIndex
    ) {
      return;
    }

    window.history.pushState(currentState, '');
  }, [isUnlocked, activeScreen, fs.currentPath, activeViewerIndex]);

  useEffect(() => {
    if (!isUnlocked) return;

    const handlePopState = (e: PopStateEvent) => {
      const state = e.state;
      if (!state) return;

      isHandlingPopState.current = true;

      // 1. Sync active fullscreen viewer index
      if (state.viewerIndex !== activeViewerIndex) {
        setActiveViewerIndex(state.viewerIndex);
      }

      // 2. Sync Screen Type (Settings, Dashboard etc)
      if (state.screen !== activeScreen) {
        setActiveScreen(state.screen);
      }

      // 3. Sync Folder directory path
      if (state.path !== fs.currentPath) {
        const targetIndex = fs.navHistory.findIndex((item) => item.path === state.path);
        if (targetIndex !== -1) {
          fs.navigateToBreadcrumb(targetIndex);
        } else if (state.path === '') {
          fs.navigateToBreadcrumb(-1); // Go to root vault
        } else {
          fs.navigateUp();
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isUnlocked, activeScreen, fs.currentPath, activeViewerIndex, fs.navHistory, fs.navigateToBreadcrumb, fs.navigateUp]);


  // Clear media Object URL caches when switching screens or folders to optimize memory
  useEffect(() => {
    return () => {
      clearMediaUrlCache();
    };
  }, [fs.currentPath]);

  const handleUnlock = () => {
    setIsUnlocked(true);
  };

  const handleLock = () => {
    setIsUnlocked(false);
    clearMediaUrlCache();
    VideoManager.clearAllCaches();
  };

  // Re-verify permission on click
  const handleReconnect = async () => {
    if (isInIframe) {
      setShowSandboxNotice(true);
      return false;
    }
    try {
      const success = await fs.requestPermission();
      return success;
    } catch (err: any) {
      console.error('Reconnect error:', err);
      setShowSandboxNotice(true);
      return false;
    }
  };

  // Select a new root folder
  const handleConnectFolder = async () => {
    if (isInIframe) {
      setShowSandboxNotice(true);
      return false;
    }
    try {
      setShowSandboxNotice(false);
      const success = await fs.connectFolder();
      if (success) {
        setActiveScreen('home');
      }
      return success;
    } catch (err: any) {
      console.error('Connection error:', err);
      setShowSandboxNotice(true);
      return false;
    }
  };

  // Media Select toggle helper
  const handleSelectMedia = useCallback((media: VaultMedia) => {
    setSelectedMedia((prev) => {
      const next = { ...prev };
      if (next[media.path]) {
        delete next[media.path];
      } else {
        next[media.path] = media;
      }
      // If nothing is selected anymore, exit selection mode
      if (Object.keys(next).length === 0) {
        setIsInSelectionMode(false);
      }
      return next;
    });
  }, []);

  // Stable media viewer open handler
  const handleOpenMedia = useCallback((media: VaultMedia) => {
    const idx = filteredMedia.findIndex((m) => m.path === media.path);
    if (idx !== -1) {
      setActiveViewerIndex(idx);
    }
  }, [filteredMedia]);

  const toggleSelectAll = () => {
    if (Object.keys(selectedMedia).length === filteredMedia.length) {
      // Clear All
      setSelectedMedia({});
      setIsInSelectionMode(false);
    } else {
      // Select All
      const next: Record<string, VaultMedia> = {};
      filteredMedia.forEach((media) => {
        next[media.path] = media;
      });
      setSelectedMedia(next);
      setIsInSelectionMode(true);
    }
  };

  // Real physical deletion from connected folder direct on device!
  const handleDeleteMedia = async (targetMediaList: VaultMedia[]) => {
    if (targetMediaList.length === 0) return;
    const count = targetMediaList.length;
    const confirmMsg = count === 1 
      ? `Are you sure you want to PERMANENTLY delete "${targetMediaList[0].name}" directly from your device? This cannot be undone.`
      : `Are you sure you want to PERMANENTLY delete these ${count} files directly from your device? This cannot be undone.`;

    if (window.confirm(confirmMsg)) {
      let deletedCount = 0;
      for (const media of targetMediaList) {
        try {
          // Deleting via File System Access API
          // We need to request write permission first
          const options: FileSystemHandlePermissionDescriptor = { mode: 'readwrite' };
          const writeGranted = (await fs.rootHandle?.queryPermission(options)) === 'granted' || 
                               (await fs.rootHandle?.requestPermission(options)) === 'granted';
          
          if (!writeGranted) {
            alert('Write permissions denied. Cannot delete file.');
            break;
          }

          // Traverse to parent folder to call removeEntry
          let targetFolderHandle = fs.rootHandle;
          const segments = media.path.split('/');
          const fileName = segments.pop()!;

          // Find correct subfolder handle
          if (segments.length > 0) {
            // Traverse down to correct directory
            let currentDir = fs.rootHandle;
            for (const segment of segments) {
              if (currentDir) {
                currentDir = await currentDir.getDirectoryHandle(segment);
              }
            }
            targetFolderHandle = currentDir;
          }

          if (targetFolderHandle) {
            await targetFolderHandle.removeEntry(fileName);
            deletedCount++;
          }
        } catch (error) {
          console.error(`Deletion failed for ${media.name}:`, error);
        }
      }

      // Refresh UI state
      setSelectedMedia({});
      setIsInSelectionMode(false);
      setActiveViewerIndex(null);
      await fs.refreshCurrentFolder();

      // Short delay success feedback
      alert(`Successfully deleted ${deletedCount} files from your storage.`);
    }
  };

  return (
    <div id="main-root" className="min-h-screen bg-slate-950 text-white font-sans overflow-x-hidden antialiased select-none">
      {/* 1. Sandbox Block Notice / Helper Popup */}
      <AnimatePresence>
        {showSandboxNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 10 }}
              className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-5"
            >
              <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
                <ExternalLink className="h-7 w-7" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold">Iframe Permission Sandbox Blocked</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Because this application is rendered inside a sandboxed browser iframe, access to your local physical device folders is restricted for your security.
                </p>
                <p className="text-xs text-slate-300 font-semibold bg-indigo-950/30 border border-indigo-900/30 p-2.5 rounded-xl">
                  Please open the app in a full browser tab where the File System Access API can run securely!
                </p>
              </div>
              <div className="flex flex-col gap-2.5">
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-sm rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <span>Open in New Tab</span>
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button
                  onClick={() => setShowSandboxNotice(false)}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Dismiss Warning
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Security Lock Screen Overlay */}
      <AnimatePresence>
        {!isUnlocked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <LockScreen onUnlock={handleUnlock} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Main Dashboard Screens (visible only when unlocked) */}
      {isUnlocked && (
        <div className="flex flex-col min-h-screen">
          {/* Main Top Header Navigation */}
          {activeScreen !== 'settings' && (
            <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-900 bg-slate-950/85 backdrop-blur-md px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-emerald-400 p-0.5 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                  <div className="w-full h-full rounded-[10px] bg-slate-950 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight">HID.Scrapper</h2>
                  <p className="text-[9px] font-mono text-emerald-400 flex items-center gap-1 uppercase tracking-widest font-semibold">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>SECURE OFFLINE</span>
                  </p>
                </div>
              </div>

              {/* Toolbar Controls */}
              <div className="flex items-center gap-2">
                <button
                  id="btn-nav-settings"
                  onClick={() => setActiveScreen('settings')}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Open Settings"
                >
                  <Settings className="h-4.5 w-4.5" />
                </button>
                <button
                  id="btn-nav-lock"
                  onClick={handleLock}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Lock application"
                >
                  <LogOut className="h-4.5 w-4.5 text-rose-400" />
                </button>
              </div>
            </header>
          )}

          {/* Core App View Routers */}
          <main className="flex-1">
            {activeScreen === 'settings' ? (
              <SettingsScreen
                rootFolderName={fs.rootHandle?.name}
                onBack={() => setActiveScreen('home')}
                onReconnect={handleReconnect}
                onChangeFolder={handleConnectFolder}
                onClearCache={fs.disconnectFolder}
                onLockApp={handleLock}
              />
            ) : !fs.rootHandle ? (
              /* No folder connected state: Landing page */
              <div className="max-w-md mx-auto px-6 py-16 flex flex-col items-center justify-center text-center space-y-8 select-none">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring' }}
                  className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-indigo-500/10 to-emerald-400/10 border border-slate-800 shadow-xl flex items-center justify-center text-indigo-400"
                >
                  <FolderClosed className="h-10 w-10 animate-bounce-slow" />
                </motion.div>

                <div className="space-y-3">
                  <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                    Connect Your Gallery Folder
                  </h1>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Select a folder from your local physical disk storage. HID.Scrapper scans and indexes media fully offline right on your device.
                  </p>
                </div>

                <div className="w-full p-5 rounded-2xl border border-slate-800/40 bg-slate-900/20 backdrop-blur-md text-left space-y-3.5">
                  <div className="flex gap-3 text-xs text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>All parsing and caching is 100% server-free & offline</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Scans files instantly using native high-speed browser threads</span>
                  </div>
                  <div className="flex gap-3 text-xs text-slate-300">
                    <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>Handles 30GB+ massive vaults with zero UI freezes</span>
                  </div>
                </div>

                {isInIframe && (
                  <div className="w-full p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 text-left space-y-2 select-none">
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
                      <HelpCircle className="h-4 w-4" />
                      <span>Sandbox / Iframe Mode Active</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Browsers block folder selection inside sandboxed subframes for your security. Please open the app in a dedicated tab to connect folders.
                    </p>
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-extrabold text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <span>Open App in New Tab</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                )}

                <button
                  id="btn-connect-vault"
                  onClick={handleConnectFolder}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-emerald-500 hover:opacity-95 text-slate-950 font-bold rounded-xl shadow-lg shadow-indigo-500/15 cursor-pointer transition-all flex items-center justify-center gap-2"
                >
                  <FolderUp className="h-4.5 w-4.5" />
                  <span>Choose Folder Handle</span>
                </button>
              </div>
            ) : fs.permissionPromptNeeded ? (
              /* Stored folder exists, but permission state is locked/prompt required */
              <div className="max-w-md mx-auto px-6 py-20 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Lock className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">Unlock Vault Folder</h2>
                  <p className="text-xs text-slate-400">
                    HID.Scrapper needs permission to browse your connected folder:
                  </p>
                  <p className="text-sm text-indigo-400 font-mono bg-slate-900 border border-slate-800 p-2 rounded-xl mt-1.5 font-bold truncate max-w-sm">
                    {fs.rootHandle.name}
                  </p>
                </div>
                <button
                  id="btn-unlock-permission"
                  onClick={handleReconnect}
                  className="w-full py-3 bg-gradient-to-r from-indigo-500 to-emerald-500 text-slate-950 font-bold rounded-xl cursor-pointer hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCcw className="h-4 w-4" />
                  <span>Grant Access Permission</span>
                </button>
                <button
                  onClick={fs.disconnectFolder}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  Disconnect and change folder
                </button>
              </div>
            ) : (
              /* Active authorized state: Folders & Media content rendering */
              <div className="px-6 py-6 space-y-6 max-w-6xl mx-auto">
                
                {/* Breadcrumbs stack */}
                <Breadcrumbs
                  currentPath={fs.currentPath}
                  onNavigate={fs.navigateToBreadcrumb}
                />

                {/* Subfolder sections inside current folder view */}
                {fs.subfolders.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <FolderClosed className="h-4 w-4 text-indigo-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Folders ({fs.subfolders.length})
                      </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {fs.subfolders.map((folder) => (
                        <FolderCard
                          key={folder.path}
                          folder={folder}
                          stats={fs.folderStats[folder.path]}
                          onClick={() => {
                            fs.navigateToFolder(folder);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Media assets grid inside current folder view */}
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
                    <div className="flex items-center gap-2">
                      <Grid className="h-4 w-4 text-emerald-400" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Vault Media ({filteredMedia.length})
                      </h3>
                    </div>

                    {/* Quick Search bar filter */}
                    {fs.mediaFiles.length > 0 && (
                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-500" />
                        <input
                          id="search-media"
                          type="text"
                          placeholder="Search media files..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    )}
                  </div>

                  {/* Multi-selection bar HUD overlay */}
                  {fs.mediaFiles.length > 0 && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-900/30 border border-slate-900 text-xs">
                      <button
                        id="btn-toggle-select"
                        onClick={() => {
                          setIsInSelectionMode(!isInSelectionMode);
                          setSelectedMedia({});
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-colors cursor-pointer
                          ${isInSelectionMode 
                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400 font-semibold' 
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                          }
                        `}
                      >
                        <CheckSquare className="h-3.5 w-3.5" />
                        <span>Selection Mode</span>
                      </button>

                      {isInSelectionMode && (
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-indigo-300 font-bold">
                            {Object.keys(selectedMedia).length} Selected
                          </span>
                          <button
                            id="btn-select-all"
                            onClick={toggleSelectAll}
                            className="px-2.5 py-1 text-slate-300 hover:text-white font-semibold transition-colors cursor-pointer border border-slate-800 rounded"
                          >
                            {Object.keys(selectedMedia).length === filteredMedia.length ? 'Clear All' : 'Select All'}
                          </button>
                          <button
                            id="btn-bulk-delete"
                            onClick={() => handleDeleteMedia(Object.values(selectedMedia))}
                            disabled={Object.keys(selectedMedia).length === 0}
                            className="flex items-center gap-1.5 px-3 py-1 bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold rounded cursor-pointer transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dynamic media list layout rendering */}
                  {fs.loading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i} className="aspect-square bg-slate-900 border border-slate-800 animate-pulse rounded-xl" />
                      ))}
                    </div>
                  ) : filteredMedia.length === 0 ? (
                    <div className="text-center py-16 bg-slate-950/40 border border-slate-900 rounded-3xl p-6 select-none space-y-4">
                      <div className="mx-auto w-12 h-12 rounded-full bg-slate-900 border border-slate-800/80 text-slate-500 flex items-center justify-center">
                        <Grid className="h-5 w-5" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="text-sm font-sans font-bold text-white">No items found</h4>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          {searchQuery 
                            ? 'Adjust your query to find other matching files' 
                            : 'This directory has no compatible video or photo media files inside.'}
                        </p>
                      </div>
                      {fs.currentPath === '' && !searchQuery && (
                        <div className="max-w-md mx-auto p-4 rounded-xl border border-amber-500/10 bg-amber-500/5 text-left space-y-2">
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                            <Info className="h-4 w-4" />
                            How do hidden folders work?
                          </span>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            HID.Scrapper only scans folders starting with a dot (e.g. <code className="font-mono text-indigo-400 bg-slate-900 px-1 py-0.5 rounded border border-slate-800">.mal</code>) inside your vault root directory.
                          </p>
                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Please open your phone storage app and rename folders you want to hide by adding a period prefix!
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <VirtualGrid
                      mediaList={filteredMedia}
                      selectedMedia={selectedMedia}
                      isInSelectionMode={isInSelectionMode}
                      onSelect={handleSelectMedia}
                      onOpen={handleOpenMedia}
                    />
                  )}
                </div>
              </div>
            )}
          </main>

          {/* Persistent Footer */}
          <footer className="w-full border-t border-slate-900/60 bg-slate-950/80 py-4 text-center mt-auto">
            <p className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
              Made by Mash141
            </p>
          </footer>
        </div>
      )}

      {/* 4. Full-screen Swipe Media Viewer Overlay */}
      {isUnlocked && activeViewerIndex !== null && (
        <FullScreenViewer
          mediaList={filteredMedia}
          initialIndex={activeViewerIndex}
          onClose={() => setActiveViewerIndex(null)}
          onDeleteSelected={(media) => handleDeleteMedia([media])}
        />
      )}
    </div>
  );
}
