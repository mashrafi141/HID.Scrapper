/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface FileSystemHandlePermissionDescriptor {
    mode?: 'read' | 'readwrite';
  }

  interface FileSystemHandle {
    readonly kind: 'file' | 'directory';
    readonly name: string;
    queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
    requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
  }

  interface FileSystemFileHandle extends FileSystemHandle {
    readonly kind: 'file';
    getFile(): Promise<File>;
  }

  interface FileSystemDirectoryHandle extends FileSystemHandle {
    readonly kind: 'directory';
    getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
    removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
    values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  }
}

export type MediaType = 'image' | 'video' | 'gif';

export interface MediaStats {
  photoCount: number;
  videoCount: number;
  size: number; // in bytes
}

export interface VaultFolder {
  name: string;
  path: string; // Relative path from root, e.g. ".mal/Photos"
  handle: FileSystemDirectoryHandle;
  stats?: MediaStats;
}

export interface VaultMedia {
  name: string;
  path: string; // Full relative path, e.g. "Photos/IMG001.jpg"
  extension: string; // lowercase, e.g. "jpg"
  type: MediaType;
  handle: FileSystemFileHandle;
  id?: string;
  size?: number;
  modified?: number;
}

export interface FolderContent {
  subfolders: VaultFolder[];
  media: VaultMedia[];
}

export interface FolderCacheData {
  path: string;
  stats: MediaStats;
  scannedAt: number;
}

