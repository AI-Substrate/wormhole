import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  launchJob,
  inFlight,
  MAX_CONCURRENT,
  processCommand
} from '../../src/core/fs-bridge/processor';import { ErrorCode } from '../../src/core/fs-bridge/types';

describe('Concurrent Job Execution', () => {
  let testDir: string;
  let jobDirs: string[] = [];

  beforeEach(async () => {
    // Create temp directory for test jobs
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bridge-test-'));
  });

  afterEach(async () => {
    // Cleanup
    if (testDir) {
      await fs.promises.rm(testDir, { recursive: true, force: true });
    }
    jobDirs = [];
  });

  function createMockJobDir(index: number): string {
    const jobDir = path.join(testDir, `job-${index}`);
    fs.mkdirSync(jobDir, { recursive: true });

    // Create minimal command.json
    const command = {
      version: 1,
      clientId: 'test',
      id: `test-${index}`,
      createdAt: new Date().toISOString(),
      scriptName: 'test.script',
      params: {}
    };
    fs.writeFileSync(path.join(jobDir, 'command.json'), JSON.stringify(command));

    jobDirs.push(jobDir);
    return jobDir;
  }

  describe('launchJob() capacity checking', () => {
    test('given_capacity_available_when_launchJob_called_then_job_starts', async () => {
      // Arrange
      const jobDir = createMockJobDir(1);
      const bridgeId = 'test-bridge';
      const mockExecutor = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      });

      // Act
      launchJob(jobDir, bridgeId, mockExecutor);

      // Assert - check that inFlight increased
      expect(inFlight).toBe(1);

      // Wait for job to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // inFlight should be back to 0
      expect(inFlight).toBe(0);
    });

    test('given_capacity_exceeded_when_launchJob_called_then_E_CAPACITY_written', async () => {
      // Arrange - fill capacity
      const executingJobs: string[] = [];
      const mockExecutor = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Keep jobs "in flight"
        return { success: true };
      });

      // Launch MAX_CONCURRENT jobs
      for (let i = 0; i < MAX_CONCURRENT; i++) {
        const jobDir = createMockJobDir(i);
        launchJob(jobDir, 'test-bridge', mockExecutor);
        executingJobs.push(jobDir);
      }

      // Act - try to launch one more (should hit capacity)
      const overCapacityJob = createMockJobDir(99);
      launchJob(overCapacityJob, 'test-bridge', mockExecutor);

      // Assert - check for E_CAPACITY error
      await new Promise(resolve => setTimeout(resolve, 100)); // Let error write complete

      const errorPath = path.join(overCapacityJob, 'error.json');
      const donePath = path.join(overCapacityJob, 'done');

      expect(fs.existsSync(errorPath)).toBe(true);
      expect(fs.existsSync(donePath)).toBe(true);

      const errorData = JSON.parse(fs.readFileSync(errorPath, 'utf8'));
      expect(errorData.error.code).toBe(ErrorCode.E_CAPACITY);

      // Cleanup - wait for executing jobs to complete
      await new Promise(resolve => setTimeout(resolve, 600));
    });
  });

  describe('Counter management', () => {
    test('given_job_fails_when_executing_then_inFlight_decrements', async () => {
      // Arrange
      const jobDir = createMockJobDir(1);
      const bridgeId = 'test-bridge';
      const failingExecutor = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        throw new Error('Test failure');
      });

      // Act
      launchJob(jobDir, bridgeId, failingExecutor);

      // Assert - immediately after launch, inFlight should be 1
      expect(inFlight).toBe(1);

      // Wait for failure
      await new Promise(resolve => setTimeout(resolve, 200));

      // inFlight should be back to 0 even on failure
      expect(inFlight).toBe(0);
    });
  });

  describe('Concurrent execution proof', () => {
    test('given_10_jobs_when_launched_then_multiple_start_before_any_finishes', async () => {
      // Arrange - use promise barriers to track execution lifecycle
      const startedJobs: number[] = [];
      const finishedJobs: number[] = [];
      let firstFinishTime: number | null = null;

      const mockExecutor = vi.fn(async (cmd: any) => {
        // Record that this job started
        const jobIndex = parseInt(cmd.id.split('-')[1]);
        startedJobs.push(jobIndex);

        // Simulate work with controlled delay
        await new Promise(resolve => setTimeout(resolve, 100));

        // Record first job to finish
        if (firstFinishTime === null) {
          firstFinishTime = Date.now();
        }
        finishedJobs.push(jobIndex);

        return { success: true };
      });

      // Act - launch 10 jobs rapidly
      for (let i = 0; i < 10; i++) {
        const jobDir = createMockJobDir(i);
        launchJob(jobDir, 'test-bridge', mockExecutor);
      }

      // Wait for jobs to start executing (not complete)
      await new Promise(resolve => setTimeout(resolve, 50));

      // Assert - PROOF OF CONCURRENCY:
      // Multiple jobs must have started BEFORE any single job finished
      // This is impossible in sequential execution where each job blocks the next
      expect(startedJobs.length).toBeGreaterThan(1); // At least 2 jobs started
      expect(finishedJobs.length).toBe(0); // But NONE finished yet

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      // Final sanity checks
      expect(startedJobs.length).toBe(10); // All started
      expect(finishedJobs.length).toBe(10); // All finished
    });
  });
});
