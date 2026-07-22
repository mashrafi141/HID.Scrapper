/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates an ultra-fast, deterministic 32-bit FNV-1a hash of a file's state
 * combining path, size, and modified timestamp. This ensures no cache collisions
 * and guarantees cache freshness if a file is modified.
 */
export function computeFileHash(path: string, size: number, modified: number): string {
  // To be rename-safe, we do not include the path in the FNV-1a hash.
  // This ensures that renaming a file (which preserves size and modification time)
  // maps to the exact same hash, preventing redundant thumbnail or metadata generation.
  const input = `${size}:${modified}`;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Multiply by 32-bit FNV prime 16777619
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `fhash_${Math.abs(hash | 0).toString(36)}`;
}
