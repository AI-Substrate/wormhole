import chalk from 'chalk';
import { Envelope, isSuccess } from './client.js';
import { getConfigValue } from './config.js';

/**
 * Detect output format based on TTY and config
 */
export async function detectFormat(): Promise<'json' | 'pretty'> {
  const configFormat = await getConfigValue('outputFormat');

  // Check for explicit --json flag
  const hasJsonFlag = process.argv.includes('--json') || process.argv.includes('--output=json');
  if (hasJsonFlag) return 'json';

  // Check for explicit --pretty flag
  const hasPrettyFlag = process.argv.includes('--pretty') || process.argv.includes('--output=pretty');
  if (hasPrettyFlag) return 'pretty';

  // Use config setting if not auto
  if (configFormat !== 'auto') {
    return configFormat as 'json' | 'pretty';
  }

  // Auto-detect: JSON for non-TTY (pipes, CI), pretty for TTY
  return process.stdout.isTTY ? 'pretty' : 'json';
}

/**
 * Check if a response is from an action script
 * Action scripts return { success: boolean, reason?: string, details?: any }
 */
function isActionResponse(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    'success' in data &&
    typeof data.success === 'boolean'
  );
}

/**
 * Format a failed action response
 */
function formatActionFailure(data: any): string {
  let message = 'Operation failed';

  if (data.reason) {
    // Check if it's an error code or a message
    if (data.reason.startsWith('E_')) {
      message = `[${data.reason}]`;

      // Add human-readable messages for known error codes
      const errorMessages: Record<string, string> = {
        'E_FILE_NOT_FOUND': 'File not found',
        'E_INVALID_LINE': 'Invalid line number',
        'E_INVALID_PATH': 'Invalid file path',
        'E_NO_DEBUG_SESSION': 'No active debug session',
        'E_SCRIPT_NOT_FOUND': 'Script not found',
        'E_INVALID_PARAMS': 'Invalid parameters'
      };

      if (errorMessages[data.reason]) {
        message += ` ${errorMessages[data.reason]}`;
      }
    } else {
      message = data.reason;
    }
  }

  // Add details if present
  if (data.details) {
    if (typeof data.details === 'string') {
      message += `: ${data.details}`;
    } else if (data.details.path) {
      message += `: ${data.details.path}`;
    } else if (data.details.message) {
      message += `: ${data.details.message}`;
    }
  }

  return message;
}

/**
 * Format a successful action response
 */
function formatActionSuccess(data: any): string {
  if (data.details) {
    // Special handling for breakpoint responses
    if (data.details.breakpoint) {
      const bp = data.details.breakpoint;
      return `Breakpoint set at ${bp.path}:${bp.line}`;
    }

    // Special handling for clear responses
    if ('cleared' in data.details) {
      return `Cleared ${data.details.cleared} breakpoint(s)`;
    }

    // Default details display
    if (typeof data.details === 'string') {
      return data.details;
    }

    return JSON.stringify(data.details);
  }

  return 'Success';
}

/**
 * Output a result in the appropriate format
 */
export async function output<T>(
  result: Envelope<T>,
  options: { format?: 'json' | 'pretty'; exitCode?: boolean } = {}
): Promise<void> {
  const format = options.format || (await detectFormat());
  const shouldExit = options.exitCode !== false;

  if (format === 'json') {
    // JSON goes to stdout for parsing
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Pretty output goes to stderr for humans
    if (isSuccess(result)) {
      // Check if this is an action script response that failed
      const data = (result as any).data;
      if (isActionResponse(data) && !data.success) {
        // Action failed - show as error
        console.error(chalk.red('✗'), formatActionFailure(data));
        if (shouldExit) {
          process.exit(1);
        }
        return;
      }
      console.error(chalk.green('✓'), formatSuccess(result));
    } else {
      console.error(chalk.red('✗'), formatError(result));
    }
  }

  if (shouldExit) {
    process.exit(isSuccess(result) ? 0 : 1);
  }
}

/**
 * Format successful result for pretty output
 */
function formatSuccess<T>(envelope: Envelope<T>): string {
  const data = (envelope as any).data;

  // Check if this is an action response
  if (isActionResponse(data)) {
    return formatActionSuccess(data);
  }

  if (data === null || data === undefined) {
    return 'Success';
  }

  if (typeof data === 'string') {
    return data;
  }

  if (typeof data === 'boolean') {
    return String(data);
  }

  if (typeof data === 'number') {
    return String(data);
  }

  if (Array.isArray(data)) {
    return `${data.length} item(s)`;
  }

  // For objects, try to provide a meaningful summary
  if (typeof data === 'object') {
    // Special handling for known response types
    if ('breakpoint' in data) {
      const bp = data.breakpoint;
      return `Breakpoint set at ${bp.path}:${bp.line}`;
    }

    if ('scripts' in data && Array.isArray(data.scripts)) {
      return `Found ${data.scripts.length} scripts`;
    }

    if ('total' in data && typeof data.total === 'number') {
      return `${data.total} items`;
    }

    // Default object display
    const keys = Object.keys(data);
    if (keys.length <= 3) {
      return JSON.stringify(data);
    }
    return `Object with ${keys.length} properties`;
  }

  return JSON.stringify(data);
}

/**
 * Format error for pretty output
 */
function formatError(envelope: Envelope): string {
  const error = (envelope as any).error;

  if (!error) {
    return 'Unknown error';
  }

  let message = error.message || 'Error occurred';

  // Add error code if present
  if (error.code) {
    message = `[${error.code}] ${message}`;
  }

  // Add details if present and not too verbose
  if (error.details && typeof error.details === 'string') {
    message += `: ${error.details}`;
  }

  return message;
}

/**
 * Log a message to stderr (for progress/info)
 */
export function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const prefix = {
    info: chalk.blue('ℹ'),
    warn: chalk.yellow('⚠'),
    error: chalk.red('✗'),
  }[level];

  console.error(prefix, message);
}

/**
 * Log debug information (only if DEBUG env var is set)
 */
export function debug(message: string): void {
  if (process.env.DEBUG) {
    console.error(chalk.gray('[DEBUG]'), message);
  }
}