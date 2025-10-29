/**
 * Symbol Resolver Integration Tests
 *
 * Tests for Flowspace ID parsing and symbol resolution utilities.
 * Promoted from scratch/ following TAD workflow.
 */

import { describe, test, expect } from 'vitest';
import { parseFlowspaceId } from '../../packages/extension/src/core/util/symbol-resolver';

describe('Symbol Resolver - Flowspace ID Parsing', () => {

  /*
  Test Doc:
  - Why: Ensures Windows paths in Flowspace IDs parse correctly (critical path - Windows is widely used)
  - Contract: parseFlowspaceId() must accept forward slashes (C:/) in Windows drive letters and extract all components correctly
  - Usage Notes: Always use forward slashes (C:/ not C:\\) in Flowspace IDs for Windows paths
  - Quality Contribution: Prevents path parsing failures on Windows that would break symbol navigation for Windows users
  - Worked Example: Input "method:C:/Users/code/Calculator.ts:Calculator.add" → { type: "method", filePath: "C:/Users/code/Calculator.ts", qualifiedName: "Calculator.add" }
  */
  test('Given Windows path with forward slashes When parsing Flowspace ID Then extracts all components correctly', () => {
    // Arrange
    const input = 'method:C:/Users/code/Calculator.ts:Calculator.add';

    // Act
    const result = parseFlowspaceId(input);

    // Assert
    expect(result.type).toBe('method');
    expect(result.filePath).toBe('C:/Users/code/Calculator.ts');
    expect(result.qualifiedName).toBe('Calculator.add');
  });

  /*
  Test Doc:
  - Why: Ensures nested class Flowspace IDs parse correctly (opaque behavior - dot notation can be ambiguous)
  - Contract: parseFlowspaceId() must handle dot-separated qualified names (e.g., "Shape.Circle.area") without treating dots as delimiters
  - Usage Notes: Use dots for nested classes/methods (e.g., "Shape.Circle.area" for method 'area' in class 'Circle' nested in 'Shape')
  - Quality Contribution: Prevents qualified name parsing failures for nested classes that would break navigation in complex codebases
  - Worked Example: Input "method:src/Geo.ts:Shape.Circle.area" → { type: "method", filePath: "src/Geo.ts", qualifiedName: "Shape.Circle.area" }
  */
  test('Given nested class Flowspace ID When parsing Then preserves dot notation in qualified name', () => {
    // Arrange
    const input = 'method:src/Geo.ts:Shape.Circle.area';

    // Act
    const result = parseFlowspaceId(input);

    // Assert
    expect(result.type).toBe('method');
    expect(result.filePath).toBe('src/Geo.ts');
    expect(result.qualifiedName).toBe('Shape.Circle.area');
  });

  /*
  Test Doc:
  - Why: Ensures invalid Flowspace ID formats are rejected with clear error messages (edge case - prevents silent failures)
  - Contract: parseFlowspaceId() must throw error with code E_INVALID_INPUT for malformed inputs (wrong format, backslashes in Windows paths, missing components)
  - Usage Notes: Call parseFlowspaceId() inside try-catch; check error.code === 'E_INVALID_INPUT' for validation failures
  - Quality Contribution: Prevents silent failures or cryptic errors when users provide invalid Flowspace IDs; guides users to correct format
  - Worked Example: Input "method:C:\\Users\\file.ts:Symbol" → throws Error with message about forward slashes and code 'E_INVALID_INPUT'
  */
  test('Given Windows path with backslashes When parsing Flowspace ID Then throws E_INVALID_INPUT error', () => {
    // Arrange
    const input = 'method:C:\\Users\\code\\Calculator.ts:Calculator.add';

    // Act & Assert
    expect(() => parseFlowspaceId(input)).toThrow(/forward slash/i);

    try {
      parseFlowspaceId(input);
    } catch (error: any) {
      expect(error.code).toBe('E_INVALID_INPUT');
    }
  });
});
