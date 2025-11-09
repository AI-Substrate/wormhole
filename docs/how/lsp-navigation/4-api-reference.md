# LSP Navigation API Reference

Complete API documentation for all four LSP navigation tools.

## Overview

All tools accept either:
- **Flowspace ID** (`nodeId` parameter), OR
- **Symbol name + path** (`symbol` + `path` parameters)

**Never both at the same time** - this will trigger a validation error.

## symbol.navigate

Find references or implementations for a symbol.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Conditional* | Flowspace ID (e.g., `method:src/file.ts:Class.method`) |
| `path` | string | Conditional* | Absolute or workspace-relative file path |
| `symbol` | string | Conditional* | Qualified symbol name (e.g., `Calculator.add`) |
| `action` | enum | No | `"references"` (default) or `"implementations"` |
| `includeDeclaration` | boolean | No | Include symbol declaration in references (default: provider-specific) |
| `enrichWithFlowspaceIds` | boolean | No | Add Flowspace IDs to results (slower, default: `false`) |

*Must provide either `nodeId` OR (`path` AND `symbol`)

### Examples

**Find references using Flowspace ID**:
```bash
vscb script run symbol.navigate \
  --param nodeId="method:src/Calculator.ts:Calculator.add" \
  --param action="references"
```

**Find references using symbol name**:
```bash
vscb script run symbol.navigate \
  --param path="src/Calculator.ts" \
  --param symbol="Calculator.add" \
  --param action="references" \
  --param includeDeclaration=true
```

**Find interface implementations**:
```bash
vscb script run symbol.navigate \
  --param path="src/ILogger.ts" \
  --param symbol="ILogger" \
  --param action="implementations"
```

**Enrich with Flowspace IDs** (adds overhead):
```bash
vscb script run symbol.navigate \
  --param nodeId="function:src/utils.ts:formatDate" \
  --param action="references" \
  --param enrichWithFlowspaceIds=true
```

### Response

```json
{
  "ok": true,
  "data": {
    "action": "references",
    "input": {
      "type": "flowspaceId",
      "value": "method:src/Calculator.ts:Calculator.add"
    },
    "locations": [
      {
        "file": "/absolute/path/to/src/main.ts",
        "range": {
          "start": { "line": 15, "character": 10 },
          "end": { "line": 15, "character": 13 }
        }
      }
    ],
    "total": 1
  }
}
```

**With enrichment**:
```json
{
  "locations": [
    {
      "file": "/absolute/path/to/src/main.ts",
      "range": { ... },
      "flowspaceId": "function:src/main.ts:calculateTotal"
    }
  ]
}
```

### Language Support

| Language | References | Implementations |
|----------|-----------|----------------|
| TypeScript | ✅ Full | ✅ Full |
| JavaScript | ✅ Full | ✅ Full |
| Python | ✅ Full | ⚠️ Limited (no interfaces) |
| Java | ✅ Full | ✅ Full |
| C# | ✅ Full | ✅ Full |
| Dart | ✅ Full | ✅ Full |

---

## symbol.rename

Rename a symbol workspace-wide using LSP.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Conditional* | Flowspace ID |
| `path` | string | Conditional* | File path |
| `symbol` | string | Conditional* | Symbol name to rename |
| `newName` | string | Yes | New name for the symbol |

*Must provide either `nodeId` OR (`path` AND `symbol`)

### Examples

**Rename class**:
```bash
vscb script run symbol.rename \
  --param path="src/Calculator.ts" \
  --param symbol="Calculator" \
  --param newName="MathCalculator"
```

**Rename method**:
```bash
vscb script run symbol.rename \
  --param nodeId="method:src/utils.ts:formatDate" \
  --param newName="formatDateTime"
```

**Rename variable**:
```bash
vscb script run symbol.rename \
  --param path="src/config.ts" \
  --param symbol="API_KEY" \
  --param newName="API_SECRET_KEY"
```

### Response

```json
{
  "ok": true,
  "data": {
    "applied": true,
    "totalFiles": 3,
    "totalEdits": 12,
    "changes": [
      {
        "file": "/absolute/path/to/src/Calculator.ts",
        "editCount": 4
      },
      {
        "file": "/absolute/path/to/src/main.ts",
        "editCount": 6
      },
      {
        "file": "/absolute/path/to/test/calculator.test.ts",
        "editCount": 2
      }
    ],
    "input": {
      "type": "symbolName",
      "path": "src/Calculator.ts",
      "symbol": "Calculator",
      "newName": "MathCalculator"
    }
  }
}
```

### Behavior

- **Atomic operation**: All files updated or none (rollback on error)
- **Auto-save**: Affected files saved automatically
- **Validation**: Pre-validates file permissions before applying edits

### Language Support

| Language | Support | Notes |
|----------|---------|-------|
| TypeScript | ✅ Full | Imports, type annotations updated |
| JavaScript | ⚠️ Partial | CommonJS `require()` may not update |
| Python | ✅ Full | Imports and references updated |
| Java | ✅ Full | Package imports updated |
| C# | ✅ Full | Namespaces and usings updated |
| Dart | ✅ Full | Imports updated |

---

## code.replace-method

Replace entire method declarations (signature + body).

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Conditional* | Flowspace ID |
| `path` | string | Conditional* | File path |
| `symbol` | string | Conditional* | Method/function name |
| `replacement` | string | Yes | New method code (empty string deletes) |

*Must provide either `nodeId` OR (`path` AND `symbol`)

### Examples

**Replace method body**:
```bash
vscb script run code.replace-method \
  --param path="src/utils.ts" \
  --param symbol="formatDate" \
  --param replacement="export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}"
```

**Convert to async**:
```bash
vscb script run code.replace-method \
  --param nodeId="method:src/api.ts:ApiClient.fetch" \
  --param replacement="async fetch(url: string): Promise<Response> {
    const response = await fetch(url);
    return response.json();
}"
```

**Delete method** (empty string):
```bash
vscb script run code.replace-method \
  --param path="src/deprecated.ts" \
  --param symbol="oldMethod" \
  --param replacement=""
```

### Response

```json
{
  "ok": true,
  "data": {
    "applied": true,
    "changes": [{
      "file": "/absolute/path/to/src/utils.ts",
      "range": {
        "start": { "line": 10, "character": 0 },
        "end": { "line": 13, "character": 1 }
      },
      "oldTextLength": 85,
      "newTextLength": 102,
      "oldText": "export function formatDate(date: Date): string {\n  return date.toString();\n}",
      "newText": "export function formatDate(date: Date): string {\n  return date.toISOString()..."
    }],
    "succeeded": ["src/utils.ts"],
    "failed": [],
    "totalFiles": 1,
    "totalEdits": 1
  }
}
```

### Behavior

- **Whole-symbol replacement**: Uses `DocumentSymbol.range` (entire declaration)
- **Best-effort save**: Attempts save, reports failures in `failed` array
- **Non-atomic**: Changes applied to memory first, then saved per-file

### Language Support

| Language | Support | Notes |
|----------|---------|-------|
| TypeScript | ✅ Full | Signature + body replacement |
| JavaScript | ✅ Full | Works with functions and methods |
| Python | ✅ Full | Handles decorators and docstrings |
| Java | ✅ Full | Replaces entire method including annotations |
| C# | ✅ Full | Replaces attributes and method body |
| Dart | ✅ Full | Works with async methods |

---

## symbol.calls

Find incoming or outgoing calls using LSP Call Hierarchy.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `nodeId` | string | Conditional* | Flowspace ID |
| `path` | string | Conditional* | File path |
| `symbol` | string | Conditional* | Method/function name |
| `direction` | enum | No | `"incoming"` (default) or `"outgoing"` |
| `enrichWithFlowspaceIds` | boolean | No | Add Flowspace IDs to results (default: `false`) |

*Must provide either `nodeId` OR (`path` AND `symbol`)

### Examples

**Find who calls this function** (incoming):
```bash
vscb script run symbol.calls \
  --param path="src/api.ts" \
  --param symbol="handleRequest" \
  --param direction="incoming"
```

**Find what this function calls** (outgoing):
```bash
vscb script run symbol.calls \
  --param nodeId="method:src/service.ts:AuthService.login" \
  --param direction="outgoing"
```

**Enrich with Flowspace IDs**:
```bash
vscb script run symbol.calls \
  --param path="src/utils.ts" \
  --param symbol="formatDate" \
  --param direction="incoming" \
  --param enrichWithFlowspaceIds=true
```

### Response

**Incoming calls** (who calls this?):
```json
{
  "ok": true,
  "data": {
    "symbol": "handleRequest",
    "direction": "incoming",
    "totalCalls": 2,
    "calls": [
      {
        "caller": "processWebhook",
        "kind": "Function",
        "file": "/absolute/path/to/src/webhooks.ts",
        "line": 15,
        "character": 0,
        "callSites": [
          {
            "line": 22,
            "character": 8,
            "endLine": 22,
            "endCharacter": 21
          }
        ]
      }
    ]
  }
}
```

**Outgoing calls** (what does this call?):
```json
{
  "ok": true,
  "data": {
    "symbol": "login",
    "direction": "outgoing",
    "totalCalls": 3,
    "calls": [
      {
        "callee": "validateCredentials",
        "kind": "Function",
        "file": "/absolute/path/to/src/validators.ts",
        "line": 10,
        "character": 0,
        "callSites": [
          {
            "line": 45,
            "character": 10,
            "endLine": 45,
            "endCharacter": 29
          }
        ]
      }
    ]
  }
}
```

### Language Support

| Language | Support | Notes |
|----------|---------|-------|
| TypeScript | ✅ Full | Complete call hierarchy support |
| JavaScript | ⚠️ Limited | May not work with dynamic calls |
| Python | ✅ Full | Requires Pylance |
| Java | ✅ Full | Complete support |
| C# | ❌ None | OmniSharp doesn't support call hierarchy |
| Dart | ✅ Full | Complete support |
| Go | ✅ Full | With gopls |

---

## Common Error Codes

All tools return standardized error codes:

| Code | Description | Common Cause |
|------|-------------|--------------|
| `E_SYMBOL_NOT_FOUND` | Symbol not found | Typo in symbol name or Flowspace ID |
| `E_AMBIGUOUS_SYMBOL` | Multiple symbols match | Use Flowspace ID for disambiguation |
| `E_NO_LANGUAGE_SERVER` | No LSP provider | Missing language extension |
| `E_TIMEOUT` | LSP operation timeout | Language server indexing, retry |
| `E_FILE_READ_ONLY` | File is read-only | Check file permissions |
| `E_OPERATION_FAILED` | LSP operation failed | File locked or modified concurrently |
| `E_NOT_FOUND` | File not found | Invalid path |

## Error Response Format

All errors follow this structure:

```json
{
  "ok": false,
  "error": {
    "code": "E_SYMBOL_NOT_FOUND",
    "message": "Symbol 'Calculator.add' not found in src/Calculator.ts",
    "details": {
      "input": {
        "type": "symbolName",
        "path": "src/Calculator.ts",
        "symbol": "Calculator.add"
      }
    }
  }
}
```

## Next Steps

- [Language Support](./5-language-support.md) - Feature matrix per language
- [Troubleshooting](./6-troubleshooting.md) - Debug common issues
- [Quickstart Guide](./2-quickstart.md) - Try live examples
