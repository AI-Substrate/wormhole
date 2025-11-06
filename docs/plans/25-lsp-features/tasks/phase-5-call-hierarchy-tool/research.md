Below is a production‑ready plan and drop‑in code you can use in your extension to resolve callers/callees across TypeScript, Python, C#, Java, Dart, and (future) Go by (1) preferring the LSP Call Hierarchy and (2) falling back to a robust, language‑agnostic References+heuristics path when Call Hierarchy is unavailable or returns no items.

---

## 1) What’s the right API?

**Primary choice** — *Call Hierarchy (LSP 3.16+)*
Use the VS Code commands that surface the LSP Call Hierarchy requests:

* `vscode.prepareCallHierarchy(uri, position)` → `CallHierarchyItem[]`
* `vscode.provideIncomingCalls(item)` → `CallHierarchyIncomingCall[]`
* `vscode.provideOutgoingCalls(item)` → `CallHierarchyOutgoingCall[]`

These are official built‑in commands intended for programmatic use from extensions. ([Visual Studio Code][1])

**Fallback** — *Find References*
If Call Hierarchy isn’t supported (or returns nothing), call:

* `vscode.executeReferenceProvider(uri, position)` → `Location[]` (includes definitions and non‑call references; you must filter to call‑sites). ([Visual Studio Code][1])

**What’s the difference?**
*Call Hierarchy* provides a typed, directional call graph (incoming/outgoing) constructed by the server. *References* is an untyped list of references; you must (a) remove definitions/aliases and (b) infer calls vs non‑calls locally.

**What the VS Code UI uses**

* “Peek Call Hierarchy / Show Call Hierarchy” invokes the Call Hierarchy API when a language server advertises it.
* “Find All References” invokes the ReferenceProvider. Both are exposed as built‑ins for extensions (same commands above). ([Visual Studio Code][1])

---

## 2) Why your Python attempt fails while TypeScript works

Pylance *does* implement Call Hierarchy, but there are quirks. Two common causes of `prepareCallHierarchy returned no items` in Python:

1. **Position must be on the identifier name** (e.g., on `add_numbers` in `def add_numbers(...):`). If you pass a position on whitespace or inside the function body, many servers return no items.
2. **Indexing/analysis not ready** at the time you call (e.g., just opened the workspace). Retrying after the server warms up often fixes it.

Evidence that Pylance supports Call Hierarchy (and has had related issues/bugfixes) is in the Pylance issue tracker, showing “Show Call Hierarchy” being used and improved. ([GitHub][2])

---

## 3) Per‑language capability snapshot (as of Nov 5, 2025)

* **TypeScript/JavaScript (built‑in TS server)** — Call Hierarchy supported since VS Code 1.42 / TS 3.8. Use Call Hierarchy first. ([Visual Studio Code][3])
* **Python (Pylance)** — Call Hierarchy implemented; works but can be sensitive to cursor position and has edge‑case bugs. Use Call Hierarchy first; fallback if empty. ([GitHub][2])
* **Java (Red Hat / JDT LS)** — Call Hierarchy supported. Use Call Hierarchy. ([Visual Studio Marketplace][4])
* **Dart (Dart Analysis Server)** — LSP implementation lists `prepareCallHierarchy`, `incomingCalls`, `outgoingCalls` as supported. Use Call Hierarchy. ([Chromium Git Repositories][5])
* **Go (gopls)** — Call Hierarchy is supported and actively maintained (with caveats around lambdas). Use Call Hierarchy; expect some known limitations. ([Go][6])
* **C#**

  * **OmniSharp**: Lacked proper Call Hierarchy (open feature request). Use fallback on OmniSharp. ([GitHub][7])
  * **C# Dev Kit / Roslyn LSP**: Public docs don’t clearly guarantee Call Hierarchy in VS Code; detect at runtime (try/observe). If not available, fallback. *(We avoid over‑claiming without official doc.)*

---

## 4) Universal strategy

1. **Resolve a precise identifier position** for the symbol:

   * Use `vscode.executeDocumentSymbolProvider` to find the `DocumentSymbol` for `symbolName`, then use `selectionRange.start` (puts the cursor on the actual identifier token).
2. **Try Call Hierarchy** at that position:

   * If `prepareCallHierarchy` returns items, traverse incoming/outgoing calls via the built‑ins.
3. **Fallback to References** if unsupported or empty:

   * Use `vscode.executeReferenceProvider` to get `Location[]`.
   * Filter to *caller sites* using lightweight textual heuristics: the next non‑whitespace after the reference token is `(` (function call), or `.` followed by name + `(` (method call), excluding decorators/annotations and import statements.
   * Determine the **caller function/method name** by locating the enclosing `DocumentSymbol` at each reference location.
4. **Outgoing calls fallback** (when needed):

   * Extract the function body text (from the target symbol’s `range`).
   * Regex‑scan for call‑like tokens (`foo(`, `obj.foo(`); ignore control keywords (`if`, `for`, `while`, `switch`, `return`, `new`, language‑specific keywords).
   * For each candidate callee identifier, resolve definition(s) using `vscode.executeDefinitionProvider` to turn tokens into real symbols.

This keeps you within the VS Code API; no external CLI tools are required.

---

## 5) Drop‑in code (TypeScript) — callers, with Call Hierarchy + Fallback

> Paste into your extension (e.g. `src/calls.ts`). The function signature matches your request.

```ts
import * as vscode from 'vscode';

export type CallerInfo = { file: string; line: number; callerName: string };

/**
 * Find callers of a symbol by name in a given file.
 * Strategy:
 *  1) Resolve precise identifier position using DocumentSymbol selectionRange.
 *  2) Try Call Hierarchy (incoming calls).
 *  3) Fallback to reference provider and filter to call-sites.
 */
export async function findCallers(
  filePath: string,
  symbolName: string
): Promise<CallerInfo[]> {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);

  // 1) Resolve a precise identifier position (selectionRange.start on the symbol).
  const sym = await pickSymbolByName(uri, symbolName);
  if (!sym) return [];
  const pos = sym.selectionRange.start;

  // 2) Try Call Hierarchy first.
  const callersViaCH = await incomingViaCallHierarchy(uri, pos);
  if (callersViaCH.length) {
    return callersViaCH;
  }

  // 3) Fallback to references: filter to call-sites and map to enclosing caller name.
  const callersViaRefs = await incomingViaReferences(uri, pos);
  return callersViaRefs;
}

/* ----------------------------- helpers ----------------------------- */

async function pickSymbolByName(uri: vscode.Uri, name: string): Promise<vscode.DocumentSymbol | undefined> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    uri
  );
  if (!symbols) return undefined;
  const flat = flatten(symbols);
  // Prefer functions/methods with exact name
  const candidates = flat.filter(s =>
    (s.kind === vscode.SymbolKind.Function || s.kind === vscode.SymbolKind.Method) &&
    s.name === name
  );
  return candidates[0] ?? flat.find(s => s.name === name);
}

function flatten(nodes: vscode.DocumentSymbol[]): vscode.DocumentSymbol[] {
  const out: vscode.DocumentSymbol[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const n = stack.shift()!;
    out.push(n);
    stack.unshift(...n.children);
  }
  return out;
}

async function incomingViaCallHierarchy(uri: vscode.Uri, pos: vscode.Position): Promise<CallerInfo[]> {
  try {
    const prepare = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      uri,
      pos
    );
    if (!prepare || prepare.length === 0) return [];
    // If multiple overloads/items, union results
    const items = prepare;
    const results: CallerInfo[] = [];
    for (const it of items) {
      const incoming = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
        'vscode.provideIncomingCalls',
        it
      );
      if (!incoming) continue;
      for (const inc of incoming) {
        // Each incoming has `from` (the caller) and one or more `fromRanges`
        const caller = inc.from;
        for (const r of inc.fromRanges) {
          results.push({
            file: caller.uri.fsPath,
            line: r.start.line + 1,
            callerName: caller.name
          });
        }
      }
    }
    // De-dup by (file, line, callerName)
    return dedupe(results);
  } catch {
    return [];
  }
}

async function incomingViaReferences(uri: vscode.Uri, pos: vscode.Position): Promise<CallerInfo[]> {
  const refs = await vscode.commands.executeCommand<vscode.Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    pos
  );
  if (!refs || refs.length === 0) return [];

  const targetDoc = await vscode.workspace.openTextDocument(uri);
  const targetSymRange = (await guessTargetDefinitionRange(uri, pos)) ?? undefined;

  const out: CallerInfo[] = [];
  for (const loc of refs) {
    // Skip definition(s) of the symbol itself.
    if (targetSymRange && loc.uri.fsPath === uri.fsPath && rangesEqual(loc.range, targetSymRange)) {
      continue;
    }
    const refDoc = await vscode.workspace.openTextDocument(loc.uri);
    if (!isCallLikeReference(refDoc, loc.range)) {
      continue;
    }
    const callerName = await enclosingCallableName(refDoc, loc.range.start);
    out.push({
      file: loc.uri.fsPath,
      line: loc.range.start.line + 1,
      callerName: callerName ?? '(unknown caller)'
    });
  }
  return dedupe(out);
}

function rangesEqual(a: vscode.Range, b: vscode.Range): boolean {
  return a.start.line === b.start.line && a.start.character === b.start.character &&
         a.end.line === b.end.line && a.end.character === b.end.character;
}

async function guessTargetDefinitionRange(uri: vscode.Uri, pos: vscode.Position): Promise<vscode.Range | undefined> {
  // Use symbol provider to find definition range for equality checks.
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    uri
  );
  if (!symbols) return undefined;
  const flat = flatten(symbols);
  const match = flat.find(s => s.selectionRange.contains(pos));
  return match?.selectionRange ?? match?.range;
}

function isCallLikeReference(doc: vscode.TextDocument, refRange: vscode.Range): boolean {
  // Heuristic: next non-whitespace char after the reference token is '(' (possibly across a few spaces),
  // allowing for member calls like "obj.foo(" where refRange selects "foo".
  // Exclude decorators/annotations like "@foo".
  const after = slice(doc, refRange.end, 0, 64);
  const beforeCh = slice(doc, new vscode.Position(refRange.start.line, Math.max(0, refRange.start.character - 1)), 0, 1);

  if (beforeCh === '@') return false; // decorator (Python), annotation (others)
  const match = after.match(/^\s*\(/);
  if (match) return true;

  // Handle dotted call chains where server may return the identifier token only.
  // e.g. "obj.add_numbers(" -> still a call.
  // We also allow generic calls like "Namespace.Func<...>(" in C#/TS/Java.
  const tail = slice(doc, refRange.end, 0, 96);
  if (/^\s*(<[^>]*>\s*)?\(/.test(tail)) return true;

  // Not a call-like usage (could be a reference, import, variable, etc.)
  return false;
}

async function enclosingCallableName(doc: vscode.TextDocument, pos: vscode.Position): Promise<string | undefined> {
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider',
    doc.uri
  );
  if (!symbols) return undefined;
  const flat = flatten(symbols);
  // Find the innermost function/method/class that contains the position
  const container = flat
    .filter(s => s.range.contains(pos))
    .sort((a, b) => (b.range.end.line - b.range.start.line) - (a.range.end.line - a.range.start.line))[0];
  if (!container) return undefined;

  if (container.kind === vscode.SymbolKind.Function || container.kind === vscode.SymbolKind.Method) {
    return container.name;
  }
  // If we’re inside a class but not inside a specific method, return class name.
  if (container.kind === vscode.SymbolKind.Class) {
    return container.name;
  }
  // Otherwise walk up to a callable parent if any.
  let parent = findParent(container, flat);
  while (parent) {
    if (parent.kind === vscode.SymbolKind.Function || parent.kind === vscode.SymbolKind.Method) {
      return parent.name;
    }
    parent = findParent(parent, flat);
  }
  return undefined;
}

function findParent(child: vscode.DocumentSymbol, pool: vscode.DocumentSymbol[]): vscode.DocumentSymbol | undefined {
  return pool.find(s => s.children?.includes(child));
}

function slice(doc: vscode.TextDocument, start: vscode.Position, relLineDelta: number, charCount: number): string {
  const end = new vscode.Position(start.line + relLineDelta, start.character + charCount);
  return doc.getText(new vscode.Range(start, end));
}

function dedupe(items: CallerInfo[]): CallerInfo[] {
  const seen = new Set<string>();
  const out: CallerInfo[] = [];
  for (const it of items) {
    const key = `${it.file}:${it.line}:${it.callerName}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}
```

### Example use (your test case)

```ts
const callers = await findCallers(
  '/workspaces/vscode-bridge/test/python/test_example.py',
  'add_numbers'
);
// Expect one incoming call from test_simple_addition (line number depends on file contents).
console.log(callers);
```

**Why this fixes your Python case**
We resolve `selectionRange.start` for `add_numbers` and pass that to `prepareCallHierarchy`. That aligns with Pylance expectations and avoids the “no items” error you saw when the position is off the identifier. If Pylance still returns empty, the fallback path filters references down to *call sites* only.

---

## 6) Optional: outgoing calls (callees) with fallback

When Call Hierarchy is missing, you can still get outgoing calls from a function by scanning the body for call‑like tokens and validating each with `executeDefinitionProvider`.

```ts
export type CalleeInfo = { file: string; line: number; calleeName: string };

export async function findCallees(filePath: string, symbolName: string): Promise<CalleeInfo[]> {
  const uri = vscode.Uri.file(filePath);
  const doc = await vscode.workspace.openTextDocument(uri);

  const sym = await pickSymbolByName(uri, symbolName);
  if (!sym) return [];

  // Prefer Call Hierarchy when possible.
  const out: CalleeInfo[] = [];
  const pos = sym.selectionRange.start;
  const prepared = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
    'vscode.prepareCallHierarchy',
    uri,
    pos
  ).catch(() => undefined);

  if (prepared && prepared.length) {
    for (const it of prepared) {
      const outgoing = await vscode.commands.executeCommand<vscode.CallHierarchyOutgoingCall[]>(
        'vscode.provideOutgoingCalls',
        it
      );
      if (!outgoing) continue;
      for (const oc of outgoing) {
        for (const r of oc.fromRanges) {
          out.push({ file: oc.to.uri.fsPath, line: r.start.line + 1, calleeName: oc.to.name });
        }
      }
    }
    return out;
  }

  // Fallback: scan function body for call-like tokens, then resolve definitions.
  const bodyText = doc.getText(sym.range);
  const bodyStart = sym.range.start;

  // Simple, language-agnostic call token regex: identifiers followed by '('.
  // Exclude keywords (extend list per language as needed).
  const KEYWORDS = /\b(if|for|while|switch|return|catch|new|yield|await|typeof|sizeof|await|match)\b/;
  const CALL_RE = /\b([A-Za-z_]\w*)\s*(<[^>]*>\s*)?\(/g;

  let m: RegExpExecArray | null;
  while ((m = CALL_RE.exec(bodyText))) {
    if (KEYWORDS.test(m[1])) continue;
    const matchIndex = m.index;
    const lineCol = offsetToPosition(bodyText, matchIndex);
    const posInDoc = new vscode.Position(bodyStart.line + lineCol.line, (lineCol.line === 0 ? bodyStart.character : 0) + lineCol.character);

    const defs = await vscode.commands.executeCommand<vscode.Location[]>(
      'vscode.executeDefinitionProvider',
      uri,
      posInDoc
    );
    if (defs && defs.length) {
      for (const d of defs) {
        out.push({ file: d.uri.fsPath, line: d.range.start.line + 1, calleeName: m[1] });
      }
    }
  }
  return dedupeCallees(out);
}

function dedupeCallees(items: CalleeInfo[]): CalleeInfo[] {
  const seen = new Set<string>();
  const out: CalleeInfo[] = [];
  for (const it of items) {
    const key = `${it.file}:${it.line}:${it.calleeName}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(it);
    }
  }
  return out;
}

function offsetToPosition(text: string, offset: number): { line: number; character: number } {
  let line = 0, col = 0;
  for (let i = 0; i < offset; i++) {
    if (text.charCodeAt(i) === 10) { line++; col = 0; } else { col++; }
  }
  return { line, character: col };
}
```

---

## 7) Capability detection (and caching)

You can’t read server capabilities directly from VS Code for another extension’s LSP, so the pragmatic detection is a **probe**:

```ts
const callHierarchySupportCache = new Map<string /* languageId */, boolean>();

export async function supportsCallHierarchy(uri: vscode.Uri, symbolPos: vscode.Position): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const cached = callHierarchySupportCache.get(doc.languageId);
  if (typeof cached === 'boolean') return cached;

  try {
    const items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      uri,
      symbolPos
    );
    const supported = !!(items && items.length);
    callHierarchySupportCache.set(doc.languageId, supported);
    return supported;
  } catch {
    callHierarchySupportCache.set(doc.languageId, false);
    return false;
  }
}
```

This costs one cheap request per languageId and then hits the cache.

---

## 8) Practical answers to your questions

1. **Definitive VS Code API?**
   Use Call Hierarchy first (`prepareCallHierarchy` → incoming/outgoing), fallback to `executeReferenceProvider`. Directionality (incoming/outgoing) comes from Call Hierarchy; with References you infer direction locally. ([Visual Studio Code][1])

2. **Why Python failed?**
   Pylance supports Call Hierarchy; your position likely wasn’t on the identifier token (or the server wasn’t warmed up). Pylance has had call‑hierarchy bugs that were fixed over time, confirming the feature exists. The code above uses `selectionRange.start` to avoid this. ([GitHub][2])

3. **Universal fallback strategy?**
   Yes: References → filter to call‑sites (textual heuristic) → map to enclosing callable via `DocumentSymbol`. Detect support by *probing* `prepareCallHierarchy` and cache per language.

4. **Incoming vs outgoing with References?**

   * *Incoming* (callers): Reference sites where the symbol is used in a call position.
   * *Outgoing* (callees): Parse the function body to find call‑like tokens and resolve them with Definition Provider.
     This is conservative but works well across languages without external tooling.

5. **Capabilities by language (today):**

   * TS/JS — yes (built‑in). ([Visual Studio Code][3])
   * Python/Pylance — yes (with quirks). ([GitHub][2])
   * Java (JDT LS) — yes. ([Visual Studio Marketplace][4])
   * Dart — yes. ([Chromium Git Repositories][5])
   * Go (gopls) — yes (with caveats). ([Go][6])
   * C# — OmniSharp: not implemented; Roslyn LSP in C# Dev Kit: detect at runtime. ([GitHub][7])
     The LSP spec added Call Hierarchy in 3.16, which is why support varies by server maturity. ([Microsoft GitHub][8])

6. **What does the UI use?**
   Exactly the same commands you’re calling (`prepareCallHierarchy`, `provideIncomingCalls`, `provideOutgoingCalls`, `executeReferenceProvider`). ([Visual Studio Code][1])

---

## 9) Pitfalls and mitigations

* **Wrong position**: Prepare must be on the identifier token. Mitigation: always resolve via `DocumentSymbol.selectionRange.start`.
* **Server not ready**: Initial analysis may be in progress; retry or wait for diagnostics to appear.
* **Empty results even though calls exist**:

  * Overloads / abstractions not modeled; inheritance/virtual dispatch is server‑dependent (e.g., earlier Pylance issues). ([GitHub][2])
  * Dynamic features (Python `__getattr__`, reflection, `eval`, decorators) elude static analysis.
  * Cross‑workspace boundaries (e.g., generated code, vendored deps) not analyzed by the server.
* **References contain imports/aliases/defs**: You must filter (skip definition ranges, skip decorators/imports, ensure `(` follows).
* **Language quirks**:

  * Python decorators `@name` should not count as calls to the function under inspection (unless you deliberately include them).
  * TS/JS property calls (`obj.fn(`) and generic calls (`fn<T>(`) are supported by the heuristic above.
  * C#/Java/Dart/Go generics and method groups: keep the generic‑angle‑bracket allowance in the regex.
* **Performance**: For very large codebases, prefer Call Hierarchy (the server does the heavy lifting). In fallback:

  * Avoid reading whole files when checking references (read only short slices around the reference).
  * Cache capability per language and memoize symbol lookups per file.
  * Respect a `CancellationToken` in your command/action to remain responsive.
* **Multiple symbols with same name**: The helper chooses the first function/method match. If you have multiple, extend `pickSymbolByName` to also use container/class name or a line hint.
* **Languages without LSP support**: You still get partial results via References; if even that’s not available, degrade to text search or workspace symbols, but keep those behind an opt‑in flag.

---

## 10) Integration notes (answers)

* **Do we need to open files first?**
  You don’t need a visible editor, but you should `openTextDocument(uri)` to give providers sufficient context. Many servers work on closed files, but this keeps behavior consistent.

* **Batching lookups efficiently?**
  Group by file: open each file at most once; reuse `DocumentSymbol` results per file to compute enclosing callers. Cache Call Hierarchy support per `languageId`.

* **Workspace‑wide / multi‑project**
  Your API calls are file/position‑scoped; let the language server follow cross‑file references. For seed symbol discovery, combine `vscode.executeWorkspaceSymbolProvider` (broad search) with per‑file symbol resolution.

* **Capability cache**
  Yes—cache per `languageId` as in `supportsCallHierarchy` above; invalidate on extension activation or when the user changes the active language server.

---

## 11) Quick checks you can try now

* Put the cursor **on the `add_numbers` identifier** (not just the line), and run:

  ```ts
  await vscode.commands.executeCommand('vscode.prepareCallHierarchy', uri, posOnName);
  ```

  If Pylance is ready, you should get one or more `CallHierarchyItem`s back. If not, the fallback path in `findCallers` will still return the incoming call from `test_simple_addition` by filtering references.

---

## 12) References & specs (for the five most load‑bearing facts)

* VS Code built‑in commands for Call Hierarchy & References (what you should call programmatically). ([Visual Studio Code][1])
* Call Hierarchy added to LSP in v3.16 (explains why some servers still lack it). ([Microsoft GitHub][8])
* TypeScript/JavaScript Call Hierarchy support in VS Code since 1.42. ([Visual Studio Code][3])
* Pylance uses “Show Call Hierarchy” (feature exists; has had bugfix iterations). ([GitHub][2])
* Java (JDT LS) lists Call Hierarchy support; Dart LSP lists `prepareCallHierarchy`/incoming/outgoing; Go `gopls` documents Call Hierarchy. ([Visual Studio Marketplace][4])
* OmniSharp Call Hierarchy feature request (use fallback for OmniSharp). ([GitHub][7])

---

### TL;DR

* **Always**: resolve the exact identifier token via `DocumentSymbol.selectionRange.start`.
* **Try**: `prepareCallHierarchy` → incoming/outgoing calls.
* **Fallback**: `executeReferenceProvider` and filter to call‑sites; for outgoing, scan body + `executeDefinitionProvider`.
* **Detect & cache**: probe Call Hierarchy support per languageId and cache it.

The included code implements this end‑to‑end and should pass your Python test case while generalizing across all the languages you listed.

[1]: https://code.visualstudio.com/api/references/commands?utm_source=chatgpt.com "Built-in Commands | Visual Studio Code Extension API"
[2]: https://github.com/microsoft/pylance-release/issues/2774 "Show Call Hierarchy doesn't handle overridden methods correctly · Issue #2774 · microsoft/pylance-release · GitHub"
[3]: https://code.visualstudio.com/updates/v1_42?utm_source=chatgpt.com "January 2020 (version 1.42)"
[4]: https://marketplace.visualstudio.com/items?itemName=redhat.java&utm_source=chatgpt.com "Language Support for Java(TM) by Red Hat"
[5]: https://chromium.googlesource.com/external/github.com/dart-lang/sdk/%2B/refs/tags/3.0.0-81.0.dev/pkg/analysis_server/tool/lsp_spec/README.md "Language Server Protocol"
[6]: https://go.dev/gopls/features/navigation?utm_source=chatgpt.com "Gopls: Navigation features"
[7]: https://github.com/OmniSharp/omnisharp-roslyn/issues/2612?utm_source=chatgpt.com "[LSP] Feature request: Call Hierarchy · Issue #2612"
[8]: https://microsoft.github.io/language-server-protocol/specifications/specification-3-16/?utm_source=chatgpt.com "Language Server Protocol Specification - 3.16"
