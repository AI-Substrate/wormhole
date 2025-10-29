/**
 * Memory Budget Tracking
 *
 * Implements dual budget system (nodes + bytes) to prevent extension host crashes
 * when traversing large data structures during debugging.
 *
 * Critical Discovery 03: Memory Budget Critical for Large Data
 * - Hard limits: 20,000 nodes OR 5MB bytes
 * - Suggests streaming alternative when exceeded
 */

/**
 * Result from attempting to add a node to the budget
 * Per Subtask 001 ST013: Structured return instead of boolean
 */
export interface IAddNodeResult {
    /** Whether the node was successfully added */
    ok: boolean;

    /** Reason for failure if ok is false */
    reason?: 'node-limit' | 'byte-limit';

    /** Remaining capacity after the operation */
    remaining: {
        /** Nodes remaining before limit */
        nodes: number;
        /** Bytes remaining before limit */
        bytes: number;
        /** Percentage of budget used (worst case of nodes/bytes) */
        percentage: number;
    };
}

/**
 * Memory budget interface
 */
export interface IMemoryBudget {
    /** Maximum number of nodes allowed */
    readonly maxNodes: number;

    /** Maximum number of bytes allowed */
    readonly maxBytes: number;

    /** Current number of nodes traversed */
    readonly currentNodes: number;

    /** Current number of bytes consumed */
    readonly currentBytes: number;

    /**
     * Check if budget is exceeded
     */
    isExceeded(): boolean;

    /**
     * Try to add a node to the budget
     * Per Subtask 001 ST013: Now returns structured result
     * @param bytes Approximate size in bytes
     * @returns Structured result with ok status and remaining capacity
     */
    addNode(bytes: number): IAddNodeResult;

    /**
     * Get remaining capacity
     * Per Subtask 001 ST012: New method for capacity awareness
     * @returns Remaining nodes, bytes, and percentage used
     */
    remaining(): { nodes: number; bytes: number; percentage: number };

    /**
     * Reset budget counters
     */
    reset(): void;

    /**
     * Get suggestion message for exceeding budget
     */
    getSuggestion(): string;

    /**
     * Get current status
     */
    getStatus(): {
        currentNodes: number;
        currentBytes: number;
        maxNodes: number;
        maxBytes: number;
        percentNodes: number;
        percentBytes: number;
    };
}

/**
 * Concrete memory budget implementation
 */
export class MemoryBudget implements IMemoryBudget {
    private _currentNodes: number = 0;
    private _currentBytes: number = 0;

    /**
     * Create memory budget
     * @param maxNodes Maximum nodes (default: 20,000)
     * @param maxBytes Maximum bytes (default: 5MB)
     */
    constructor(
        private readonly _maxNodes: number = 20000,
        private readonly _maxBytes: number = 5 * 1024 * 1024 // 5MB
    ) {}

    get maxNodes(): number {
        return this._maxNodes;
    }

    get maxBytes(): number {
        return this._maxBytes;
    }

    get currentNodes(): number {
        return this._currentNodes;
    }

    get currentBytes(): number {
        return this._currentBytes;
    }

    isExceeded(): boolean {
        return this._currentNodes >= this._maxNodes || this._currentBytes >= this._maxBytes;
    }

    /**
     * Get remaining capacity in the budget
     * Per Subtask 001 ST012: Provides visibility into budget consumption
     */
    remaining(): { nodes: number; bytes: number; percentage: number } {
        const nodePercent = (this._currentNodes / this._maxNodes) * 100;
        const bytePercent = (this._currentBytes / this._maxBytes) * 100;

        return {
            nodes: this._maxNodes - this._currentNodes,
            bytes: this._maxBytes - this._currentBytes,
            // Use worst case (maximum) percentage
            percentage: Math.max(nodePercent, bytePercent)
        };
    }

    /**
     * Try to add a node to the budget
     * Per Subtask 001 ST013: Returns structured result with failure reason
     */
    addNode(bytes: number): IAddNodeResult {
        // Get current remaining capacity
        const currentRemaining = this.remaining();

        // Check node limit first
        if (this._currentNodes >= this._maxNodes) {
            return {
                ok: false,
                reason: 'node-limit',
                remaining: currentRemaining
            };
        }

        // Check byte limit
        if (this._currentBytes + bytes > this._maxBytes) {
            return {
                ok: false,
                reason: 'byte-limit',
                remaining: currentRemaining
            };
        }

        // Add the node
        this._currentNodes++;
        this._currentBytes += bytes;

        // Return success with updated remaining capacity
        return {
            ok: true,
            remaining: this.remaining()
        };
    }

    reset(): void {
        this._currentNodes = 0;
        this._currentBytes = 0;
    }

    getSuggestion(): string {
        const nodeLimit = this._currentNodes >= this._maxNodes;
        const byteLimit = this._currentBytes >= this._maxBytes;

        if (nodeLimit && byteLimit) {
            return `Data exceeds both limits (${this._currentNodes.toLocaleString()} nodes, ${this._formatBytes(this._currentBytes)}). Consider using debug.stream-variables to write large data to a file instead.`;
        } else if (nodeLimit) {
            return `Data exceeds node limit (${this._currentNodes.toLocaleString()} nodes). Consider using debug.stream-variables to write large data to a file instead.`;
        } else if (byteLimit) {
            return `Data exceeds size limit (${this._formatBytes(this._currentBytes)}). Consider using debug.stream-variables to write large data to a file instead.`;
        }

        return 'Consider using debug.stream-variables for file output.';
    }

    getStatus() {
        return {
            currentNodes: this._currentNodes,
            currentBytes: this._currentBytes,
            maxNodes: this._maxNodes,
            maxBytes: this._maxBytes,
            percentNodes: (this._currentNodes / this._maxNodes) * 100,
            percentBytes: (this._currentBytes / this._maxBytes) * 100
        };
    }

    private _formatBytes(bytes: number): string {
        if (bytes >= 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
        } else if (bytes >= 1024) {
            return `${(bytes / 1024).toFixed(2)}KB`;
        }
        return `${bytes}B`;
    }
}
