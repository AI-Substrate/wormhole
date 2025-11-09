# LSP Navigation - Quickstart Guide

Get started with semantic code navigation in 5 minutes using real examples from the VSC-Bridge test workspace.

## Prerequisites

1. VS Code with VSC-Bridge extension installed
2. `vscb` CLI installed globally (`npm install -g github:AI-Substrate/wormhole`)
3. A workspace open in VS Code (creates `.vsc-bridge/` directory)

## Example 1: Find All References to a Function

**Scenario**: You want to find everywhere the `add` function is called in your codebase.

```bash
# Using symbol name (simpler)
vscb script run symbol.navigate \
  --param path="/workspaces/vscode-bridge/test/integration-simple/typescript/debug.test.ts" \
  --param symbol="add" \
  --param action="references"

# Using Flowspace ID (position-independent)
vscb script run symbol.navigate \
  --param nodeId="function:test/integration-simple/typescript/debug.test.ts:add" \
  --param action="references"
```

**Response**:
```json
{
  "ok": true,
  "data": {
    "action": "references",
    "locations": [
      {
        "file": "/workspaces/vscode-bridge/test/integration-simple/typescript/debug.test.ts",
        "range": {
          "start": { "line": 33, "character": 18 },
          "end": { "line": 33, "character": 21 }
        }
      }
    ],
    "total": 1
  }
}
```

## Example 2: Rename a Class Workspace-Wide

**Scenario**: Rename the `Calculator` class to `MathCalculator` everywhere it's used.

```bash
vscb script run symbol.rename \
  --param path="src/Calculator.ts" \
  --param symbol="Calculator" \
  --param newName="MathCalculator"
```

**What happens**:
- ✅ All references updated (imports, type annotations, instantiations)
- ✅ File saved automatically
- ✅ Changes applied atomically (all or nothing)

**Response**:
```json
{
  "ok": true,
  "data": {
    "applied": true,
    "totalFiles": 3,
    "totalEdits": 12,
    "changes": [
      { "file": "src/Calculator.ts", "editCount": 4 },
      { "file": "src/main.ts", "editCount": 6 },
      { "file": "test/calculator.test.ts", "editCount": 2 }
    ]
  }
}
```

## Example 3: Replace a Method Body

**Scenario**: Update the `add` function implementation to include logging.

```bash
vscb script run code.replace-method \
  --param path="/workspaces/vscode-bridge/test/integration-simple/typescript/debug.test.ts" \
  --param symbol="add" \
  --param replacement="function add(a: number, b: number): number {
    console.log(\`Adding \${a} + \${b}\`);
    return a + b;
}"
```

**What happens**:
- ✅ Entire method declaration replaced (signature + body)
- ✅ Supports async conversion, parameter changes
- ✅ Empty string deletes the method

**Response**:
```json
{
  "ok": true,
  "data": {
    "applied": true,
    "changes": [{
      "file": "/workspaces/vscode-bridge/test/integration-simple/typescript/debug.test.ts",
      "range": { "start": { "line": 18, "character": 0 }, "end": { "line": 21, "character": 1 } },
      "oldTextLength": 62,
      "newTextLength": 98
    }],
    "succeeded": ["debug.test.ts"],
    "failed": []
  }
}
```

## Example 4: Find Who Calls a Function (Call Hierarchy)

**Scenario**: Discover all functions that call the `add` function.

```bash
# Find incoming calls (who calls this function?)
vscb script run symbol.calls \
  --param path="/workspaces/vscode-bridge/test/integration-simple/python/test_debug.py" \
  --param symbol="add" \
  --param direction="incoming"

# Find outgoing calls (what does this function call?)
vscb script run symbol.calls \
  --param path="/workspaces/vscode-bridge/test/integration-simple/python/test_debug.py" \
  --param symbol="test_debug_simple_arithmetic" \
  --param direction="outgoing"
```

**Response (incoming)**:
```json
{
  "ok": true,
  "data": {
    "symbol": "add",
    "direction": "incoming",
    "totalCalls": 1,
    "calls": [{
      "caller": "test_debug_simple_arithmetic",
      "kind": "Function",
      "file": "/workspaces/vscode-bridge/test/integration-simple/python/test_debug.py",
      "line": 25,
      "character": 0,
      "callSites": [
        { "line": 31, "character": 15, "endLine": 31, "endCharacter": 18 }
      ]
    }]
  }
}
```

## Example 5: Find Interface Implementations

**Scenario**: Find all classes implementing the `ILogger` interface.

```bash
vscb script run symbol.navigate \
  --param path="src/interfaces/ILogger.ts" \
  --param symbol="ILogger" \
  --param action="implementations"
```

**Note**: Implementations only work for languages with interfaces (TypeScript, Java, C#). Python will return a helpful error.

## Common Patterns

### Pattern 1: Symbol Name vs Flowspace ID

**Use symbol name when**:
- You know the file path
- Working within a single file
- Simpler syntax preferred

**Use Flowspace ID when**:
- Position-independent automation
- AI agents navigating code
- Working across multiple operations

### Pattern 2: Handling Ambiguity

If a symbol name matches multiple symbols (e.g., overloaded methods):

```bash
# Error response will list all matches
{
  "ok": false,
  "error": {
    "code": "E_AMBIGUOUS_SYMBOL",
    "message": "Multiple symbols named 'add' found",
    "details": {
      "candidates": [
        "function:src/math.ts:add",
        "method:src/Calculator.ts:Calculator.add"
      ]
    }
  }
}
```

**Solution**: Use Flowspace ID with full qualified name:
```bash
--param nodeId="method:src/Calculator.ts:Calculator.add"
```

### Pattern 3: Error Handling

All tools return standard error envelopes:

```bash
# Missing language server
{
  "ok": false,
  "error": {
    "code": "E_NO_LANGUAGE_SERVER",
    "message": "No rename provider available for this file type. Python: Ensure Pylance or Python extension is installed and activated."
  }
}
```

## Next Steps

- [Flowspace ID Guide](./3-flowspace-ids.md) - Master Flowspace ID syntax
- [API Reference](./4-api-reference.md) - Complete parameter documentation
- [Language Support](./5-language-support.md) - What works in your language
- [Troubleshooting](./6-troubleshooting.md) - Fix common issues
