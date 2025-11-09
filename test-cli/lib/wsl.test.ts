/**
 * Tests for WSL detection and path translation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import os from 'os';
import {
  isWSL,
  isWindowsPath,
  wslToWindows,
  windowsToWsl,
  normalizePath
} from '../../src/lib/wsl.js';

describe('WSL Detection', () => {
  it('should detect WSL environment based on release string', () => {
    // Mock os.release to simulate WSL
    const originalRelease = os.release;
    vi.spyOn(os, 'release').mockReturnValue('5.10.16.3-microsoft-standard-WSL2');

    expect(isWSL()).toBe(true);

    // Test non-WSL
    vi.spyOn(os, 'release').mockReturnValue('5.15.0-56-generic');
    expect(isWSL()).toBe(false);

    os.release = originalRelease;
  });
});

describe('Path Detection', () => {
  it('should detect Windows paths', () => {
    expect(isWindowsPath('C:\\Users\\name\\project')).toBe(true);
    expect(isWindowsPath('D:\\data\\file.txt')).toBe(true);
    expect(isWindowsPath('C:/Users/name/project')).toBe(true);
    expect(isWindowsPath('/mnt/c/Users')).toBe(false);
    expect(isWindowsPath('/home/user')).toBe(false);
  });

  it('should detect WSL paths', () => {
    expect(isWindowsPath('/mnt/c/Users/name')).toBe(false);
    expect(isWindowsPath('/home/user/project')).toBe(false);
  });
});

describe('Path Translation', () => {
  it('should convert WSL paths to Windows', () => {
    // Test cases from runsheet
    expect(wslToWindows('/mnt/c/Users/name/project'))
      .toBe('C:\\Users\\name\\project');
    expect(wslToWindows('/mnt/d/data/file.txt'))
      .toBe('D:\\data\\file.txt');
  });

  it('should leave non-mountpoint paths unchanged', () => {
    expect(wslToWindows('/home/user/project'))
      .toBe('/home/user/project');
    expect(wslToWindows('/usr/local/bin'))
      .toBe('/usr/local/bin');
  });

  it('should convert Windows paths to WSL', () => {
    // Test cases from runsheet
    expect(windowsToWsl('D:\\data\\file.txt'))
      .toBe('/mnt/d/data/file.txt');
    expect(windowsToWsl('C:\\Users\\name\\project'))
      .toBe('/mnt/c/Users/name/project');
  });

  it('should handle Windows paths with forward slashes', () => {
    expect(windowsToWsl('C:/Users/name/project'))
      .toBe('/mnt/c/Users/name/project');
  });
});

describe('Path Normalization', () => {
  it('should normalize paths for current platform', () => {
    const testPath = '/home/user/project';
    const normalized = normalizePath(testPath);

    // Should return an absolute path
    expect(normalized).toBeTruthy();
    expect(normalized.startsWith('/')).toBe(true);

    // Edge cases
    expect(normalizePath('')).toBe('');

    // For relative paths, normalizePath might resolve them
    // So we just check it returns something
    const relativePath = normalizePath('not/a/path');
    expect(relativePath).toBeTruthy();
  });
});