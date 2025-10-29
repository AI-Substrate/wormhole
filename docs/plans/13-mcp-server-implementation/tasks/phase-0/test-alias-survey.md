# T002: Test File Alias Usage Survey

**Date**: 2025-10-10
**Purpose**: Identify all test files using old aliases for update in T015

---

## Summary

**Total files requiring updates**: 4
- Old `bp.*` usage: 3 files (38 occurrences)
- Old `tests.*` usage: 1 file (7 occurrences)
- Old `diag.*` usage: 0 files
- Old `utils.*` usage: 0 files (false positives only - filename matches)

---

## Files Requiring Updates (T015)

### 1. `test/integration/old/param-validation.test.ts`
**Old alias**: `bp.set`, `bp.remove`, `bp.clear.file`
**Occurrences**: 25 lines

**Pattern to replace**:
- `bp.set` → `breakpoint.set`
- `bp.remove` → `breakpoint.remove`
- `bp.clear.file` → `breakpoint.clear.file`

**Sample lines**:
```
Line 48:  await execAsync(`${CLI_PATH} script bp.set`);
Line 125: expect(error.stderr).not.toContain('Parameter validation failed for \'bp.set\'');
Line 164: expect(error.stderr).toContain('Run \'vscb script info bp.set\'');
Line 270: await execAsync(`${CLI_PATH} script bp.set path=test.py line=10 --dry-run`);
Line 318: await execAsync(`${CLI_PATH} script bp.remove path=test.py line=10 --dry-run`);
Line 330: await execAsync(`${CLI_PATH} script bp.clear.file path=test.py --dry-run`);
```

---

### 2. `test/integration/cross-language-debug.test.ts`
**Old aliases**: `bp.set`, `tests.debug-single`, `tests.show-testing-ui`
**Occurrences**: 13 lines (bp: 5, tests: 7, plus 1 comment)

**Patterns to replace**:
- `bp.set` → `breakpoint.set`
- `tests.debug-single` → `test.debug_single` (note underscore!)
- `tests.show-testing-ui` → `test.show_testing_ui` (note underscore!)

**Sample lines**:
```
Line 128: *   - Test/debug commands (tests.debug-single, bp.set, etc): Run from test/ workspace
Line 207: await runCLI('script run tests.show-testing-ui');
Line 302: `script run bp.set --param path=${TEST_FILES.python} --param line=${TEST_LINES.python}`
Line 310: `script run tests.debug-single --param path=${TEST_FILES.python} --param line=${TEST_LINES.python}`
Line 420: `script run bp.set --param path=${TEST_FILES.javascript} --param line=${TEST_LINES.javascript}`
Line 428: `script run tests.debug-single --param path=${TEST_FILES.javascript} --param line=${TEST_LINES.javascript}`
```

---

### 3. `cli/test/lib/param-validator.test.ts`
**Old alias**: `bp.set`
**Occurrences**: 1 line

**Pattern to replace**:
- `alias: 'bp.set'` → `alias: 'breakpoint.set'`

**Sample line**:
```
Line 165: alias: 'bp.set',
```

---

### 4. `cli/test/lib/manifest.test.ts`
**Old alias**: `bp.set`
**Occurrences**: 5 lines

**Pattern to replace**:
- `'bp.set'` → `'breakpoint.set'`

**Sample lines**:
```
Line 13:  'bp.set': {
Line 15:      alias: 'bp.set',
Line 197: const metadata = getScriptMetadata(mockManifest, 'bp.set');
Line 198: expect(metadata).toEqual(mockManifest.scripts['bp.set'].metadata);
Line 220: expect(scripts).toEqual(['bp.set']);
```

---

### 5. `cli/test/lib/fs-bridge.test.ts`
**Old alias**: `bp.set`, `bp.list`
**Occurrences**: 3 lines

**Pattern to replace**:
- `scriptName: 'bp.set'` → `scriptName: 'breakpoint.set'`
- `scriptName: 'bp.list'` → `scriptName: 'breakpoint.list'`

**Sample lines**:
```
Line 141: scriptName: 'bp.set',
Line 198: scriptName: 'bp.list',
Line 332: scriptName: 'bp.list',
```

---

## False Positives (No Action Required)

### `test/unit/bridge-context/services/paths.test.ts`
**Matched pattern**: `utils.ts`
**Reason**: Filename match, not alias usage
**Action**: Ignore

**Lines**:
```
Line 163: const redundantPath = './src/../lib/./utils.ts';
Line 165: expect(result).toBe('lib/utils.ts');
Line 187: const result = service.join('./src', '..', 'lib', 'utils.ts');
Line 188: expect(result).toBe('lib/utils.ts');
```

---

## Replacement Strategy for T015

### Approach 1: File-by-File Edits (Recommended)
Use Edit tool with exact string matching for each file. More precise, catches edge cases.

### Approach 2: Global Replace per File
If patterns are consistent within a file, use `replace_all: true` option in Edit tool.

### Critical Attention Points:
1. **Hyphen to underscore in test category**: `tests.debug-single` → `test.debug_single`
2. **Quote context preservation**: Don't break string interpolation or template literals
3. **Comment updates**: Line 128 in cross-language-debug.test.ts has alias in comment

---

## Validation Commands (for T017)

After T015 updates, verify no old aliases remain:

```bash
# Should return 0 results
grep -r "bp\." test/ cli/test/ --include="*.test.ts" --include="*.test.js" | grep -v "utils.ts"
grep -r "tests\." test/ cli/test/ --include="*.test.ts" --include="*.test.js"
grep -r "diag\." test/ cli/test/ --include="*.test.ts" --include="*.test.js"
grep -r "utils\.restart" test/ cli/test/ --include="*.test.ts" --include="*.test.js"
```

---

**END OF SURVEY**
