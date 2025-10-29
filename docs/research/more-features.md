Below is a compact, “docs‑style” surface for navigation + safe editing tools an MCP server can expose on top of VS Code. Each entry includes: what/why, call signature, a usage example, a sample JSON response, and **how to implement it** inside your Node extension with VS Code’s built‑ins (no per‑language AST code required).

> **Design notes**
>
> * All tools lean on VS Code’s built‑in LSP/commands (`vscode.execute*` family), so you get multi‑language support “for free”.
> * For edits, expose **dry‑run** vs **apply** flags; return a normalized `WorkspaceEdit` summary before applying.
> * Wire tools into your existing script system (manifest + script registry + filesystem bridge) and reuse your `BridgeContext`/services and response envelopes. 

---

## 1) `workspace.symbols.search`

**What/Why**: Workspace‑wide symbol search (classes, functions, consts, tests). The fastest “map of the territory” for an agent.

**Call**
`name`: `workspace.symbols.search`
`params`:

```json
{ "query": "UserService", "limit": 200 }
```

**Example request**

```json
{ "tool": "workspace.symbols.search", "params": { "query": "UserService", "limit": 50 } }
```

**Example response**

```json
{
  "ok": true, "status": "ok", "type": "result",
  "data": [
    {
      "name": "UserService",
      "kind": "class",
      "location": { "uri": "file:///app/src/user/UserService.ts", "range": { "start": { "line": 3, "character": 0 }, "end": { "line": 220, "character": 1 } } },
      "containerName": "src/user"
    }
  ],
  "meta": { "requestId": "…", "mode": "normal", "scriptName": "workspace.symbols.search", "startedAt": "…", "durationMs": 17 }
}
```

**Implementation (Node extension)**

* Add a script (e.g., `vsc-scripts/workspace/symbols-search.js`) and a `*.meta.yaml` with alias `workspace.symbols.search`.
* Inside `execute(ctx, params)`: call `vscode.commands.executeCommand('vscode.executeWorkspaceSymbolProvider', params.query)`, slice to `limit`.
* Return through your response envelope helpers. Use `ctx.paths/ctx.workspace` to resolve URIs where needed. 

---

## 2) `document.symbols.outline`

**What/Why**: Hierarchical outline (classes → methods → fields) for one file; great for surgical edits and “replace method”.

**Call**
`name`: `document.symbols.outline`
`params`:

```json
{ "path": "src/user/UserService.ts" }
```

**Example request**

```json
{ "tool": "document.symbols.outline", "params": { "path": "src/user/UserService.ts" } }
```

**Example response**

```json
{
  "ok": true, "status": "ok", "type": "result",
  "data": [
    {
      "name": "UserService",
      "kind": "Class",
      "range": { "start": { "line": 3, "character": 0 }, "end": { "line": 220, "character": 1 } },
      "children": [
        { "name": "getUser", "kind": "Method", "range": { "start": { "line": 24, "character": 2 }, "end": { "line": 51, "character": 3 } } }
      ]
    }
  ],
  "meta": { "requestId": "…", "mode": "normal", "scriptName": "document.symbols.outline", "startedAt": "…", "durationMs": 9 }
}
```

**Implementation**

* Resolve URI via `ctx.paths.toUri(path)`.
* `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)` returns `DocumentSymbol[]` (hierarchical). Return as JSON. 

---

## 3) `symbol.definition.get`

**What/Why**: Go‑to‑definition for the symbol at a position.

**Call**
`params`:

```json
{ "path": "src/user/UserService.ts", "line": 30, "character": 12 }
```

**Usage**

```json
{ "tool": "symbol.definition.get", "params": { "path": "src/user/UserService.ts", "line": 30, "character": 12 } }
```

**Sample response**

```json
{
  "ok": true,"status": "ok","type": "result",
  "data": [{ "uri": "file:///app/src/models/User.ts", "range": { "start": { "line": 4, "character": 6 }, "end": { "line": 4, "character": 10 } } }],
  "meta": { "requestId": "…", "mode": "normal", "scriptName": "symbol.definition.get", "startedAt": "…", "durationMs": 6 }
}
```

**Implementation**

* Execute `vscode.executeDefinitionProvider` with URI + `Position`. Handle `Location` and `LocationLink`. 

---

## 4) `symbol.references.find`

**What/Why**: Find all references to a symbol for safe refactors or deletes.

**Call / Usage**

```json
{ "tool": "symbol.references.find", "params": { "path": "src/user/UserService.ts", "line": 30, "character": 12, "includeDeclaration": true } }
```

**Response**

```json
{ "ok": true, "status": "ok", "type": "result",
  "data": [{ "uri": "file:///…/UserController.ts", "range": { "start": { "line": 19, "character": 8 }, "end": { "line": 19, "character": 18 } } }],
  "meta": { "requestId": "…", "mode": "normal", "scriptName": "symbol.references.find", "startedAt": "…", "durationMs": 22 }
}
```

**Implementation**

* `vscode.executeReferenceProvider(uri, position)` then map to `{uri, range}`. 

---

## 5) `symbol.implementation.get`

**What/Why**: Jump to implementation(s); great for interfaces/abstract bases.

**Usage**

```json
{ "tool": "symbol.implementation.get", "params": { "path": "src/types/IUserRepo.ts", "line": 10, "character": 9 } }
```

**Implementation**

* `vscode.executeImplementationProvider(uri, position)`. Return `Location[]`. 

---

## 6) `symbol.rename`

**What/Why**: LSP‑powered, workspace‑wide rename (atomic and language‑aware).

**Call**

```json
{ "path": "src/user/UserService.ts", "line": 30, "character": 12, "newName": "AccountService", "apply": true, "dryRun": false }
```

**Response (dry‑run)**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": { "edit": { "changes": [{ "uri": "file:///…/UserController.ts", "edits": [{ "range": { "start": {"line":19,"character":8}, "end": {"line":19,"character":18} }, "newText": "AccountService" }] }] }, "applied": false },
  "meta": { "requestId":"…","mode":"normal","scriptName":"symbol.rename","startedAt":"…","durationMs":41 }
}
```

**Implementation**

* Call `vscode.executeDocumentRenameProvider(uri, position, newName)` → `WorkspaceEdit`. If `apply`, run `vscode.workspace.applyEdit(edit)` and return `{applied:true}`; otherwise return the edit preview. 

---

## 7) `code.search`

**What/Why**: Fast text/regex search (ripgrep‑backed via VS Code). Ideal for heuristics + non‑symbol code.

**Call**

```json
{ "query": "TODO:", "isRegex": false, "matchCase": false, "wholeWord": false, "include": "src/**", "exclude": "**/{dist,node_modules}/**", "maxResults": 500 }
```

**Response**

```json
{
  "ok": true, "status": "ok", "type": "result",
  "data": [{ "uri": "file:///…/UserService.ts", "line": 88, "preview": "  // TODO: handle deactivated users" }],
  "meta": { "requestId":"…","mode":"normal","scriptName":"code.search","startedAt":"…","durationMs":38 }
}
```

**Implementation**

* Build a `TextSearchQuery` from params and use `vscode.workspace.findTextInFiles(query, options, onResult)` to collect hits. Respect `maxResults`. 

---

## 8) `code.replace`

**What/Why**: Safe, multi‑file replace with preview and atomic apply.

**Call**

```json
{
  "query": "var ",
  "replace": "let ",
  "isRegex": false,
  "include": "src/**",
  "exclude": "**/{dist,node_modules}/**",
  "dryRun": true
}
```

**Response (dry‑run)**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": {
    "edit": { "changes": [{ "uri": "file:///…/a.ts", "edits": [{ "range": {"start":{"line":2,"character":0},"end":{"line":2,"character":4}}, "newText":"let " }]}] },
    "applied": false,
    "count": 17
  },
  "meta": { "requestId":"…","mode":"normal","scriptName":"code.replace","startedAt":"…","durationMs":93 }
}
```

**Implementation**

* Reuse `findTextInFiles` to gather matches; construct a `WorkspaceEdit` of replacements (careful to batch per file and sort edits bottom‑up to keep offsets stable). If not `dryRun`, `vscode.workspace.applyEdit(edit)`. 

---

## 9) `code.replaceMethod`

**What/Why**: Replace a method/function body (or entire node range) by symbol name—no per‑language AST: we leverage DocumentSymbols.

**Call**

```json
{
  "path": "src/user/UserService.ts",
  "selector": { "kind": "method", "name": "getUser" },
  "replacement": "getUser(id: string) { return this.cache.get(id) ?? this.api.get(id); }",
  "mode": "replace-body",  // or "replace-node"
  "apply": true,
  "dryRun": false
}
```

**Response**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": { "applied": true, "edit": { "changes": [{ "uri": "file:///…/UserService.ts", "edits": [{ "range": { "start": {"line": 24, "character": 2}, "end": {"line": 51, "character": 3} }, "newText": "getUser(id: string) { … }" }]}] } },
  "meta": { "requestId":"…","mode":"normal","scriptName":"code.replaceMethod","startedAt":"…","durationMs":28 }
}
```

**Implementation**

* `executeDocumentSymbolProvider` → search for a matching `DocumentSymbol` by name/kind. Compute the **body** range by trimming the outer braces from `range` (language‑agnostic heuristic) for `"replace-body"`, or use `range` for `"replace-node"`. Build/apply a `WorkspaceEdit`. Note: If multiple candidates match, return choices to caller.

---

## 10) `code.applyEdits`

**What/Why**: “Bring your own edit.” Apply a normalized batch of edits across files; the canonical primitive for all automated refactors.

**Call**

```json
{
  "edit": {
    "changes": [
      { "uri": "file:///…/a.ts", "edits": [ { "range": { "start": { "line":2,"character":0}, "end": {"line":2,"character":3} }, "newText": "foo" } ] }
    ]
  },
  "dryRun": false
}
```

**Response**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": { "applied": true, "failed": [] },
  "meta": { "requestId":"…","mode":"normal","scriptName":"code.applyEdits","startedAt":"…","durationMs":4 }
}
```

**Implementation**

* Convert incoming JSON to a `WorkspaceEdit` (group by URI). If `dryRun`, return summary; else call `vscode.workspace.applyEdit(edit)`. Consider emitting `events.ndjson` progress via your FS bridge writer for large batches. 

---

## 11) `code.format`

**What/Why**: Format a file/range using the user’s configured formatter(s).

**Call**

```json
{ "path": "src/user/UserService.ts", "range": null, "apply": true }
```

**Implementation**

* Use `vscode.executeFormatDocumentProvider(uri, options)` (or `vscode.executeFormatRangeProvider` if range provided), then apply returned `TextEdit[]` via a `WorkspaceEdit`. 

---

## 12) `code.organizeImports`

**What/Why**: Lightweight hygiene refactor via code action: `source.organizeImports`.

**Call**

```json
{ "path": "src/user/UserService.ts", "apply": true }
```

**Implementation**

* `vscode.commands.executeCommand('vscode.executeCodeActionProvider', uri, fullRange, 'source.organizeImports')` → apply the returned `CodeAction.edit` (if any). Fallback: run `'editor.action.organizeImports'`. Return applied summary. 

---

## 13) `code.actions.list`

**What/Why**: Discover all Quick Fixes/Refactors available at a location; lets the agent choose structured refactors (e.g., “Extract Method”).

**Call**

```json
{ "path": "src/user/UserService.ts", "line": 40, "character": 8, "only": "refactor.extract" }
```

**Response**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": [
    { "title": "Extract to function in module scope", "kind": "refactor.extract.function", "hasEdit": true }
  ],
  "meta": { "requestId":"…","mode":"normal","scriptName":"code.actions.list","startedAt":"…","durationMs":13 }
}
```

**Implementation**

* Determine a non‑empty `Range` for the cursor/selection, then call `vscode.executeCodeActionProvider(uri, range, only?)`. Return `title`, `kind`, whether it has an edit, and an opaque index so the caller can ask to apply one in a follow‑up tool (optional: add `code.actions.apply`). 

---

## 14) `hierarchy.calls`

**What/Why**: Call hierarchy (incoming or outgoing) for deeper navigation than “find refs”.

**Call**

```json
{ "path": "src/user/UserService.ts", "line": 30, "character": 12, "direction": "incoming" }
```

**Implementation**

* Flow: `prepareCallHierarchy` → `provideCallHierarchyIncomingCalls`/`OutgoingCalls` via `vscode.commands.executeCommand('vscode.prepareCallHierarchy', ...)` and then the respective provider commands. Return items with `from`/`to` and ranges. (Not all languages support this; if unsupported, respond with a graceful capability error.) 

---

## 15) `diagnostics.list`

**What/Why**: Pull current Problems (errors/warnings) per file or workspace to guide autofixes.

**Call**

```json
{ "path": null, "severity": ["error","warning"], "limit": 500 }
```

**Response**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": [
    { "uri": "file:///…/UserService.ts", "severity": "error", "message": "Property 'id' does not exist on type '…'", "range": { "start": {"line": 41, "character": 10}, "end": {"line": 41, "character": 12} } }
  ],
  "meta": { "requestId":"…","mode":"normal","scriptName":"diagnostics.list","startedAt":"…","durationMs":5 }
}
```

**Implementation**

* Use `vscode.languages.getDiagnostics()` (entire workspace) or `getDiagnostics(uri)` (single file). Filter by severity, map to JSON, truncate to `limit`. 

---

## 16) `workspace.files.list`

**What/Why**: Globbing to discover files quickly (targets for edits, search scopes, etc.).

**Call**

```json
{ "include": "src/**/*.{ts,tsx,js}", "exclude": "**/{dist,node_modules}/**", "maxResults": 2000 }
```

**Response**

```json
{
  "ok": true,"status":"ok","type":"result",
  "data": [{ "uri": "file:///…/src/user/UserService.ts" }],
  "meta": { "requestId":"…","mode":"normal","scriptName":"workspace.files.list","startedAt":"…","durationMs":21 }
}
```

**Implementation**

* `vscode.workspace.findFiles(include, exclude?, maxResults?)` and return URIs. For remote workspaces, your `PathService` keeps it safe. 

---

# How to wire these into **your** extension (once, reuse everywhere)

1. **Script skeleton**
   Create one file per tool under `vsc-scripts/{workspace|editor|…}/<tool>.js` plus a `<tool>.meta.yaml`:

```yaml
alias: workspace.symbols.search
description: Workspace-wide symbol search
mcp:
  tool: workspace.symbols.search
params:
  query: { type: string, required: true }
  limit: { type: number, required: false, default: 200 }
response: query
```

Your existing manifest/registry flow will pick this up and generate schemas. 

2. **Use `BridgeContext` & services**
   Inside each script’s `execute(ctx, params)`:

* Resolve workspace/paths with `ctx.workspace` / `ctx.paths` (helps remote/WSL).
* Call VS Code built‑ins (`vscode.commands.executeCommand(...)`).
* Log via `ctx.logger`.
* Return via your envelope helpers (`ok(...)`, `fail(...)`). 

3. **Queueing & I/O**
   If exposing the tools to an external MCP server, you can keep using your filesystem bridge (`.vsc-bridge/execute/<jobId>`) and the **processor** to stream progress/events and write atomic `response.json`/`error.json`. This gives you cancellation and recovery out of the box. 

4. **Safety & UX**

* For any edit tool, support `{ "dryRun": true }` to return the planned `WorkspaceEdit` without applying.
* For long runs (big replaces), stream progress via your `EventWriter`.
* Normalize outputs: locations `{uri, range}`, symbols `{name, kind, containerName?}`, edits `{uri, edits[]}`.

5. **Zero per‑language AST**
   Everything above rides on VS Code’s LSP providers (symbols/defs/refs/rename/call‑hierarchy/diagnostics/code actions). For languages with limited providers, return a structured “unsupported capability” error so the agent can fall back to `code.search` + heuristic edits. 

---

## Bonus (optional follow‑ups you can add later)

* `code.actions.apply` (apply by title/index from `code.actions.list`)
* `symbol.typeDefinition.get` (for TS/Go/Rust)
* `semantic.tokens.get` (lightweight “AST‑ish” shading for token‑level edits)
* `graph.imports.build` (scan imports via text + symbols to produce a module graph for agents)

If you want, I can turn any of the above into concrete script files + sample `*.meta.yaml` entries in your repo style.
