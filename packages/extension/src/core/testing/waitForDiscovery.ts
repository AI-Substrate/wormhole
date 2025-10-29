import * as vscode from 'vscode';

/**
 * Outcome of waiting for test discovery
 */
export type DiscoveryOutcome =
  | { kind: 'ready'; framework?: 'pytest' | 'unittest' | 'unknown'; itemCount: number; details?: string }
  | { kind: 'notConfigured'; details?: string }
  | { kind: 'noProvider'; details?: string }
  | { kind: 'timeout'; details?: string };

/**
 * Options for waiting for test discovery
 */
export interface WaitOptions {
  folder: vscode.WorkspaceFolder;
  timeoutMs?: number;          // default 30000
  quietMs?: number;            // default 500
  minItems?: number;           // default 1
}

/**
 * Heuristic: if neither pytest nor unittest is enabled, consider not configured
 */
export function isTestConfigurationRequired(folder: vscode.WorkspaceFolder): boolean {
  const cfg = vscode.workspace.getConfiguration('python', folder);
  const pytestEnabled = cfg.get<boolean>('testing.pytestEnabled');
  const unittestEnabled = cfg.get<boolean>('testing.unittestEnabled');
  return !pytestEnabled && !unittestEnabled;
}

/**
 * Best-effort trigger of discovery across providers. Safe to call repeatedly.
 */
export async function triggerTestDiscovery(folder?: vscode.WorkspaceFolder): Promise<void> {
  // Try Python (newer/older ids). Ignore errors if command is not registered.
  try { await vscode.commands.executeCommand('python.testing.refreshTests'); } catch { /* ignore */ }
  try { await vscode.commands.executeCommand('python.refreshTests'); } catch { /* ignore */ }

  // Try platform reload (command id naming may vary across versions/extensions).
  // The "Test Explorer: Reload tests" command is exposed by the platform/UI.
  try { await vscode.commands.executeCommand('testing.reloadTests'); } catch { /* ignore */ }
  // As a nudge, focusing the Testing view can prompt providers to resolve:
  try { await vscode.commands.executeCommand('workbench.view.testing.focus'); } catch { /* ignore */ }
}

/**
 * Wait until test discovery for a folder is quiescent
 */
export async function waitForTestDiscovery(options: WaitOptions): Promise<DiscoveryOutcome> {
  const { folder, timeoutMs = 30000, quietMs = 500, minItems = 1 } = options;

  // 0) Python extension presence/activation (so commands & controllers exist)
  const py = vscode.extensions.getExtension('ms-python.python');
  if (!py) {
    return { kind: 'noProvider', details: 'Python extension not installed/disabled' };
  }
  if (!py.isActive) {
    try {
      await py.activate();
    } catch {
      return { kind: 'noProvider', details: 'Python extension failed to activate' };
    }
  }

  // 1) Config gate
  if (isTestConfigurationRequired(folder)) {
    return { kind: 'notConfigured', details: 'Enable pytest or unittest in workspace settings' };
  }

  // 2) Create an observer and wait for quiescence
  // Note: createTestObserver might not be available in all VS Code versions
  let observer: any;
  try {
    observer = (vscode as any).tests?.createTestObserver?.();
  } catch {
    // Fall back if method doesn't exist
  }

  if (!observer) {
    // If test observer is not available, fall back to a simpler approach
    return { kind: 'ready', framework: 'unknown', itemCount: 0, details: 'Test observer API not available' };
  }

  const disposables: vscode.Disposable[] = [observer];

  // Track items under target folder
  const folderPrefix = folder.uri.toString() + '/';
  const seen = new Set<string>();

  // dynamic snapshot of busy state under the folder
  const isUnderFolder = (item: vscode.TestItem) =>
    item.uri?.toString().startsWith(folderPrefix);

  const hasBusyUnderFolder = () => {
    // VS Code's TestItem tree is global; traverse known items under folder and check .busy
    // We keep 'seen' ids; in practice, the observer surfaces adds/changes/removals.
    for (const item of observer.tests) {
      if (isUnderFolder(item) && item.busy) {
        return true;
      }
    }
    return false;
  };

  let lastChange = Date.now();
  let lastCount = 0;

  const onChange = observer.onDidChangeTestItems((e: any) => {
    const all = [...(observer.tests || [])].filter(isUnderFolder);
    lastCount = all.length;
    for (const it of all) {
      seen.add(it.id);
    }
    lastChange = Date.now();
  });
  disposables.push(onChange);

  // 3) Kick discovery
  await triggerTestDiscovery(folder);

  // 4) Wait loop: until min items & quiet window & no busy
  const started = Date.now();
  return new Promise<DiscoveryOutcome>((resolve) => {
    const tick = () => {
      const now = Date.now();
      const quietEnough = now - lastChange >= quietMs;
      const busy = hasBusyUnderFolder();

      if (!busy && quietEnough && lastCount >= minItems) {
        // Optional: infer framework by first item's label/id/uri (best-effort)
        const framework = inferFramework(observer, folder);
        resolve({ kind: 'ready', framework, itemCount: lastCount });
        cleanup();
        return;
      }
      if (now - started > timeoutMs) {
        resolve({ kind: 'timeout', details: `items=${lastCount}, busy=${busy}` });
        cleanup();
        return;
      }
      setTimeout(tick, 50);
    };
    const cleanup = () => disposables.forEach(d => d.dispose());
    tick();
  });

  function inferFramework(obs: any, f: vscode.WorkspaceFolder): 'pytest' | 'unittest' | 'unknown' {
    // Very light heuristic that never blocks. You can refine later.
    for (const it of (obs.tests || [])) {
      if (isUnderFolder(it)) {
        const label = (it.label || '').toLowerCase();
        if (label.includes('pytest')) {
          return 'pytest';
        }
        if (label.includes('unittest')) {
          return 'unittest';
        }
      }
    }
    return 'unknown';
  }
}

/**
 * Event-driven subscription wrapper for test discovery completion
 */
export function onTestDiscoveryComplete(
  folder: vscode.WorkspaceFolder,
  callback: (outcome: { itemCount: number }) => void,
  opts?: { quietMs?: number }
): vscode.Disposable {
  // Note: createTestObserver might not be available in all VS Code versions
  let observer: any;
  try {
    observer = (vscode as any).tests?.createTestObserver?.();
  } catch {
    // Fall back if method doesn't exist
  }

  if (!observer) {
    // If test observer is not available, return a no-op disposable
    return { dispose: () => { /* no-op */ } };
  }
  const quietMs = opts?.quietMs ?? 500;
  const prefix = folder.uri.toString() + '/';
  let lastChange = Date.now();
  let lastCount = 0;
  let debounceTimer: NodeJS.Timeout | undefined;

  const isUnder = (i: vscode.TestItem) => i.uri?.toString().startsWith(prefix);

  const handler = observer.onDidChangeTestItems(() => {
    const items = [...observer.tests].filter(isUnder);
    lastCount = items.length;
    lastChange = Date.now();

    // Clear existing debounce timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Simple debounce to fire once per quiet window
    debounceTimer = setTimeout(() => {
      if (Date.now() - lastChange >= quietMs && items.every(i => !i.busy)) {
        callback({ itemCount: lastCount });
      }
    }, quietMs);
  });

  return {
    dispose: () => {
      handler.dispose();
      observer.dispose();
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    }
  };
}

/**
 * Helper to ensure Python tests are ready before operations
 */
export async function ensurePythonTestsReady(
  targetFile: string,
  timeoutMs = 30000
): Promise<DiscoveryOutcome> {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(targetFile));
  if (!folder) {
    return { kind: 'noProvider', details: 'No workspace folder for target file' };
  }

  if (isTestConfigurationRequired(folder)) {
    // Optionally set defaults here instead of throwing:
    // await vscode.workspace.getConfiguration('python', folder)
    //   .update('testing.pytestEnabled', true, vscode.ConfigurationTarget.WorkspaceFolder);
    return { kind: 'notConfigured', details: 'Python tests not configured (pytest/unittest disabled)' };
  }

  return waitForTestDiscovery({ folder, timeoutMs });
}