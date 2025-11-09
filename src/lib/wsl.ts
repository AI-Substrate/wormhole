/**
 * WSL detection and path translation utilities
 */
import os from 'os';
import path from 'path';

/**
 * Detect if running in WSL environment
 */
export function isWSL(): boolean {
  // Check for microsoft or wsl in release string
  const release = os.release().toLowerCase();
  return /microsoft|wsl/i.test(release);
}

/**
 * Check if a path is a Windows path format
 */
export function isWindowsPath(p: string): boolean {
  // Windows paths start with drive letter: C:\ or C:/
  return /^[A-Za-z]:[\\/]/.test(p);
}

/**
 * Convert WSL path to Windows path
 * e.g., /mnt/c/Users/name/project → C:\Users\name\project
 */
export function wslToWindows(wslPath: string): string {
  // Match /mnt/<drive>/... pattern
  const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/i);
  if (!match) {
    // Not a mounted path, return as-is
    return wslPath;
  }

  const [, drive, rest] = match;
  // Convert to Windows format with backslashes
  return `${drive.toUpperCase()}:\\${rest.replace(/\//g, '\\')}`;
}

/**
 * Convert Windows path to WSL path
 * e.g., D:\data\file.txt → /mnt/d/data/file.txt
 */
export function windowsToWsl(winPath: string): string {
  // Handle both forward and backward slashes
  const normalized = winPath.replace(/\\/g, '/');

  // Match drive letter pattern
  const match = normalized.match(/^([A-Za-z]):(\/.*)/);
  if (!match) {
    // Not a Windows path, return as-is
    return winPath;
  }

  const [, drive, rest] = match;
  // Convert to WSL mount format
  return `/mnt/${drive.toLowerCase()}${rest}`;
}

/**
 * Normalize path for current platform
 */
export function normalizePath(p: string): string {
  if (!p) return p;

  // Don't try to normalize non-path strings
  if (!p.includes('/') && !p.includes('\\')) {
    return p;
  }

  try {
    return path.resolve(p);
  } catch {
    // If resolve fails, return as-is
    return p;
  }
}