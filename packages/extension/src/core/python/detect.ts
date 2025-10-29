import * as path from 'path';
import { FSAdapter, NodeFSAdapter } from './fs-adapter';

export type Framework = 'pytest' | 'unittest' | 'nose2' | 'none';

export interface DebugConfig {
    name: string;
    type: string;
    request: string;
    module?: string;
    program?: string;
    args: string[];
    console: string;
    justMyCode: boolean;
    cwd?: string;
}

/**
 * Detect Python test framework from filesystem markers.
 * Pure function - no VS Code dependencies.
 * @param root Root directory to search
 * @param adapter Optional filesystem adapter (defaults to Node.js fs)
 */
export async function detectFrameworkOnDisk(
    root: string,
    adapter: FSAdapter = new NodeFSAdapter()
): Promise<Framework> {
    const exists = async (p: string) => {
        const result = adapter.exists(path.join(root, p));
        return result instanceof Promise ? await result : result;
    };

    // Check for pytest markers
    if (await exists('pytest.ini') || await exists('conftest.py')) {
        return 'pytest';
    }

    // Check for config files that might have pytest sections
    if (await exists('setup.cfg') || await exists('pyproject.toml') || await exists('tox.ini')) {
        // Simple heuristic - if these exist, likely pytest
        return 'pytest';
    }

    // Check for unittest patterns
    if (await exists('tests') || await exists('test')) {
        // Look for test files
        const testDir = await exists('tests') ? 'tests' : 'test';
        const files = adapter.readDir(path.join(root, testDir));
        const fileList = files instanceof Promise ? await files : files;
        if (fileList.some(f => f.startsWith('test_') || f.endsWith('_test.py'))) {
            // Could be either pytest or unittest, default to unittest
            return 'unittest';
        }
    }

    return 'none';
}

/**
 * Build debug configuration for the detected framework.
 * CRITICAL: Uses 'module' not 'program' to fix breakpoint issues.
 */
export function buildDebugConfig(
    framework: Framework,
    cwd: string,
    testPath?: string
): DebugConfig {
    const baseConfig = {
        type: 'debugpy',
        request: 'launch',
        console: 'integratedTerminal',
        justMyCode: false,
        cwd
    };

    switch (framework) {
        case 'pytest':
            return {
                ...baseConfig,
                name: 'Python: Pytest',
                module: 'pytest',  // CRITICAL: module, not program!
                args: testPath ? ['-q', testPath, '--no-cov'] : ['-q', '--no-cov']
            };

        case 'unittest':
            return {
                ...baseConfig,
                name: 'Python: Unittest',
                module: 'unittest',  // CRITICAL: module, not program!
                args: testPath
                    ? ['discover', '-s', '.', '-p', path.basename(testPath)]
                    : ['discover', '-s', '.', '-p', 'test*.py']
            };

        case 'nose2':
            return {
                ...baseConfig,
                name: 'Python: Nose2',
                module: 'nose2',
                args: testPath ? [testPath] : []
            };

        default:
            // Fallback to pytest as it's most common
            return {
                ...baseConfig,
                name: 'Python: Test',
                module: 'pytest',
                args: ['-q', '--no-cov']
            };
    }
}

/**
 * Get confidence score for the detection.
 * Simple heuristic based on what we found.
 */
export function getConfidence(framework: Framework, markers: string[]): number {
    if (framework === 'none') return 0;

    // Strong signals for pytest
    if (framework === 'pytest' && (markers.includes('pytest.ini') || markers.includes('conftest.py'))) {
        return 0.9;
    }

    // Strong signals for unittest
    if (framework === 'unittest' && markers.includes('tests')) {
        return 0.8;  // High confidence when we have a tests directory
    }

    // Medium signals
    if (markers.includes('setup.cfg') || markers.includes('pyproject.toml')) {
        return 0.6;
    }

    // Weak signals
    return 0.3;
}

/**
 * Find which marker files exist in the directory.
 * Used for confidence scoring and reasoning.
 * @param root Root directory to search
 * @param adapter Optional filesystem adapter
 */
export async function findMarkers(
    root: string,
    adapter: FSAdapter = new NodeFSAdapter()
): Promise<string[]> {
    const markers: string[] = [];
    const checkFiles = [
        'pytest.ini',
        'conftest.py',
        'setup.cfg',
        'pyproject.toml',
        'tox.ini',
        'tests',
        'test'
    ];

    for (const file of checkFiles) {
        const exists = adapter.exists(path.join(root, file));
        const result = exists instanceof Promise ? await exists : exists;
        if (result === true) {
            markers.push(file);
        }
    }

    return markers;
}