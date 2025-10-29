/**
 * Filesystem Bridge Protocol Types
 *
 * These types define the contract for filesystem-based IPC between
 * the VS Code extension and external tools (CLI, MCP server).
 */

import { EditorContext } from '../response/envelope';

/**
 * Command written by CLI/MCP to request an operation
 */
export interface CommandJson {
  /** Protocol version for future compatibility */
  version: 1;

  /** Client identifier (e.g., 'cli-1234', 'mcp-5678') */
  clientId: string;

  /** Unique command ID (format: YYYYMMDDTHHMMSSfffZ-seq-rand) */
  id: string;

  /** ISO timestamp when command was created */
  createdAt: string;

  /** Script name to execute (e.g., 'bp.set', 'debug.start') */
  scriptName: string;

  /** Parameters for the script */
  params: Record<string, any>;

  /** Optional timeout in milliseconds (default: 30000) */
  timeout?: number;

  /** Script content for dynamic execution (when scriptName is '@dynamic') */
  scriptContent?: string;
}

/**
 * Claim file written atomically to indicate job ownership
 */
export interface ClaimedJson {
  /** Bridge instance ID that claimed this job */
  bridgeId: string;

  /** ISO timestamp when job was claimed */
  claimedAt: string;

  /** Process ID of claiming process */
  pid: number;
}

/**
 * Host metadata written by extension on startup
 */
export interface HostJson {
  /** Unique bridge instance identifier */
  bridgeId: string;

  /** Protocol version */
  version: 1;

  /** Platform (process.platform) */
  platform: NodeJS.Platform;

  /** Absolute path to workspace */
  workspace: string;

  /** Process ID of extension host */
  pid: number;

  /** ISO timestamp when bridge started */
  startedAt: string;

  /** Whether WSL awareness is enabled */
  wslAware: boolean;
}

/**
 * Event written to unified event stream (events.ndjson)
 */
export interface EventJson {
  /** Unix timestamp in milliseconds */
  ts: number;

  /** Sequence number for ordering */
  seq: number;

  /** Event type */
  type: 'progress' | 'log' | 'warn' | 'error';

  /** Log level (for log events) */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /** Progress percentage (0-100) */
  pct?: number;

  /** Progress message */
  msg?: string;

  /** Log/warning/error text */
  text?: string;

  /** Optional structured data */
  data?: any;
}

/**
 * Success response envelope
 */
export interface ResponseJson {
  /** Always true for success */
  ok: true;

  /** Response type */
  type: 'success' | 'pending' | 'progress' | 'event';

  /** Response data (inline for <2MB) */
  data?: any;

  /** Reference to separate data file (for >2MB) */
  dataRef?: string;

  /** Response metadata */
  meta: ResponseMeta;

  /** Optional editor context (Phase 2: auto-editor-context) */
  editorContext?: EditorContext;
}

/**
 * Error response envelope
 */
export interface ErrorJson {
  /** Always false for errors */
  ok: false;

  /** Always 'error' */
  type: 'error';

  /** Error information */
  error: {
    /** Error code (e.g., 'E_INVALID_PARAMS', 'E_CANCELLED') */
    code: string;

    /** Human-readable error message */
    message: string;

    /** Optional error details */
    details?: any;
  };

  /** Response metadata */
  meta: ResponseMeta;
}

/**
 * Metadata included in all responses
 */
export interface ResponseMeta {
  /** Request ID from command */
  requestId: string;

  /** Execution mode */
  mode: 'normal' | 'danger';

  /** ISO timestamp of response */
  timestamp: string;

  /** Execution duration in milliseconds */
  duration: number;

  /** Optional operation name */
  operation?: string;
}

/**
 * Bridge information returned by initialization
 */
export interface BridgeInfo {
  /** Unique bridge instance ID */
  bridgeId: string;

  /** Path to .vsc-bridge directory */
  bridgeDir: string;

  /** Path to host.json file */
  hostJsonPath: string;

  /** Whether this instance owns the bridge */
  isOwner: boolean;

  /** File watcher (if owner) */
  watcher?: import('vscode').FileSystemWatcher;

  /** Health heartbeat timer (if owner) */
  healthTimer?: NodeJS.Timeout;

  /** Garbage collection timer (if owner) */
  gcTimer?: NodeJS.Timeout;

  /** Recovery timer for stale jobs (if owner) */
  recoveryTimer?: NodeJS.Timeout;
}

/**
 * Options for running a command
 */
export interface RunOptions {
  /** Timeout in milliseconds */
  timeout?: number;

  /** Progress callback */
  onProgress?: (event: EventJson) => void;

  /** Whether to auto-cleanup job directory */
  cleanup?: boolean;
}

/**
 * Health status information
 */
export interface HealthStatus {
  /** Whether bridge is healthy */
  healthy: boolean;

  /** Last time host.json was updated */
  lastSeen: Date;

  /** Bridge instance ID */
  bridgeId?: string;

  /** Process ID */
  pid?: number;
}

/**
 * Type guard for response envelope
 */
export function isResponseJson(obj: any): obj is ResponseJson {
  return obj && typeof obj === 'object' && obj.ok === true;
}

/**
 * Type guard for error envelope
 */
export function isErrorJson(obj: any): obj is ErrorJson {
  return obj && typeof obj === 'object' && obj.ok === false;
}

/**
 * Type guard for command
 */
export function isCommandJson(obj: any): obj is CommandJson {
  return obj &&
    typeof obj === 'object' &&
    obj.version === 1 &&
    typeof obj.clientId === 'string' &&
    typeof obj.id === 'string' &&
    typeof obj.scriptName === 'string' &&
    typeof obj.params === 'object';
}

/**
 * Error codes used in the system
 */
export enum ErrorCode {
  // Request errors
  E_INVALID_PARAMS = 'E_INVALID_PARAMS',
  E_INVALID_REQUEST = 'E_INVALID_REQUEST',
  E_TIMEOUT = 'E_TIMEOUT',
  E_CANCELLED = 'E_CANCELLED',

  // Script errors
  E_SCRIPT_NOT_FOUND = 'E_SCRIPT_NOT_FOUND',
  E_SCRIPT_FAILED = 'E_SCRIPT_FAILED',

  // System errors
  E_INTERNAL = 'E_INTERNAL',
  E_NOT_INITIALIZED = 'E_NOT_INITIALIZED',
  E_BRIDGE_NOT_FOUND = 'E_BRIDGE_NOT_FOUND',

  // File system errors
  E_FS_ERROR = 'E_FS_ERROR',
  E_PERMISSION_DENIED = 'E_PERMISSION_DENIED',

  // Capacity errors
  E_CAPACITY = 'E_CAPACITY',

  // Circuit breaker errors
  E_CIRCUIT_OPEN = 'E_CIRCUIT_OPEN',
}

/**
 * Custom error for cancellation
 */
export class CancellationError extends Error {
  constructor(message = 'Operation cancelled') {
    super(message);
    this.name = 'CancellationError';
  }
}