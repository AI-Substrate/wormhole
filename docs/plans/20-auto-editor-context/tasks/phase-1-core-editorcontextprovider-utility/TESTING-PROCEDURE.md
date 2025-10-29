# Phase 1 Testing Procedure - EditorContextProvider

## Testing Approach

Phase 1 uses **dynamic script testing** instead of traditional integration tests. This approach:
- Tests EditorContextProvider in real Extension Host (no mocking)
- Enables hot-reload workflow (edit → run instantly)
- Uses existing dogfooding infrastructure
- Validates all Phase 1 acceptance criteria (T016-T020)

## Prerequisites

1. Extension built: `just build`
2. CLI globally linked: `just install-global`
3. Extension Host running with workspace open

## Test Script Location

**Dynamic Script**: `/workspaces/wormhole/scripts/sample/dynamic/test-editor-context.js`

This script:
- Imports EditorContextProvider from compiled extension code
- Calls `capture()` with real VS Code APIs
- Displays formatted results with validation checks
- Tests all edge cases (no editor, no symbols, disposed document, etc.)

## Testing Instructions

### Launch Extension Host

User will launch the Extension Host manually (either method works):

**Method 1 - F5 in VS Code**:
1. Open `/workspaces/wormhole` in VS Code
2. Press F5 to launch Extension Host
3. Extension Host opens with test workspace

**Method 2 - CLI Command**:
```bash
cd /workspaces/wormhole
vscb script run debug.start --param launch="Run Extension"
```

### Run Test Scenarios

Once Extension Host is running, execute these test scenarios:

#### Test T016: No Active Editor (Returns Undefined)
```bash
# In Extension Host: Close all editors
# Workbench → Close All Editors

# Run test
cd /workspaces/wormhole
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**Expected Output**:
```
❌ No active editor - open a file to test
{
  "success": false,
  "error": "No active editor"
}
```

**Validates**: Graceful degradation when no editor (AC4)

---

#### Test T017: Plaintext File (Partial Context)
```bash
# In Extension Host: Open a .txt file
# File → New Text File → Type some text

# Run test
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**Expected Output**:
```
✅ Context captured successfully!

📄 File Info:
  Language: plaintext
  ...

🔍 Symbol Info:
  Total symbols in document: 0
  Containing scopes: 0
  ⚠ Warning: Symbol provider unavailable
```

**Validates**: Partial context returned with warning (AC10, Insight #1)

---

#### Test T018: JavaScript File (Full Context)
```bash
# In Extension Host: Open a JavaScript file
# File → Open → /workspaces/wormhole/test/javascript/example.test.js
# Position cursor inside a function

# Run test
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**Expected Output**:
```
✅ Context captured successfully!

📄 File Info:
  Path: /workspaces/wormhole/test/javascript/example.test.js
  Language: javascript
  Lines: 45

📍 Cursor Info:
  Line: 10 (1-indexed)
  Character: 5 (1-indexed)

🔍 Symbol Info:
  Total symbols in document: 8
  Containing scopes: 2
  Immediate scope: test
  Scope hierarchy: describe > test

  Containing Scopes (outermost to innermost):
    1. describe (kind: 11)
       Range: Line 1 - Line 45
    2. test (kind: 11)
       Range: Line 8 - Line 12

✅ Validation Results:
  ✓ hasFile: true
  ✓ hasCursor: true
  ✓ cursorIs1Indexed: true
  ✓ isPOJO: true
  ✓ jsonSerializable: true
```

**Validates**: EditorUtils extracts file/cursor state, SymbolUtils fetches symbols (AC1)

---

#### Test T019: Text Selection (POJO Serialization)
```bash
# In Extension Host: Open any file
# Select multiple lines of text (click and drag)

# Run test
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**Expected Output**:
```
📝 Selection Info:
  Empty: false
  Text: "const x = 42;
    console.log(x);"
  Range: {"start":{"line":2,"character":5},"end":{"line":3,"character":21}}

✅ Validation Results:
  ✓ isPOJO: true
  ✓ jsonSerializable: true
```

**Validates**: SerializationUtils produces POJOs, JSON.stringify succeeds (Discovery 05)

---

#### Test T020: Disposed Document (Outer Error Handling)
```bash
# In Extension Host: Open a file
# Immediately close it (Ctrl+W)

# Run test quickly while editor is closing
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**Expected Output** (either outcome is valid):
```
Option 1: Editor closed before capture
❌ No active editor
{ "success": false }

Option 2: Editor disposed during capture
❌ capture() returned undefined
{ "success": false }
```

**Validates**: Outer error handling layer, graceful degradation (Discovery 09, Insight #3)

---

## Hot-Reload Testing

The dynamic script supports instant iteration:

```bash
# 1. Run test once
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js

# 2. Edit the script (add console.log, change output format)
# 3. Save the file

# 4. Run again immediately - changes take effect!
vscb script run -f ./scripts/sample/dynamic/test-editor-context.js
```

**No rebuild required** - perfect for debugging and iteration.

##

 Success Criteria

Phase 1 testing is complete when:

- [x] T001-T004d: Utilities created (SerializationUtils, SymbolUtils, EditorUtils)
- [x] T005-T009: EditorContextProvider thin facade created
- [x] T010-T013: Error handling, logging, OutputChannel wiring
- [x] T016: No editor → returns undefined ✅
- [x] T017: No language server → partial context with warning ✅
- [x] T018: JavaScript file → full context with symbols ✅
- [x] T019: Text selection → POJO serialization, JSON works ✅
- [x] T020: Disposed document → graceful degradation ✅

## Phase 1 Deliverables

**Utilities Created**:
- `/workspaces/wormhole/packages/extension/src/core/util/SerializationUtils.ts`
- `/workspaces/wormhole/packages/extension/src/core/util/SymbolUtils.ts`
- `/workspaces/wormhole/packages/extension/src/core/util/EditorUtils.ts`
- `/workspaces/wormhole/packages/extension/src/core/util/index.ts` (barrel export)

**Provider Created**:
- `/workspaces/wormhole/packages/extension/src/core/context/EditorContextProvider.ts`

**Interface Added**:
- `EditorContext` interface in `/workspaces/wormhole/packages/extension/src/core/response/envelope.ts`

**Extension Wiring**:
- OutputChannel wired in `/workspaces/wormhole/packages/extension/src/extension.ts`

**Test Script**:
- `/workspaces/wormhole/scripts/sample/dynamic/test-editor-context.js`

## Next Phase

**Phase 2**: Integrate EditorContextProvider into response envelope
- Modify `ScriptRegistry.execute()` to capture context before returning
- Add `editorContext` field to ResponseEnvelope
- Implement system tool exclusion logic
- Test via existing MCP tools (all tools now get automatic context)

The dynamic test script will remain useful for debugging context capture issues throughout Phase 2-5.
