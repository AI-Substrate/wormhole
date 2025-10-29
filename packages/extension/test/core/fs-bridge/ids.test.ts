import * as assert from 'assert';
import * as path from 'path';
import {
  newJobId,
  isValidJobId,
  parseJobId,
  generateUniqueJobId,
  compareJobIds,
  getJobAge
} from '../../../src/core/fs-bridge/ids';

suite('Job ID Generation - Windows Safety', () => {

  test('Generated IDs are Windows-safe', () => {
    // Generate 100 IDs and verify all are Windows-safe
    for (let i = 0; i < 100; i++) {
      const id = newJobId();

      // Check for forbidden Windows characters
      assert.ok(!id.includes(':'), `ID should not contain colons: ${id}`);
      assert.ok(!id.includes('/'), `ID should not contain forward slashes: ${id}`);
      assert.ok(!id.includes('\\'), `ID should not contain backslashes: ${id}`);
      assert.ok(!id.includes('<'), `ID should not contain less-than: ${id}`);
      assert.ok(!id.includes('>'), `ID should not contain greater-than: ${id}`);
      assert.ok(!id.includes('"'), `ID should not contain quotes: ${id}`);
      assert.ok(!id.includes('|'), `ID should not contain pipes: ${id}`);
      assert.ok(!id.includes('?'), `ID should not contain question marks: ${id}`);
      assert.ok(!id.includes('*'), `ID should not contain asterisks: ${id}`);

      // Validate with our validator
      assert.ok(isValidJobId(id), `Generated ID should be valid: ${id}`);

      // Check reasonable length for Windows MAX_PATH
      assert.ok(id.length < 64, `ID should be reasonably short: ${id.length} chars`);
    }
  });

  test('ID format is correct and parseable', () => {
    const now = new Date('2024-01-15T14:30:45.123Z');
    const id = newJobId(now);

    // Check format (YYYYMMDDTHHMMSS.mmmZ-pid-random)
    const pattern = /^\d{8}T\d{6}\.\d{3}Z-\d+-[a-f0-9]{6}$/;
    assert.ok(pattern.test(id), `ID should match expected format: ${id}`);

    // Parse and verify components
    const parsed = parseJobId(id);
    assert.ok(parsed, 'ID should be parseable');

    if (parsed) {
      // Timestamp should match (within 1ms for rounding)
      const timeDiff = Math.abs(parsed.timestamp.getTime() - now.getTime());
      assert.ok(timeDiff <= 1, `Timestamp should match: ${timeDiff}ms difference`);

      // PID should match
      assert.strictEqual(parsed.pid, process.pid);

      // Random should be 6 hex chars
      assert.ok(/^[a-f0-9]{6}$/.test(parsed.random));
    }
  });

  test('IDs are chronologically sortable', () => {
    const ids: string[] = [];

    // Generate IDs with small delays
    for (let i = 0; i < 5; i++) {
      const date = new Date(Date.UTC(2024, 0, 1, 12, 0, i));
      ids.push(newJobId(date));
    }

    // Shuffle array
    const shuffled = [...ids].sort(() => Math.random() - 0.5);

    // Sort using our comparator
    const sorted = shuffled.sort(compareJobIds);

    // Should match original chronological order
    assert.deepStrictEqual(sorted, ids);
  });

  test('IDs are unique even when generated rapidly', () => {
    const ids = new Set<string>();
    const count = 1000;

    for (let i = 0; i < count; i++) {
      ids.add(newJobId());
    }

    // All should be unique
    assert.strictEqual(ids.size, count, 'All IDs should be unique');
  });

  test('Windows MAX_PATH compatibility', () => {
    // Windows MAX_PATH is 260 chars
    const basePath = 'C:\\Users\\TestUser\\AppData\\Local\\Programs\\vscode\\workspaces\\my-project';
    const bridgePath = '\\.vsc-bridge\\execute\\';

    const id = newJobId();
    const fullPath = basePath + bridgePath + id + '\\command.json';

    assert.ok(
      fullPath.length < 260,
      `Full path should be under 260 chars: ${fullPath.length}`
    );
  });

  test('Reject invalid job IDs', () => {
    // Test Windows-forbidden characters
    assert.ok(!isValidJobId('job:123'), 'Should reject colon');
    assert.ok(!isValidJobId('job/123'), 'Should reject forward slash');
    assert.ok(!isValidJobId('job\\123'), 'Should reject backslash');
    assert.ok(!isValidJobId('job<123'), 'Should reject less-than');
    assert.ok(!isValidJobId('job>123'), 'Should reject greater-than');
    assert.ok(!isValidJobId('job"123'), 'Should reject quote');
    assert.ok(!isValidJobId('job|123'), 'Should reject pipe');
    assert.ok(!isValidJobId('job?123'), 'Should reject question mark');
    assert.ok(!isValidJobId('job*123'), 'Should reject asterisk');

    // Test Windows-reserved names
    assert.ok(!isValidJobId('CON'), 'Should reject CON');
    assert.ok(!isValidJobId('PRN'), 'Should reject PRN');
    assert.ok(!isValidJobId('AUX'), 'Should reject AUX');
    assert.ok(!isValidJobId('NUL'), 'Should reject NUL');
    assert.ok(!isValidJobId('COM1'), 'Should reject COM1');
    assert.ok(!isValidJobId('LPT1'), 'Should reject LPT1');

    // Test trailing dot/space
    assert.ok(!isValidJobId('job.'), 'Should reject trailing dot');
    assert.ok(!isValidJobId('job '), 'Should reject trailing space');

    // Test excessive length
    const longId = 'a'.repeat(65);
    assert.ok(!isValidJobId(longId), 'Should reject overly long ID');
  });

  test('Generate unique ID with collision detection', async () => {
    const existing = new Set<string>();
    let attempts = 0;

    // Simulate some existing IDs
    const existsFn = async (id: string): Promise<boolean> => {
      attempts++;
      // First 2 attempts "collide"
      if (attempts <= 2) {
        existing.add(id);
        return true;
      }
      return existing.has(id);
    };

    const uniqueId = await generateUniqueJobId(existsFn);

    assert.ok(uniqueId, 'Should generate unique ID');
    assert.ok(!existing.has(uniqueId), 'Generated ID should not be in existing set');
    assert.strictEqual(attempts, 3, 'Should have taken 3 attempts');
  });

  test('Parse invalid IDs returns null', () => {
    assert.strictEqual(parseJobId('invalid'), null);
    assert.strictEqual(parseJobId(''), null);
    assert.strictEqual(parseJobId('20240101T120000.000Z'), null); // Missing pid and random
    assert.strictEqual(parseJobId('not-a-valid-id-format'), null);
  });

  test('Get age of job ID', () => {
    // Create ID from 5 seconds ago
    const pastDate = new Date(Date.now() - 5000);
    const id = newJobId(pastDate);

    const age = getJobAge(id);
    assert.ok(age !== null, 'Should return age');

    if (age !== null) {
      // Should be approximately 5000ms (allow some tolerance)
      assert.ok(age >= 4900 && age <= 5100, `Age should be ~5000ms: ${age}`);
    }

    // Invalid ID should return null
    assert.strictEqual(getJobAge('invalid-id'), null);
  });

  test('IDs work with Windows path.join', () => {
    // Test that IDs work correctly with Node's path module on Windows
    const id = newJobId();

    // Simulate Windows path operations
    const windowsBase = 'C:\\Users\\test\\.vsc-bridge\\execute';
    const fullPath = path.join(windowsBase, id, 'command.json');

    // Path should be valid and not contain double slashes or invalid chars
    assert.ok(!fullPath.includes('//'), 'No double forward slashes');
    assert.ok(!fullPath.includes('\\\\\\'), 'No triple backslashes');

    // On Windows, path.join should produce valid paths
    if (process.platform === 'win32') {
      assert.ok(fullPath.startsWith('C:\\'), 'Should maintain drive letter');
    }
  });

  test('Timestamp precision is millisecond-accurate', () => {
    // Test that milliseconds are preserved correctly
    const dates = [
      new Date('2024-01-15T12:34:56.001Z'),
      new Date('2024-01-15T12:34:56.099Z'),
      new Date('2024-01-15T12:34:56.999Z'),
    ];

    for (const date of dates) {
      const id = newJobId(date);
      const parsed = parseJobId(id);

      assert.ok(parsed, 'Should parse ID');
      if (parsed) {
        assert.strictEqual(
          parsed.timestamp.getTime(),
          date.getTime(),
          `Milliseconds should be preserved: ${date.toISOString()}`
        );
      }
    }
  });
});