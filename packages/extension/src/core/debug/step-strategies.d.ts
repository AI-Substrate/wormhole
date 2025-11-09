/**
 * Type definitions for step-strategies.js
 */

export abstract class ThreadResolver {
    abstract resolve(session: any, vscode: any): Promise<number[]>;
}

export class SingleThreadResolver extends ThreadResolver {
    resolve(session: any, vscode: any): Promise<number[]>;
}

export class MultiThreadResolver extends ThreadResolver {
    resolve(session: any, vscode: any): Promise<number[]>;
}

export abstract class StepExecutor {
    constructor(dapCommand: string);
    dapCommand: string;
    abstract execute(session: any, threadIds: number[]): Promise<void>;
}

export class SingleThreadStepExecutor extends StepExecutor {
    constructor(dapCommand: string);
    execute(session: any, threadIds: number[]): Promise<void>;
}

export class MultiThreadStepExecutor extends StepExecutor {
    constructor(dapCommand: string);
    execute(session: any, threadIds: number[]): Promise<void>;
}

export abstract class WaitStrategy {
    abstract wait(
        session: any,
        threadIds: number[],
        vscode: any,
        stepOperation: () => Promise<void>,
        timeoutMs: number
    ): Promise<any>;
}

export class EventDrivenWaitStrategy extends WaitStrategy {
    wait(
        session: any,
        threadIds: number[],
        vscode: any,
        stepOperation: () => Promise<void>,
        timeoutMs: number
    ): Promise<any>;
}

export class PollingWaitStrategy extends WaitStrategy {
    wait(
        session: any,
        threadIds: number[],
        vscode: any,
        stepOperation: () => Promise<void>,
        timeoutMs: number
    ): Promise<any>;
}

export function getStepStrategies(
    sessionType: string,
    dapCommand: string
): {
    threadResolver: ThreadResolver;
    stepExecutor: StepExecutor;
    waitStrategy: WaitStrategy;
};
