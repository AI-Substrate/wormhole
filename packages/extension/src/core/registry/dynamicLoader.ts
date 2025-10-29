// extension/src/core/registry/dynamicLoader.ts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

/** Detect WSL (works for WSL1/WSL2) */
export function isWSL(): boolean {
  if (process.platform !== 'linux') return false;
  const rel = os.release().toLowerCase();
  return rel.includes('microsoft') || rel.includes('wsl');
}

/** Normalize any odd paths (e.g., accidental Windows path inside WSL). */
function normalizeForPlatform(p: string): string {
  // Convert `C:\foo\bar` => `/mnt/c/foo/bar` if we are inside WSL
  if (isWSL() && /^[A-Za-z]:\\/.test(p)) {
    const drive = p[0].toLowerCase();
    return `/mnt/${drive}/${p.slice(3).replace(/\\/g, '/')}`;
  }
  return path.normalize(p);
}

/** Load a JS module from disk (CJS-first, ESM fallback). */
export async function loadModuleFromDisk(absPath: string): Promise<any> {
  const normalized = normalizeForPlatform(absPath);
  if (!fs.existsSync(normalized)) {
    throw new Error(`Script file not found: ${normalized}`);
  }

  // Get the real Node.js require function (bypasses webpack completely)
  // We use eval to prevent webpack from transforming this code
  let realRequire: NodeJS.Require;
  try {
    // eval('require') returns the actual Node.js require, not webpack's
    // This is safe since we control all paths being loaded
    realRequire = eval('require');
  } catch (e) {
    // Fallback to createRequire if eval fails (shouldn't happen in Node.js)
    console.warn('[dynamicLoader] eval("require") failed, using createRequire fallback:', e);
    realRequire = createRequire(__filename);
  }

  // Try CommonJS first (your scripts are CJS today).
  try {
    const resolved = realRequire.resolve(normalized);
    // Optional: hot-reload in dev
    delete (realRequire as any).cache?.[resolved];
    return realRequire(normalized);
  } catch (err: any) {
    // If the target is ESM, CJS loader throws ERR_REQUIRE_ESM — fall back to ESM import.
    if (err?.code === 'ERR_REQUIRE_ESM' || /must use import/i.test(String(err))) {
      const href = pathToFileURL(normalized).href;
      // Use eval to load ESM module dynamically, preventing webpack transformation
      try {
        // eval with Function constructor to load the module
        const moduleLoader = new Function('url', 'return import(url)');
        return await moduleLoader(href);
      } catch (importErr: any) {
        // If dynamic import fails, throw with context
        throw new Error(
          `Failed to dynamically import ESM module at ${normalized}:\n` +
          (importErr?.stack || String(importErr))
        );
      }
    }
    // Provide useful diagnostics
    throw new Error(
      `Failed to load module at ${normalized} on ${process.platform} (isWSL=${isWSL()}):\n` +
      (err?.stack || String(err))
    );
  }
}