/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'motion/react';
import { Folder, Image as ImageIcon, Video as VideoIcon, Disc, ChevronRight } from 'lucide-react';
import { VaultFolder, MediaStats } from '../types/vault';

interface FolderCardProps {
  key?: string | number;
  folder: VaultFolder;
  stats?: MediaStats;
  onClick: () => void;
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function FolderCard({ folder, stats, onClick }: FolderCardProps) {
  const photoCount = stats?.photoCount ?? 0;
  const videoCount = stats?.videoCount ?? 0;
  const totalSize = stats?.size ?? 0;
  const isLoaded = !!stats;

  // Render a beautifully cleaned folder name (e.g. show ".mal" as "mal", or keep dot if preferred, but usually remove leading dot for extreme elegance, or keep it to show it's a hidden folder. Let's show both neatly).
  const displayName = folder.name.startsWith('.') ? folder.name.slice(1) : folder.name;

  return (
    <motion.div
      id={`folder-card-${folder.name}`}
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="group relative cursor-pointer overflow-hidden rounded-2xl border border-slate-800/40 bg-slate-950/30 p-5 shadow-lg backdrop-blur-md transition-all duration-300 hover:border-indigo-500/30 hover:bg-slate-900/40"
    >
      {/* Background soft glow on hover */}
      <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-indigo-500/5 blur-3xl transition-all duration-500 group-hover:bg-indigo-500/10" />

      <div className="flex items-start gap-4">
        {/* Animated Folder Icon */}
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 border border-slate-800 text-indigo-400 shadow-md group-hover:from-indigo-950/50 group-hover:to-slate-900 group-hover:border-indigo-500/20 group-hover:text-indigo-300 transition-all duration-300">
          <Folder className="h-7 w-7 transition-transform duration-300 group-hover:scale-110" />
          {folder.name.startsWith('.') && (
            <div className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-slate-950" title="Hidden folder" />
          )}
        </div>

        {/* Name and statistics */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate text-base font-sans font-semibold tracking-tight text-white group-hover:text-indigo-200 transition-colors">
              {displayName}
            </h3>
            <ChevronRight className="h-4 w-4 shrink-0 text-slate-600 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-indigo-400" />
          </div>

          <p className="mt-0.5 truncate text-[10px] font-mono text-slate-500 uppercase tracking-wider">
            {folder.name}
          </p>

          {/* Stats Indicators */}
          <div className="mt-4 flex items-center gap-3">
            {!isLoaded ? (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-sans">
                <Disc className="h-3.5 w-3.5 animate-spin text-indigo-400/60" />
                <span>Scanning...</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-mono text-slate-400 font-medium">
                {photoCount > 0 && (
                  <div className="flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{photoCount}</span>
                  </div>
                )}
                {videoCount > 0 && (
                  <div className="flex items-center gap-1">
                    <VideoIcon className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{videoCount}</span>
                  </div>
                )}
                {photoCount === 0 && videoCount === 0 && (
                  <span className="text-slate-600">Empty folder</span>
                )}
                {totalSize > 0 && (
                  <span className="text-slate-500 ml-auto bg-slate-950/50 px-2 py-0.5 rounded-md border border-slate-900">
                    {formatBytes(totalSize)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
