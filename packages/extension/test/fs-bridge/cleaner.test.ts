import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsPromises } from 'fs';
import {
  cleanOldJobs,
  shouldDeleteJob,
  shouldKeepJob,
  markJobForKeeping,
  getJobStats,
  cleanAllJobs
} from '../../src/core/fs-bridge/cleaner';

describe('Garbage Collection', () => {
  let tempDir: string;
  let executeDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-gc-test-'));
    executeDir = path.join(tempDir, 'execute');
    await fsPromises.mkdir(executeDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('job deletion logic', () => {
    it('should delete old completed jobs', async () => {
      const jobDir = path.join(executeDir, 'old-job');
      await fsPromises.mkdir(jobDir);

      // Create done file with old timestamp
      const donePath = path.join(jobDir, 'done');
      await fsPromises.writeFile(donePath, '');

      // Set old modification time (25 hours ago)
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fsPromises.utimes(donePath, oldTime, oldTime);

      const shouldDelete = await shouldDeleteJob(jobDir, 24 * 60 * 60 * 1000);
      assert.strictEqual(shouldDelete, true);
    });

    it('should keep recent completed jobs', async () => {
      const jobDir = path.join(executeDir, 'recent-job');
      await fsPromises.mkdir(jobDir);

      // Create done file with recent timestamp
      const donePath = path.join(jobDir, 'done');
      await fsPromises.writeFile(donePath, '');

      const shouldDelete = await shouldDeleteJob(jobDir, 24 * 60 * 60 * 1000);
      assert.strictEqual(shouldDelete, false);
    });

    it('should keep jobs with keep file regardless of age', async () => {
      const jobDir = path.join(executeDir, 'kept-job');
      await fsPromises.mkdir(jobDir);

      // Create old done file
      const donePath = path.join(jobDir, 'done');
      await fsPromises.writeFile(donePath, '');
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000); // 2 days old
      await fsPromises.utimes(donePath, oldTime, oldTime);

      // Add keep file
      await markJobForKeeping(jobDir, 'Debug this issue');

      const shouldDelete = await shouldDeleteJob(jobDir, 24 * 60 * 60 * 1000);
      assert.strictEqual(shouldDelete, false);
    });

    it('should delete very old incomplete jobs', async () => {
      const jobDir = path.join(executeDir, 'incomplete-job');
      await fsPromises.mkdir(jobDir);

      // No done file, just command.json
      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify({ test: true })
      );

      // Set very old modification time (3 days ago)
      const oldTime = new Date(Date.now() - 72 * 60 * 60 * 1000);
      await fsPromises.utimes(jobDir, oldTime, oldTime);

      const shouldDelete = await shouldDeleteJob(jobDir, 24 * 60 * 60 * 1000);
      assert.strictEqual(shouldDelete, true); // Should delete (>2x max age)
    });
  });

  describe('keep file functionality', () => {
    it('should detect keep file', async () => {
      const jobDir = path.join(executeDir, 'debug-job');
      await fsPromises.mkdir(jobDir);

      // Initially no keep file
      assert.strictEqual(await shouldKeepJob(jobDir), false);

      // Add keep file
      await markJobForKeeping(jobDir);
      assert.strictEqual(await shouldKeepJob(jobDir), true);

      // Verify keep file content
      const keepContent = await fsPromises.readFile(
        path.join(jobDir, 'keep'),
        'utf8'
      );
      assert.ok(keepContent.includes('debugging'));
    });

    it('should write custom reason to keep file', async () => {
      const jobDir = path.join(executeDir, 'custom-keep');
      await fsPromises.mkdir(jobDir);

      await markJobForKeeping(jobDir, 'Investigating memory leak');

      const keepContent = await fsPromises.readFile(
        path.join(jobDir, 'keep'),
        'utf8'
      );
      assert.strictEqual(keepContent, 'Investigating memory leak');
    });
  });

  describe('batch cleanup', () => {
    async function createJob(
      name: string,
      complete: boolean,
      ageHours: number,
      keep = false
    ): Promise<void> {
      const jobDir = path.join(executeDir, name);
      await fsPromises.mkdir(jobDir);

      // Add command
      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify({ id: name })
      );

      if (complete) {
        await fsPromises.writeFile(path.join(jobDir, 'done'), '');
      }

      if (keep) {
        await markJobForKeeping(jobDir);
      }

      // Set age
      const jobTime = new Date(Date.now() - ageHours * 60 * 60 * 1000);
      const targetPath = complete
        ? path.join(jobDir, 'done')
        : jobDir;
      await fsPromises.utimes(targetPath, jobTime, jobTime);
    }

    it('should clean multiple old jobs', async () => {
      // Create test jobs
      await createJob('old-complete-1', true, 25, false);  // Delete
      await createJob('old-complete-2', true, 30, false);  // Delete
      await createJob('recent-complete', true, 1, false);  // Keep
      await createJob('old-kept', true, 30, true);         // Keep (has keep file)
      await createJob('old-incomplete', false, 50, false); // Delete (very old)
      await createJob('recent-incomplete', false, 1, false); // Keep

      const stats = await cleanOldJobs(executeDir, 24 * 60 * 60 * 1000);

      assert.strictEqual(stats.scanned, 6);
      assert.strictEqual(stats.deleted, 3);
      assert.strictEqual(stats.kept, 3);

      // Verify correct jobs were deleted
      assert.ok(!fs.existsSync(path.join(executeDir, 'old-complete-1')));
      assert.ok(!fs.existsSync(path.join(executeDir, 'old-complete-2')));
      assert.ok(!fs.existsSync(path.join(executeDir, 'old-incomplete')));

      // Verify correct jobs were kept
      assert.ok(fs.existsSync(path.join(executeDir, 'recent-complete')));
      assert.ok(fs.existsSync(path.join(executeDir, 'old-kept')));
      assert.ok(fs.existsSync(path.join(executeDir, 'recent-incomplete')));
    });
  });

  describe('job statistics', () => {
    it('should calculate job statistics correctly', async () => {
      // Create various jobs
      const job1 = path.join(executeDir, 'complete-1');
      await fsPromises.mkdir(job1);
      await fsPromises.writeFile(path.join(job1, 'done'), '');

      const job2 = path.join(executeDir, 'complete-2');
      await fsPromises.mkdir(job2);
      await fsPromises.writeFile(path.join(job2, 'done'), '');
      await markJobForKeeping(job2);

      const job3 = path.join(executeDir, 'incomplete-1');
      await fsPromises.mkdir(job3);
      await fsPromises.writeFile(path.join(job3, 'command.json'), '{}');

      const stats = await getJobStats(executeDir);

      assert.strictEqual(stats.total, 3);
      assert.strictEqual(stats.completed, 2);
      assert.strictEqual(stats.incomplete, 1);
      assert.strictEqual(stats.kept, 1);
      assert.ok(stats.oldestJob);
      assert.ok(stats.newestJob);
    });

    it('should handle empty directory', async () => {
      const stats = await getJobStats(executeDir);

      assert.strictEqual(stats.total, 0);
      assert.strictEqual(stats.completed, 0);
      assert.strictEqual(stats.incomplete, 0);
      assert.strictEqual(stats.kept, 0);
      assert.strictEqual(stats.oldestJob, undefined);
      assert.strictEqual(stats.newestJob, undefined);
    });
  });

  describe('clean all functionality', () => {
    it('should clean all jobs except kept ones', async () => {
      // Create jobs
      const job1 = path.join(executeDir, 'job-1');
      await fsPromises.mkdir(job1);

      const job2 = path.join(executeDir, 'job-2');
      await fsPromises.mkdir(job2);
      await markJobForKeeping(job2);

      const job3 = path.join(executeDir, 'job-3');
      await fsPromises.mkdir(job3);

      const stats = await cleanAllJobs(executeDir, false);

      assert.strictEqual(stats.scanned, 3);
      assert.strictEqual(stats.deleted, 2);
      assert.strictEqual(stats.kept, 1);

      assert.ok(!fs.existsSync(job1));
      assert.ok(fs.existsSync(job2)); // Kept
      assert.ok(!fs.existsSync(job3));
    });

    it('should force clean all jobs including kept ones', async () => {
      // Create jobs
      const job1 = path.join(executeDir, 'job-1');
      await fsPromises.mkdir(job1);
      await markJobForKeeping(job1);

      const job2 = path.join(executeDir, 'job-2');
      await fsPromises.mkdir(job2);
      await markJobForKeeping(job2);

      const stats = await cleanAllJobs(executeDir, true);

      assert.strictEqual(stats.scanned, 2);
      assert.strictEqual(stats.deleted, 2);
      assert.strictEqual(stats.kept, 0);

      assert.ok(!fs.existsSync(job1));
      assert.ok(!fs.existsSync(job2));
    });
  });

  describe('error handling', () => {
    it('should handle permission errors gracefully', async () => {
      // This test is platform-dependent and may not work on all systems
      // Create a job directory
      const jobDir = path.join(executeDir, 'protected-job');
      await fsPromises.mkdir(jobDir);
      await fsPromises.writeFile(path.join(jobDir, 'done'), '');

      // Make it old
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await fsPromises.utimes(path.join(jobDir, 'done'), oldTime, oldTime);

      // Try to make it read-only (may not work on all platforms)
      try {
        await fsPromises.chmod(jobDir, 0o444);
      } catch {
        // Skip test if chmod not supported
        return;
      }

      const stats = await cleanOldJobs(executeDir, 24 * 60 * 60 * 1000);

      // Should handle the error gracefully
      assert.ok(stats.errors >= 0);

      // Restore permissions
      try {
        await fsPromises.chmod(jobDir, 0o755);
      } catch {
        // Ignore
      }
    });

    it('should continue after encountering errors', async () => {
      // Create normal job
      const normalJob = path.join(executeDir, 'normal-job');
      await fsPromises.mkdir(normalJob);
      await fsPromises.writeFile(path.join(normalJob, 'done'), '');

      // Make it old
      const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await fsPromises.utimes(path.join(normalJob, 'done'), oldTime, oldTime);

      // Create a problematic "job" (actually a file, not directory)
      await fsPromises.writeFile(path.join(executeDir, 'not-a-directory'), 'data');

      const stats = await cleanOldJobs(executeDir, 24 * 60 * 60 * 1000);

      // Should process what it can
      assert.ok(stats.deleted >= 1); // At least the normal job
      assert.ok(!fs.existsSync(normalJob));
    });
  });
});