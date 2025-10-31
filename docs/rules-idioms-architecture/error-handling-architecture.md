# Error Handling Architecture

**Status**: Canonical Architecture Pattern
**Created**: 2025-10-31
**Purpose**: Define the authoritative error handling pattern for all VSC-Bridge scripts

---

## Executive Summary

All VSC-Bridge scripts MUST use the ScriptResult factory pattern for consistent error handling. This eliminates double-handling in ScriptRegistry and provides a single source of truth for error transformation.

---

## Core Principles

1. **Single Transformation Point**: Scripts create properly-formatted results using ScriptResult factory
2. **No Registry Interpretation**: ScriptRegistry passes through results without transformation
3. **Central Error Registry**: All error codes defined in one place
4. **Direct VS Code Errors**: Pass through VS Code API errors wholesale, preserving all context
5. **Uniform Pattern**: Both ActionScript and QueryScript use identical error handling

---

## Architecture Components

### 1. ScriptResult Factory

**Location**: `/workspaces/vscode-bridge/packages/extension/src/core/scripts/ScriptResult.ts`

```typescript
import { ErrorCode, ErrorRegistry } from '../errors/errorRegistry';

export interface ScriptEnvelope {
  ok: boolean;
  type: 'success' | 'error';
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export class ScriptResult {
  /**
   * Create a success result
   */
  static success(data: any): ScriptEnvelope {
    return {
      ok: true,
      type: 'success',
      data
    };
  }

  /**
   * Create a failure result from an error
   */
  static failure(
    message: string,
    code: ErrorCode | string,
    details?: any
  ): ScriptEnvelope {
    return {
      ok: false,
      type: 'error',
      error: {
        code,
        message,
        details
      }
    };
  }

  /**
   * Create a failure from a caught error (preserves VS Code errors)
   */
  static fromError(error: any, fallbackCode: ErrorCode = ErrorCode.E_INTERNAL): ScriptEnvelope {
    // Preserve VS Code error properties wholesale
    const code = error.code || fallbackCode;
    const message = error.message || ErrorRegistry.getMessage(fallbackCode);

    return {
      ok: false,
      type: 'error',
      error: {
        code,
        message,
        details: {
          ...error,  // Spread all VS Code error properties
          stack: error.stack,
          name: error.name
        }
      }
    };
  }
}
```

### 2. Central Error Registry

**Location**: `/workspaces/vscode-bridge/packages/extension/src/core/errors/errorRegistry.ts`

```typescript
/**
 * Centralized error codes for all scripts
 * Prevents namespace collisions and provides single source of truth
 */
export enum ErrorCode {
  // General errors
  E_INTERNAL = 'E_INTERNAL',
  E_INVALID_INPUT = 'E_INVALID_INPUT',
  E_TIMEOUT = 'E_TIMEOUT',
  E_NOT_FOUND = 'E_NOT_FOUND',

  // File system errors
  E_FILE_NOT_FOUND = 'E_FILE_NOT_FOUND',
  E_FILE_READ_ONLY = 'E_FILE_READ_ONLY',
  E_FILE_ACCESS_DENIED = 'E_FILE_ACCESS_DENIED',

  // LSP errors
  E_NO_LANGUAGE_SERVER = 'E_NO_LANGUAGE_SERVER',
  E_LSP_TIMEOUT = 'E_LSP_TIMEOUT',
  E_SYMBOL_NOT_FOUND = 'E_SYMBOL_NOT_FOUND',
  E_AMBIGUOUS_SYMBOL = 'E_AMBIGUOUS_SYMBOL',

  // Operation errors
  E_OPERATION_FAILED = 'E_OPERATION_FAILED',
  E_OPERATION_CANCELLED = 'E_OPERATION_CANCELLED',

  // Debug errors
  E_DEBUG_NO_SESSION = 'E_DEBUG_NO_SESSION',
  E_DEBUG_SESSION_TERMINATED = 'E_DEBUG_SESSION_TERMINATED',
  E_BREAKPOINT_FAILED = 'E_BREAKPOINT_FAILED',

  // Bridge errors
  E_BRIDGE_UNAVAILABLE = 'E_BRIDGE_UNAVAILABLE',
  E_BRIDGE_TIMEOUT = 'E_BRIDGE_TIMEOUT'
}

/**
 * Error descriptions for documentation
 * Note: We do NOT provide recovery hints - VS Code errors are well-documented online
 */
export const ErrorRegistry = {
  descriptions: {
    [ErrorCode.E_INTERNAL]: 'An internal error occurred',
    [ErrorCode.E_INVALID_INPUT]: 'Invalid input parameters provided',
    [ErrorCode.E_TIMEOUT]: 'Operation timed out',
    [ErrorCode.E_NOT_FOUND]: 'Resource not found',

    [ErrorCode.E_FILE_NOT_FOUND]: 'File does not exist',
    [ErrorCode.E_FILE_READ_ONLY]: 'File is read-only',
    [ErrorCode.E_FILE_ACCESS_DENIED]: 'File access denied',

    [ErrorCode.E_NO_LANGUAGE_SERVER]: 'No language server available for this file type',
    [ErrorCode.E_LSP_TIMEOUT]: 'Language server request timed out',
    [ErrorCode.E_SYMBOL_NOT_FOUND]: 'Symbol not found in file',
    [ErrorCode.E_AMBIGUOUS_SYMBOL]: 'Multiple symbols match the query',

    [ErrorCode.E_OPERATION_FAILED]: 'Operation failed',
    [ErrorCode.E_OPERATION_CANCELLED]: 'Operation was cancelled',

    [ErrorCode.E_DEBUG_NO_SESSION]: 'No active debug session',
    [ErrorCode.E_DEBUG_SESSION_TERMINATED]: 'Debug session terminated unexpectedly',
    [ErrorCode.E_BREAKPOINT_FAILED]: 'Failed to set breakpoint',

    [ErrorCode.E_BRIDGE_UNAVAILABLE]: 'VSC-Bridge is not available',
    [ErrorCode.E_BRIDGE_TIMEOUT]: 'Bridge request timed out'
  },

  getMessage(code: ErrorCode): string {
    return this.descriptions[code] || 'Unknown error';
  }
};
```

### 3. Updated Base Classes

#### ActionScript Pattern

```typescript
import { ScriptResult } from './ScriptResult';
import { ErrorCode } from '../errors/errorRegistry';

export abstract class ActionScript extends ScriptBase {
  /**
   * Execute the action and return a result envelope
   * ALL ActionScripts MUST use ScriptResult factory
   */
  abstract execute(bridgeContext: any, params: any): Promise<ScriptEnvelope>;

  /**
   * @deprecated Use ScriptResult factory instead
   */
  protected failure(reason: string, details?: any): never {
    throw new Error('Use ScriptResult.failure() instead of this.failure()');
  }

  /**
   * @deprecated Use ScriptResult factory instead
   */
  protected success(data: any): never {
    throw new Error('Use ScriptResult.success() instead of this.success()');
  }
}
```

#### QueryScript Pattern

```typescript
import { ScriptResult } from './ScriptResult';
import { ErrorCode } from '../errors/errorRegistry';

export abstract class QueryScript extends ScriptBase {
  /**
   * Execute the query and return a result envelope
   * QueryScripts now use SAME pattern as ActionScripts
   */
  abstract execute(bridgeContext: any, params: any): Promise<ScriptEnvelope>;

  // No more throwing errors - use ScriptResult factory
}
```

### 4. Script Implementation Pattern

#### Example: ActionScript Implementation

```typescript
import { ActionScript } from '@core/scripts/ActionScript';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/errors/errorRegistry';

class ReplaceMethodScript extends ActionScript {
  async execute(bridgeContext, params) {
    try {
      // Validate inputs
      if (!params.symbol) {
        return ScriptResult.failure(
          'Symbol parameter is required',
          ErrorCode.E_INVALID_INPUT
        );
      }

      // Do the work
      const result = await vscode.executeCommand('...');

      if (!result) {
        return ScriptResult.failure(
          `Symbol "${params.symbol}" not found in ${params.path}`,
          ErrorCode.E_SYMBOL_NOT_FOUND,
          { searchedPath: params.path, symbol: params.symbol }
        );
      }

      // Success
      return ScriptResult.success({
        applied: true,
        changes: result
      });

    } catch (error) {
      // Pass through VS Code errors wholesale
      return ScriptResult.fromError(error, ErrorCode.E_OPERATION_FAILED);
    }
  }
}
```

#### Example: QueryScript Implementation (NOW SAME PATTERN!)

```typescript
import { QueryScript } from '@core/scripts/QueryScript';
import { ScriptResult } from '@core/scripts/ScriptResult';
import { ErrorCode } from '@core/errors/errorRegistry';

class SearchSymbolScript extends QueryScript {
  async execute(bridgeContext, params) {
    try {
      const symbols = await vscode.commands.executeCommand(
        'vscode.executeDocumentSymbolProvider',
        uri
      );

      if (!symbols || symbols.length === 0) {
        return ScriptResult.failure(
          'No symbols found in document',
          ErrorCode.E_NOT_FOUND
        );
      }

      return ScriptResult.success({
        symbols,
        count: symbols.length
      });

    } catch (error) {
      // VS Code errors pass through with all context
      return ScriptResult.fromError(error);
    }
  }
}
```

### 5. Simplified ScriptRegistry

The ScriptRegistry no longer transforms results - it just passes them through:

```typescript
// ScriptRegistry.ts - SIMPLIFIED!
async execute(scriptName: string, params: any): Promise<ScriptEnvelope> {
  const script = this.scripts.get(scriptName);

  if (!script) {
    return ScriptResult.failure(
      `Script '${scriptName}' not found`,
      ErrorCode.E_NOT_FOUND
    );
  }

  try {
    // Just pass through whatever the script returns
    const result = await script.execute(this.bridgeContext, params);
    return result;  // No transformation needed!
  } catch (error) {
    // Only catch truly unexpected errors (script bugs)
    return ScriptResult.fromError(error);
  }
}
```

---

## Migration Strategy

### Phase 1: Infrastructure (Day 1)
1. Create `ScriptResult.ts` factory class
2. Create `errorRegistry.ts` with all error codes
3. Update base classes to use new pattern
4. Add deprecation warnings to old methods

### Phase 2: Script Migration (Day 2-3)
1. Update all 41 scripts to use ScriptResult factory
2. Use consistent error codes from registry
3. Remove all `this.failure()` and `this.success()` calls
4. Ensure VS Code errors pass through unchanged

### Phase 3: Registry Simplification (Day 3)
1. Remove error transformation logic from ScriptRegistry
2. ScriptRegistry just passes through script results
3. Remove all the complex error extraction code

### Phase 4: Test Updates (Day 4)
1. Run full test suite
2. Update failing tests to check for new error format
3. Use subagent to systematically fix test expectations

### Phase 5: Validation (Day 4)
1. Verify all scripts return proper envelopes
2. Ensure error messages are descriptive
3. Confirm VS Code errors preserve context
4. Add ESLint rule to enforce pattern

---

## Anti-Patterns to Avoid

### ❌ DON'T: Create errors with code in message
```javascript
// WRONG
const error = new Error('E_NOT_FOUND: Symbol not found');
error.code = 'E_NOT_FOUND';
throw error;
```

### ❌ DON'T: Use old failure/success methods
```javascript
// WRONG
return this.failure('E_NOT_FOUND', { message: 'Not found' });
```

### ❌ DON'T: Transform VS Code errors
```javascript
// WRONG
catch (error) {
  return ScriptResult.failure(
    'Operation failed',  // Lost original message!
    ErrorCode.E_OPERATION_FAILED
  );
}
```

### ❌ DON'T: Invent new error codes inline
```javascript
// WRONG
return ScriptResult.failure(message, 'E_MY_CUSTOM_ERROR');
```

---

## Correct Patterns

### ✅ DO: Use ScriptResult factory
```javascript
// CORRECT
return ScriptResult.failure(
  'Symbol "foo" not found in file.js',
  ErrorCode.E_SYMBOL_NOT_FOUND
);
```

### ✅ DO: Pass through VS Code errors
```javascript
// CORRECT
catch (error) {
  return ScriptResult.fromError(error);
}
```

### ✅ DO: Use error codes from registry
```javascript
// CORRECT
import { ErrorCode } from '@core/errors/errorRegistry';
return ScriptResult.failure(message, ErrorCode.E_TIMEOUT);
```

### ✅ DO: Preserve error context
```javascript
// CORRECT
return ScriptResult.failure(
  `Cannot rename symbol "${oldName}" to "${newName}"`,
  ErrorCode.E_OPERATION_FAILED,
  { oldName, newName, reason: 'File is read-only' }
);
```

---

## Benefits

1. **Consistency**: Every script uses the same pattern
2. **Simplicity**: ScriptRegistry doesn't interpret results
3. **Preservation**: VS Code errors pass through unchanged
4. **Type Safety**: TypeScript enforces envelope structure
5. **Maintainability**: Single pattern to understand and maintain
6. **No Ambiguity**: One way to handle errors, period

---

## Enforcement

### ESLint Rule
```javascript
// .eslintrc.js
module.exports = {
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.property.name="failure"]',
        message: 'Use ScriptResult.failure() instead of this.failure()'
      },
      {
        selector: 'CallExpression[callee.property.name="success"]',
        message: 'Use ScriptResult.success() instead of this.success()'
      },
      {
        selector: 'Literal[value=/^E_/]',
        message: 'Import error codes from @core/errors/errorRegistry'
      }
    ]
  }
};
```

### TypeScript Enforcement
```typescript
// All execute methods must return ScriptEnvelope
interface ScriptBase {
  execute(bridgeContext: any, params: any): Promise<ScriptEnvelope>;
}
```

---

## Implementation Checklist

- [ ] Create `/packages/extension/src/core/scripts/ScriptResult.ts`
- [ ] Create `/packages/extension/src/core/errors/errorRegistry.ts`
- [ ] Update ActionScript base class
- [ ] Update QueryScript base class
- [ ] Migrate all 41 scripts to new pattern
- [ ] Simplify ScriptRegistry.execute()
- [ ] Add ESLint rules
- [ ] Update tests for new error format
- [ ] Document pattern in CLAUDE.md
- [ ] Add to new developer onboarding

---

## Future Considerations

1. **Telemetry**: Error codes make it easy to track error frequency
2. **Monitoring**: Can alert on specific error codes
3. **Analytics**: Understand which errors users hit most
4. **Automation**: Build recovery automation for specific codes
5. **Localization**: Error messages could be localized based on code

---

## Questions & Answers

**Q: Why not keep ActionScript and QueryScript different?**
A: Having two patterns creates confusion. One pattern is simpler and more maintainable.

**Q: Why not provide recovery hints?**
A: VS Code errors are well-documented online. We're not the authority on VS Code API errors.

**Q: What about backward compatibility?**
A: The migration will update all scripts at once. No backward compatibility needed.

**Q: Why factory pattern instead of methods?**
A: Factory is explicit, can be used anywhere, and doesn't require `this` context.

**Q: What if VS Code adds new error properties?**
A: The spread operator in `fromError()` captures everything automatically.

---

## Conclusion

This architecture provides a clean, consistent, and maintainable error handling pattern that:
- Eliminates double-handling in ScriptRegistry
- Preserves VS Code error context completely
- Provides type safety and consistency
- Simplifies the entire error flow

All scripts MUST follow this pattern. No exceptions.