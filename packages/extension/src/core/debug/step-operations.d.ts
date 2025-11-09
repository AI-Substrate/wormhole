/**
 * Type definitions for step-operations.js
 */

export interface StepOperationConfig {
    threadResolver: any;
    stepExecutor: any;
    waitStrategy: any;
    commandName: string;
}

export interface StepOperationResult {
    event: 'stopped' | 'terminated' | 'error';
    file?: string;
    line?: number;
    column?: number;
    message?: string;
    code?: string;
    hint?: string;
}

export function executeStepOperation(
    bridgeContext: any,
    params: any,
    config: StepOperationConfig
): Promise<StepOperationResult>;
