# Phase 4: Migrate test.debug-wait Script - Alignment Brief

**Plan**: `/Users/jordanknight/github/vsc-bridge/docs/plans/4-bridge-context/1-bridge-context-implementation.md`
**Phase**: Phase 4: Migrate test.debug-wait Script
**Generated**: 2025-09-26

## Objective Recap

Update the `test.debug-wait` script to use BridgeContext for Python environment detection. This phase delivers the core fix for the breakpoint problem - ensuring Python tests debug correctly by using module-based execution (`python -m pytest`) instead of direct file execution.

### Behavior Checklist
- ✅ test.debug-wait detects pytest/unittest automatically
- ✅ Uses `module: 'pytest'` instead of `program: test.py`
- ✅ Adds `--no-cov` flag to prevent coverage interference
- ✅ Breakpoints work in both pytest and unittest tests
- ✅ Maintains backward compatibility with existing usage

## Invariants & Guardrails

### Performance Budget
- Python environment detection must complete in < 50ms
- No blocking I/O operations in detection path
- Use VS Code's async file APIs for all file operations

### Memory Budget
- Detector instance created lazily (only when needed)
- Single detector instance per BridgeContext
- No caching of file contents (rely on VS Code's caching)

### Security
- All file paths validated through vscode.Uri
- No execution of Python code during detection
- No shell command injection vulnerabilities

## Inputs to Read

### Core Files
1. `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/tests/debug-wait.js` - Script to update
2. `/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts` - getPythonEnv method
3. `/Users/jordanknight/github/vsc-bridge/extension/src/core/debug/debug-and-wait.ts` - Debug session management

### Test Fixtures
1. `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/pytest-basic/` - pytest test project
2. `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/unittest-basic/` - unittest test project
3. `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/none/` - No framework project

## Test Plan (TDD)

### Test 1: pytest Detection and Debugging
**File**: `extension/src/test/integration/scripts/debug-wait.test.ts`
**Rationale**: Verify pytest is detected and configured correctly
**Fixture**: `pytest-basic/test_example.py`
**Expected Output**:
```javascript
{
  framework: 'pytest',
  confidence: 0.9,
  debugConfig: {
    type: 'debugpy',
    module: 'pytest',
    args: ['-q', 'test_example.py', '--no-cov']
  }
}
```

### Test 2: unittest Detection and Debugging
**File**: `extension/src/test/integration/scripts/debug-wait.test.ts`
**Rationale**: Verify unittest is detected from class patterns
**Fixture**: `unittest-basic/test_sample.py`
**Expected Output**:
```javascript
{
  framework: 'unittest',
  confidence: 0.8,
  debugConfig: {
    type: 'debugpy',
    module: 'unittest',
    args: ['-v', 'test_sample']
  }
}
```

### Test 3: Config Merging
**File**: `extension/src/test/integration/scripts/debug-wait.test.ts`
**Rationale**: User overrides should take precedence
**Test Data**: Detected config + user-provided launch config
**Expected**: User values override detected values

### Test 4: Backward Compatibility
**File**: `extension/src/test/integration/scripts/debug-wait.test.ts`
**Rationale**: Script must work without BridgeContext
**Test Data**: Call with old signature
**Expected**: Falls back to manual config, no errors

### Test 5: Performance Validation
**File**: `extension/src/test/integration/scripts/debug-wait.test.ts`
**Rationale**: Detection must be fast
**Test Data**: Time getPythonEnv() execution
**Expected**: < 50ms for all fixture projects

## Step-by-Step Implementation Outline

### Step 1: Write Tests (T002-T004)
1. Create `extension/src/test/integration/scripts/debug-wait.test.ts`
2. Write test for pytest detection
3. Write test for unittest detection
4. Write test for config merging
5. Write test for backward compatibility

### Step 2: Update Script Core (T005)
1. Open `debug-wait.js`
2. Check if `bridgeContext.getPythonEnv` exists
3. Call `getPythonEnv(params.path)` if available
4. Store result in local variable

### Step 3: Add Detection Logging (T006)
1. Log framework and confidence to outputChannel
2. Log each detection reason
3. Log final merged configuration

### Step 4: Fix Debug Configuration (T007)
1. Replace `program` with `module` for pytest/unittest
2. Add `--no-cov` flag for pytest
3. Set `purpose: ['debug-test']`
4. Ensure `justMyCode: false`

### Step 5: Integration Testing (T008-T010)
1. Run tests with pytest fixture
2. Run tests with unittest fixture
3. Run tests with no-framework fixture
4. Verify breakpoints work in each case

## Commands to Run

### Environment Setup
```bash
# Build the extension
cd /Users/jordanknight/github/vsc-bridge
just build

# Run existing tests to ensure stability
just test
```

### Test Execution
```bash
# Run new integration tests
cd extension
npm test -- --grep "debug-wait"

# Test with real Python projects
cd extension/src/test/fixtures/python/pytest-basic
python -m pytest test_example.py  # Should work

cd ../unittest-basic
python -m unittest test_sample  # Should work
```

### Validation
```bash
# Test via CLI
vscb script run test.debug-wait \
  --param path=/path/to/test.py \
  --param line=10

# Check logs
code --goto "/tmp/vsc-bridge.log"
```

## Risks & Unknowns

### Risks
1. **VS Code Python Extension Not Installed**
   - Mitigation: Graceful fallback to file content detection

2. **Performance Regression**
   - Mitigation: Lazy detector instantiation, bounded file search

3. **Breaking Existing Usage**
   - Mitigation: Maintain backward compatibility, test thoroughly

### Unknowns
1. How will virtual environments affect detection?
2. Will remote development scenarios work correctly?
3. What about polyglot projects with multiple test frameworks?

## Rollback Plan

If issues are discovered:

1. **Immediate Rollback**:
   ```bash
   git checkout HEAD -- extension/src/vsc-scripts/tests/debug-wait.js
   just build
   ```

2. **Feature Flag Alternative**:
   ```javascript
   // Add to debug-wait.js
   const USE_BRIDGE_CONTEXT = process.env.VSC_BRIDGE_USE_CONTEXT !== 'false';
   if (USE_BRIDGE_CONTEXT && bridgeContext?.getPythonEnv) {
     // New behavior
   } else {
     // Old behavior
   }
   ```

3. **Partial Rollback**:
   - Keep detection but don't use it
   - Log detection results but use manual config
   - Gradually roll out to percentage of users

## Ready Check

### Prerequisites
- [ ] BridgeContext.getPythonEnv() method exists and works
- [ ] Python test fixtures are in place
- [ ] Integration test framework is set up
- [ ] VS Code extension host tests are passing

### Code Review
- [ ] No blocking I/O in detection path
- [ ] All paths use vscode.Uri
- [ ] Error handling for all edge cases
- [ ] Logging at appropriate levels

### Testing
- [ ] All new tests written and failing (TDD)
- [ ] Backward compatibility verified
- [ ] Performance budget met (< 50ms)
- [ ] Manual testing with real projects completed

### Documentation
- [ ] Plan document updated with progress
- [ ] Footnotes prepared for tracking
- [ ] Comments added to complex code sections

## GO/NO-GO Decision

**Ready for implementation?**
- [ ] All prerequisites checked
- [ ] Risks understood and mitigated
- [ ] Rollback plan validated
- [ ] Team alignment on approach

**Decision**: ⬜ GO / ⬜ NO-GO

---

## Plan Footnotes Prep

Each task will be tracked with footnotes in the main plan document:

- T001: Verify BridgeContext setup [^28]
- T002: Create comprehensive test suite [^29]
- T003: Test Python env detection [^30]
- T004: Ensure backward compatibility [^31]
- T005: Core implementation of getPythonEnv usage [^32]
- T006: Add diagnostic logging [^33]
- T007: Fix debug config for module execution [^34]
- T008: Validate pytest debugging [^35]
- T009: Validate unittest debugging [^36]
- T010: Validate fallback behavior [^37]

These will be populated with file paths and line numbers during implementation.