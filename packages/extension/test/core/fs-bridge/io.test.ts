import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  writeJsonAtomic,
  writeJsonAtomicAsync,
  readJsonSafe,
  exists,
  ensureDir,
  cleanupTempFiles
} from '../../../src/core/fs-bridge/io';

suite('Filesystem I/O - Atomic Operations', () => {
  let tempDir: string;
  let sandbox: sinon.SinonSandbox;

  setup(async () => {
    sandbox = sinon.createSandbox();
    tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'io-test-'));
  });

  teardown(async () => {
    sandbox.restore();
    try {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  test('writeJsonAtomic prevents partial reads', async () => {
    const targetPath = path.join(tempDir, 'test.json');
    const testData = { foo: 'bar', count: 42 };

    // Spy on fs operations to verify temp file pattern
    const renameSpy = sandbox.spy(fs, 'renameSync');

    // Write atomically
    writeJsonAtomic(targetPath, testData);

    // Verify rename was called (atomic operation)
    assert.strictEqual(renameSpy.calledOnce, true);
    const [tmpPath, finalPath] = renameSpy.firstCall.args;
    assert.strictEqual(finalPath, targetPath);
    assert.ok(tmpPath.includes('.tmp'), 'Should use .tmp extension');
    assert.ok(tmpPath.includes(String(process.pid)), 'Should include PID');

    // Verify final file contents
    const content = JSON.parse(await fsPromises.readFile(targetPath, 'utf8'));
    assert.deepStrictEqual(content, testData);

    // Verify no temp files remain
    const files = await fsPromises.readdir(tempDir);
    const tmpFiles = files.filter(f => f.endsWith('.tmp'));
    assert.strictEqual(tmpFiles.length, 0, 'No temp files should remain');
  });

  test('writeJsonAtomicAsync handles async operations', async () => {
    const targetPath = path.join(tempDir, 'async-test.json');
    const testData = { async: true, items: [1, 2, 3] };

    await writeJsonAtomicAsync(targetPath, testData);

    // Verify file was written
    assert.strictEqual(await exists(targetPath), true);

    // Verify contents
    const content = await readJsonSafe(targetPath);
    assert.deepStrictEqual(content, testData);
  });

  test('Concurrent writes don\'t corrupt data', async () => {
    const targetPath = path.join(tempDir, 'concurrent.json');
    const writers = [];

    // Launch 10 concurrent writes
    for (let i = 0; i < 10; i++) {
      writers.push(
        writeJsonAtomicAsync(targetPath, {
          writer: i,
          timestamp: Date.now(),
          data: 'x'.repeat(1000) // Some bulk to increase collision chance
        })
      );
    }

    await Promise.all(writers);

    // File should exist and be valid JSON
    const content = await readJsonSafe(targetPath);
    assert.ok(content.writer !== undefined, 'Should have a writer field');
    assert.ok(typeof content.writer === 'number', 'Writer should be a number');
    assert.ok(content.writer >= 0 && content.writer < 10, 'Writer should be 0-9');
  });

  test('readJsonSafe handles mid-rename gracefully', async () => {
    const targetPath = path.join(tempDir, 'read-test.json');

    // Write initial data
    await writeJsonAtomicAsync(targetPath, { initial: true });

    // Stub readFile to simulate ENOENT on first attempt
    const readStub = sandbox.stub(fsPromises, 'readFile');
    let attempt = 0;
    readStub.callsFake(async (path: any, encoding: any) => {
      attempt++;
      if (attempt === 1) {
        const error = new Error('ENOENT') as any;
        error.code = 'ENOENT';
        throw error;
      }
      // Second attempt succeeds
      return JSON.stringify({ retried: true });
    });

    const result = await readJsonSafe(targetPath);
    assert.deepStrictEqual(result, { retried: true });
    assert.strictEqual(attempt, 2, 'Should have retried once');
  });

  test('cleanupTempFiles removes old temp files', async () => {
    // Create some temp files with different ages
    const oldTmp = path.join(tempDir, '.old.json.123.456.tmp');
    const newTmp = path.join(tempDir, '.new.json.789.012.tmp');
    const regularFile = path.join(tempDir, 'regular.json');

    await fsPromises.writeFile(oldTmp, '{}');
    await fsPromises.writeFile(newTmp, '{}');
    await fsPromises.writeFile(regularFile, '{}');

    // Make old file appear old
    const oldTime = new Date(Date.now() - 120000); // 2 minutes old
    await fsPromises.utimes(oldTmp, oldTime, oldTime);

    // Clean up with 1 minute threshold
    const cleaned = await cleanupTempFiles(tempDir, 60000);

    assert.strictEqual(cleaned, 1, 'Should clean 1 old temp file');

    // Verify what remains
    const files = await fsPromises.readdir(tempDir);
    assert.ok(files.includes('regular.json'), 'Regular file should remain');
    assert.ok(files.includes(path.basename(newTmp)), 'New temp should remain');
    assert.ok(!files.includes(path.basename(oldTmp)), 'Old temp should be gone');
  });

  test('Windows-safe temp file naming', () => {
    const targetPath = 'C:\\Users\\test\\data.json';

    // Mock Windows platform
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', {
      value: 'win32',
      configurable: true
    });

    // Spy on fs operations
    const openSpy = sandbox.stub(fs, 'openSync').returns(123);
    const writeSpy = sandbox.stub(fs, 'writeFileSync');
    const closeSpy = sandbox.stub(fs, 'closeSync');
    const renameSpy = sandbox.stub(fs, 'renameSync');

    writeJsonAtomic(targetPath, { test: true });

    // Verify temp path doesn't contain colons (except drive letter)
    const tmpPath = openSpy.firstCall.args[0] as string;
    const withoutDrive = tmpPath.substring(2); // Skip "C:"
    assert.ok(!withoutDrive.includes(':'), 'Temp path should not contain colons');

    // Restore platform
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  test('Large payload handling', async () => {
    const targetPath = path.join(tempDir, 'large.json');

    // Create a 3MB payload
    const largeData = {
      data: 'x'.repeat(3 * 1024 * 1024),
      metadata: { size: 'large' }
    };

    await writeJsonAtomicAsync(targetPath, largeData);

    // Should still be readable
    const content = await readJsonSafe<typeof largeData>(targetPath);
    assert.strictEqual(content.data.length, largeData.data.length);
    assert.deepStrictEqual(content.metadata, largeData.metadata);
  });

  test('Invalid JSON write protection', () => {
    const targetPath = path.join(tempDir, 'invalid.json');

    // Create object with circular reference
    const circular: any = { a: 1 };
    circular.self = circular;

    // Should throw on stringify, not corrupt file
    assert.throws(
      () => writeJsonAtomic(targetPath, circular),
      /circular|cyclic/i
    );

    // File should not exist
    assert.ok(!fs.existsSync(targetPath), 'File should not be created on error');
  });
});