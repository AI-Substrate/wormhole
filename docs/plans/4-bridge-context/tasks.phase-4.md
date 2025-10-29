# Phase 4: Migrate test.debug-wait Script - Task File

**Plan**: `/Users/jordanknight/github/vsc-bridge/docs/plans/4-bridge-context/1-bridge-context-implementation.md`
**Phase**: Phase 4: Migrate test.debug-wait Script
**Objective**: Update test.debug-wait script to use BridgeContext for Python environment detection

## Tasks

### Setup & Prerequisites

**T001** - Verify BridgeContext.getPythonEnv() is working
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/core/bridge-context/BridgeContext.ts`
- Validate: Method exists and returns IPythonEnvironment
- Dependencies: None

### Tests First (TDD)

**T002** - Write integration test for debug-wait with BridgeContext
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/integration/scripts/debug-wait.test.ts`
- Tests:
  - Script detects pytest when pytest.ini exists
  - Script detects unittest from class pattern
  - Script uses detected config in debug session
  - Script handles no framework detection gracefully
- Dependencies: T001

**T003** - Write test for Python environment detection integration
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/integration/scripts/debug-wait.test.ts`
- Tests:
  - BridgeContext.getPythonEnv() called with correct path
  - Detected config merged with user overrides
  - Confidence scores logged appropriately
- Dependencies: T002

**T004** - Write test for backward compatibility
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/integration/scripts/debug-wait.test.ts`
- Tests:
  - Script works with old signature (bridgeContext, params)
  - Script handles missing getPythonEnv method
  - Fallback to manual config when detection unavailable
- Dependencies: T002

### Core Implementation

**T005** - Update debug-wait script to use BridgeContext.getPythonEnv()
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/tests/debug-wait.js`
- Changes:
  - Check if bridgeContext has getPythonEnv method
  - Call getPythonEnv(params.path) if available
  - Use detected config for debug session
  - Log detection results to outputChannel
- Dependencies: T002, T003, T004

**T006** - Add Python framework detection logging
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/tests/debug-wait.js`
- Changes:
  - Log detected framework and confidence
  - Log detection reasons
  - Log merged configuration
- Dependencies: T005

**T007** - Update debug config generation
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/vsc-scripts/tests/debug-wait.js`
- Changes:
  - Use module-based execution for pytest/unittest
  - Add --no-cov flag for pytest
  - Set purpose: ['debug-test']
  - Ensure justMyCode: false
- Dependencies: T005

### Integration & Polish

**T008** - Test with pytest fixture project
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/pytest-basic/`
- Validate:
  - Breakpoints work in pytest tests
  - Fixtures are loaded correctly
  - Debug session starts with module execution
- Dependencies: T005, T006, T007

**T009** - Test with unittest fixture project
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/unittest-basic/`
- Validate:
  - Breakpoints work in unittest tests
  - TestCase methods are discovered
  - Debug session uses unittest module
- Dependencies: T005, T006, T007

**T010** - Test with no-framework project
- File: `/Users/jordanknight/github/vsc-bridge/extension/src/test/fixtures/python/none/`
- Validate:
  - Fallback behavior works correctly
  - User can still provide manual config
  - No errors when detection fails
- Dependencies: T005, T006, T007

## Parallelization Guidance

Tasks that can run in parallel:
- **[P]** T002, T003, T004 - All test writing can happen simultaneously
- **[P]** T008, T009, T010 - All fixture testing can run in parallel

Tasks that must be sequential:
1. T001 → T002-T004 (tests need working BridgeContext)
2. T002-T004 → T005 (implementation needs failing tests)
3. T005 → T006-T007 (logging and config depend on core implementation)
4. T007 → T008-T010 (fixture tests need complete implementation)

## Validation Checklist

- [ ] pytest tests hit breakpoints correctly
- [ ] unittest tests hit breakpoints correctly
- [ ] Detection confidence scores are accurate
- [ ] User config overrides work properly
- [ ] Backward compatibility maintained
- [ ] Performance: Detection completes in < 50ms
- [ ] Logging provides clear diagnostic information
- [ ] No errors when VS Code Python extension not installed

## Task Footnotes Prep

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