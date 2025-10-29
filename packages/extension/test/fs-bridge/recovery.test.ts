import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promises as fsPromises } from 'fs';
import {
  recoverStaleJobs,
  isJobStale,
  reclaimAndProcess,
  cleanOrphanedJobs
} from '../../src/core/fs-bridge/recovery';
import { claimJobAtomic } from '../../src/core/fs-bridge/processor';
import { CommandJson, ClaimedJson } from '../../src/core/fs-bridge/types';

describe('Lease Recovery', () => {
  let tempDir: string;
  let executeDir: string;

  beforeEach(async () => {
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vsc-bridge-recovery-test-'));
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

  describe('stale job detection', () => {
    it('should detect stale job with expired lease', async () => {
      const jobDir = path.join(executeDir, 'stale-job-1');
      await fsPromises.mkdir(jobDir);

      // Create command
      const command: CommandJson = {
        version: 1,
        clientId: 'test',
        id: 'stale-job-1',
        createdAt: new Date().toISOString(),
        scriptName: 'test.script',
        params: {}
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Create expired claim
      const claim: ClaimedJson = {
        bridgeId: 'old-bridge',
        claimedAt: new Date(Date.now() - 120000).toISOString(), // 2 minutes ago
        pid: 99999, // Non-existent process
        leaseExpiresAt: new Date(Date.now() - 60000).toISOString() // Expired 1 minute ago
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(claim)
      );

      const stale = await isJobStale(jobDir, 60000);
      assert.strictEqual(stale, true);
    });

    it('should not consider completed jobs as stale', async () => {
      const jobDir = path.join(executeDir, 'complete-job');
      await fsPromises.mkdir(jobDir);

      // Create expired claim
      const claim: ClaimedJson = {
        bridgeId: 'old-bridge',
        claimedAt: new Date(Date.now() - 120000).toISOString(),
        pid: 99999,
        leaseExpiresAt: new Date(Date.now() - 60000).toISOString()
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(claim)
      );

      // But job is done
      await fsPromises.writeFile(path.join(jobDir, 'done'), '');

      const stale = await isJobStale(jobDir, 60000);
      assert.strictEqual(stale, false);
    });

    it('should not consider jobs with valid lease as stale', async () => {
      const jobDir = path.join(executeDir, 'active-job');
      await fsPromises.mkdir(jobDir);

      // Create valid claim
      const claim: ClaimedJson = {
        bridgeId: 'active-bridge',
        claimedAt: new Date().toISOString(),
        pid: process.pid, // Current process
        leaseExpiresAt: new Date(Date.now() + 30000).toISOString() // Expires in 30 seconds
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(claim)
      );

      const stale = await isJobStale(jobDir, 60000);
      assert.strictEqual(stale, false);
    });

    it('should handle unclaimed jobs gracefully', async () => {
      const jobDir = path.join(executeDir, 'unclaimed-job');
      await fsPromises.mkdir(jobDir);

      // No claimed.json file
      const stale = await isJobStale(jobDir, 60000);
      assert.strictEqual(stale, false);
    });
  });

  describe('reclaim and process', () => {
    it('should successfully reclaim stale job', async () => {
      const jobDir = path.join(executeDir, 'reclaim-job');
      await fsPromises.mkdir(jobDir);

      // Create command
      const command: CommandJson = {
        version: 1,
        clientId: 'test',
        id: 'reclaim-job',
        createdAt: new Date().toISOString(),
        scriptName: 'test.script',
        params: { value: 123 }
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Create stale claim
      const staleClaim: ClaimedJson = {
        bridgeId: 'old-bridge',
        claimedAt: new Date(Date.now() - 120000).toISOString(),
        pid: 99999,
        leaseExpiresAt: new Date(Date.now() - 60000).toISOString()
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(staleClaim)
      );

      // Reclaim without processing
      const reclaimed = await reclaimAndProcess(jobDir, 'new-bridge');
      assert.strictEqual(reclaimed, true);

      // Verify new claim
      const newClaim = JSON.parse(
        await fsPromises.readFile(path.join(jobDir, 'claimed.json'), 'utf8')
      ) as ClaimedJson;
      assert.strictEqual(newClaim.bridgeId, 'new-bridge');
    });

    it('should process reclaimed job if executor provided', async () => {
      const jobDir = path.join(executeDir, 'process-job');
      await fsPromises.mkdir(jobDir);

      // Create command
      const command: CommandJson = {
        version: 1,
        clientId: 'test',
        id: 'process-job',
        createdAt: new Date().toISOString(),
        scriptName: 'test.script',
        params: { value: 456 }
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'command.json'),
        JSON.stringify(command)
      );

      // Create stale claim
      const staleClaim: ClaimedJson = {
        bridgeId: 'old-bridge',
        claimedAt: new Date(Date.now() - 120000).toISOString(),
        pid: 99999,
        leaseExpiresAt: new Date(Date.now() - 60000).toISOString()
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(staleClaim)
      );

      let processedCommand: CommandJson | null = null;

      // Reclaim with executor
      const reclaimed = await reclaimAndProcess(jobDir, 'new-bridge', async (cmd) => {
        processedCommand = cmd;
        return { processed: true };
      });

      assert.strictEqual(reclaimed, true);
      assert.ok(processedCommand);
      assert.strictEqual(processedCommand!.params.value, 456);

      // Verify job is done
      assert.ok(fs.existsSync(path.join(jobDir, 'done')));
      assert.ok(fs.existsSync(path.join(jobDir, 'response.json')));
    });

    it('should handle race condition during reclaim', async () => {
      const jobDir = path.join(executeDir, 'race-job');
      await fsPromises.mkdir(jobDir);

      // Create stale claim
      const staleClaim: ClaimedJson = {
        bridgeId: 'old-bridge',
        claimedAt: new Date(Date.now() - 120000).toISOString(),
        pid: 99999,
        leaseExpiresAt: new Date(Date.now() - 60000).toISOString()
      };
      await fsPromises.writeFile(
        path.join(jobDir, 'claimed.json'),
        JSON.stringify(staleClaim)
      );

      // Remove stale claim
      await fsPromises.unlink(path.join(jobDir, 'claimed.json'));

      // Someone else claims it first
      claimJobAtomic(jobDir, 'other-bridge');

      // Our reclaim should fail
      const reclaimed = await reclaimAndProcess(jobDir, 'our-bridge');
      assert.strictEqual(reclaimed, false);

      // Verify other bridge owns it
      const claim = JSON.parse(
        await fsPromises.readFile(path.join(jobDir, 'claimed.json'), 'utf8')
      ) as ClaimedJson;
      assert.strictEqual(claim.bridgeId, 'other-bridge');
    });
  });

  describe('batch recovery', () => {
    it('should recover multiple stale jobs', async () => {
      // Create multiple jobs
      const jobCount = 5;
      for (let i = 0; i < jobCount; i++) {
        const jobDir = path.join(executeDir, `job-${i}`);
        await fsPromises.mkdir(jobDir);

        // Create command
        const command: CommandJson = {
          version: 1,
          clientId: 'test',
          id: `job-${i}`,
          createdAt: new Date().toISOString(),
          scriptName: 'test.script',
          params: { index: i }
        };
        await fsPromises.writeFile(
          path.join(jobDir, 'command.json'),
          JSON.stringify(command)
        );

        if (i < 3) {
          // Make first 3 stale
          const staleClaim: ClaimedJson = {
            bridgeId: 'old-bridge',
            claimedAt: new Date(Date.now() - 120000).toISOString(),
            pid: 99999,
            leaseExpiresAt: new Date(Date.now() - 60000).toISOString()
          };
          await fsPromises.writeFile(
            path.join(jobDir, 'claimed.json'),
            JSON.stringify(staleClaim)
          );
        } else if (i === 3) {
          // One with valid lease
          const validClaim: ClaimedJson = {
            bridgeId: 'active-bridge',
            claimedAt: new Date().toISOString(),
            pid: process.pid,
            leaseExpiresAt: new Date(Date.now() + 30000).toISOString()
          };
          await fsPromises.writeFile(
            path.join(jobDir, 'claimed.json'),
            JSON.stringify(validClaim)
          );
        }
        // job-4 is unclaimed
      }

      const processedJobs: string[] = [];

      const stats = await recoverStaleJobs(
        executeDir,
        'recovery-bridge',
        60000,
        async (cmd) => {
          processedJobs.push(cmd.id);
          return { recovered: true };
        }
      );

      assert.strictEqual(stats.scanned, 5);
      assert.strictEqual(stats.stale, 3);
      assert.strictEqual(stats.recovered, 3);
      assert.strictEqual(processedJobs.length, 3);

      // Verify the stale jobs were processed
      for (let i = 0; i < 3; i++) {
        assert.ok(processedJobs.includes(`job-${i}`));
        assert.ok(fs.existsSync(path.join(executeDir, `job-${i}`, 'done')));
      }
    });
  });

  describe('orphaned job cleanup', () => {
    it('should clean up orphaned job directories', async () => {
      // Create orphaned job (no command.json)
      const orphanDir = path.join(executeDir, 'orphan-1');
      await fsPromises.mkdir(orphanDir);
      await fsPromises.writeFile(path.join(orphanDir, 'junk'), 'data');

      // Make it old enough
      const oldTime = new Date(Date.now() - 120000);
      await fsPromises.utimes(orphanDir, oldTime, oldTime);

      // Create valid job
      const validDir = path.join(executeDir, 'valid-1');
      await fsPromises.mkdir(validDir);
      await fsPromises.writeFile(
        path.join(validDir, 'command.json'),
        JSON.stringify({ version: 1 } as any)
      );

      const cleaned = await cleanOrphanedJobs(executeDir);

      assert.strictEqual(cleaned, 1);
      assert.ok(!fs.existsSync(orphanDir));
      assert.ok(fs.existsSync(validDir));
    });

    it('should not clean recent orphaned directories', async () => {
      const orphanDir = path.join(executeDir, 'recent-orphan');
      await fsPromises.mkdir(orphanDir);

      // Directory is fresh (just created)
      const cleaned = await cleanOrphanedJobs(executeDir);

      assert.strictEqual(cleaned, 0);
      assert.ok(fs.existsSync(orphanDir));
    });
  });
});