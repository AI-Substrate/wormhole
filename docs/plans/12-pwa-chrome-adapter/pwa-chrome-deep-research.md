Below is a concise, evidence‑based guide to what actually differs between **pwa‑node** and **pwa‑chrome** in VS Code’s JavaScript debugger (js‑debug), and what you need to change in your DAP bridge to make variable inspection work for **pwa‑chrome**.

---

## 0) Quick corrections to assumptions

* **The “Extension Host” debug type is not `pwa-chrome`.** For desktop VS Code extensions the built‑in launch type is **`pwa-extensionHost`** (internally still the same js‑debug family). Web extensions also use `pwa-extensionHost` but run in a browser‑like host. You only use `pwa-chrome` when you’re actually debugging a browser target (Chrome/Edge) rather than the extension host. ([GitHub][1])

* **pwa‑node and pwa‑chrome share the same core adapter** (the js‑debug extension), but they are *not* identical: they differ in **target discovery/attachment**, **scope shapes from CDP**, and **browser‑only features** (e.g., instrumentation/event‑listener breakpoints, worker/iframe targets). ([GitHub][2])

---

## 1) Protocol & capabilities (what DAP says vs what js‑debug returns)

**What DAP standardizes**

Key capabilities are negotiated in the **`initialize`** response (e.g., `supportsSetVariable`, `supportsSetExpression`, `supportsEvaluateForHovers`, `supportsStepInTargetsRequest`, etc.). These are runtime‑agnostic and come straight from the DAP spec. ([Microsoft GitHub][3])

**What js‑debug actually reports**

In practice, js‑debug reports very similar capabilities across `pwa-node` and `pwa-chrome`. A typical `initialize` body looks like this (real logs from js‑debug issues), showing hover evaluation, setVariable, setExpression, step‑in‑targets, read/write memory (for WASM), etc.: ([GitHub][4])

```json
{
  "supportsConfigurationDoneRequest": true,
  "supportsConditionalBreakpoints": true,
  "supportsHitConditionalBreakpoints": true,
  "supportsEvaluateForHovers": true,
  "supportsReadMemoryRequest": true,
  "supportsWriteMemoryRequest": true,
  "supportsSetVariable": true,
  "supportsRestartFrame": true,
  "supportsStepInTargetsRequest": true,
  "supportsCompletionsRequest": true,
  "supportsRestartRequest": true,
  "supportsValueFormattingOptions": true,
  "supportsExceptionInfoRequest": true,
  "supportsLoadedSourcesRequest": true,
  "supportsLogPoints": true,
  "supportsSetExpression": true,
  "supportsBreakpointLocationsRequest": true,
  "supportsClipboardContext": true
}
```

> **Takeaway:** you do **not** need a different DAP surface for `pwa-chrome`; js‑debug advertises largely the same DAP capabilities for both, and VS Code’s docs confirm these are standard DAP features. Your bridge should treat them the same at the protocol level, but be ready for **browser‑specific behaviors** in scopes/targets and **evaluate** semantics. ([Microsoft GitHub][3])

---

## 2) Target model differences you must handle

* **Node (pwa‑node):** targets are Node processes and worker threads; js‑debug auto‑attaches to child processes/worker threads. ([GitHub][2])
* **Browser (pwa‑chrome):** targets are **pages, iframes, service workers, and web workers**. Each becomes its own DAP “thread” with independent call stacks. This is more dynamic than Node and affects your `threads`, `stackTrace`, and per‑thread variable handling. ([GitHub][2])

---

## 3) Scopes & variables (the real differences)

Both adapters surface variables through DAP `scopes`/`variables`, but the **underlying CDP “scope types”** differ more often in the browser:

* CDP scope types include: `global`, `local`, `with`, `closure`, `catch`, `block`, `script`, `eval`, `module`, `wasm-expression-stack`. Browsers frequently produce **`block`** and **`with`** scopes; Node often shows **`script`**/`module` wrappers from CommonJS/ESM. ([cdpstatus.reactnative.dev][5])

* **Setting variables:** CDP’s `Debugger.setVariableValue` can only modify **`local`**, **`closure`**, and **`catch`** scopes—**not** `global`, `block`, `module`, etc. So `setVariable` might succeed on Node locals/closures and fail on browser globals or module scopes. Surface this gracefully. ([chromedevtools.github.io][6])

### Example 2: Scope response comparison

**pwa‑node** (paused in a user function inside a CommonJS module):

```json
{
  "scopes": [
    { "name": "Local",   "variablesReference": 101, "expensive": false },
    { "name": "Closure", "variablesReference": 102, "expensive": false },
    { "name": "Script",  "variablesReference": 103, "expensive": true  },
    { "name": "Global",  "variablesReference": 104, "expensive": true  }
  ]
}
```

**pwa‑chrome** (paused inside a block, in a page):

```json
{
  "scopes": [
    { "name": "Local",   "variablesReference": 201, "expensive": false },
    { "name": "Block",   "variablesReference": 202, "expensive": false },   // browser-typical
    { "name": "Closure", "variablesReference": 203, "expensive": false },
    { "name": "Global",  "variablesReference": 204, "expensive": true  }
  ]
}
```

> The names in DAP are friendly strings produced by the adapter, but they reflect the CDP scope types above. Design your UI logic to **not hard‑code** just `Local/Closure/Global`. Expect `Block`, `With`, `Script`, and `Module` in the browser. ([cdpstatus.reactnative.dev][5])

---

## 4) Evaluate semantics (hover/watch/REPL) & side‑effects

* **DAP contexts**: VS Code sends an `evaluate` request with `context` values like `"hover"`, `"watch"`, `"repl"`, and optionally `"clipboard"`. Adapters that set `supportsEvaluateForHovers` promise a **side‑effect‑free** hover evaluation. ([Microsoft GitHub][3])

* **How js‑debug does it:** Under the hood it uses CDP `Runtime.evaluate` and, for side‑effect‑free hovers, sets `throwOnSideEffect: true`. Node’s inspector also exposes this flag, though historically there were edge cases/bugs. Don’t assume parity on every expression; handle “cannot run without side effects” errors and fall back to a safe preview. ([chromedevtools.github.io][7])

### Example 4: Evaluation context

```ts
// Node (pwa-node) – side-effect free hover
await session.customRequest('evaluate', {
  expression: 'Object.is(a, b)',
  frameId: 1,
  context: 'hover'
});

// Browser (pwa-chrome) – same DAP; behind the scenes uses CDP Runtime.evaluate
await session.customRequest('evaluate', {
  expression: 'Object.is(a, b)',
  frameId: 1,
  context: 'hover'
});
```

> **Object.is for cycle checks:** Pure equality checks like `Object.is(a,b)` generally work in both, including in hover, so long as `a`/`b` are in the current lexical scope. However, you **cannot** call `Object.is` on *remote object IDs* via DAP. If your cycle detection depends on identity of nested properties you fetched via `variables`, do it locally using the **variables graph** you already materialized (your Node adapter’s “Object.is cycle detection” likely already works this way). For direct mutation via `setVariable`, remember the CDP restriction noted above. ([Microsoft GitHub][3])

---

## 5) Variables, pagination, and evaluateName

* **Variables pagination & filters:** DAP’s `variables` request supports `filter: 'indexed' | 'named'`, and `start`/`count` for paging large arrays/objects. Implementers are expected to support this; it’s how VS Code avoids loading millions of items. Your Node adapter already uses these—mirror the same handling for Chrome. ([Go Packages][8])

* **`evaluateName`:** js‑debug sets `evaluateName` on variables where an expression can re‑access them (`foo.bar`, `arr[0]`, `this.x`). The pattern is comparable between Node and Chrome, but in browsers you’ll sometimes see synthetic scopes (`Block`, `With`) where not all properties have a sensible `evaluateName`. Treat missing `evaluateName` as “not assignable via `setExpression`”. (DAP uses `evaluateName` to prefer `setExpression` over `setVariable`.) ([Microsoft GitHub][3])

### Example 3: Variables retrieval pattern

```ts
const vars = await session.customRequest('variables', {
  variablesReference: ref,
  // Standard DAP features (both adapters):
  start: 0,           // pagination start
  count: 100,         // pagination count
  filter: 'indexed'   // or 'named'
});
```

---

## 6) Extension Host specifics (what you can/can’t inspect)

* In a typical extension `activate(context: vscode.ExtensionContext)`, you **can** inspect `context`, `disposable`, and objects returned from `vscode.window.*` (they’re plain JS objects/proxies surfaced by the extension host). There’s no special sandbox that blocks variable inspection.

* **Mutation caveats:** `setVariable` respects CDP limitations—locals/closures/catch only. Attempting to mutate globals or certain proxy‑backed VS Code API objects may be rejected or appear to “succeed” without effect if the underlying property is not writable. That’s by design of CDP’s `setVariableValue`. ([chromedevtools.github.io][6])

* **Multiple execution contexts:** In the extension host you might see additional contexts when debugging **webviews** or **web worker hosts** (especially for web extensions). These show up as additional threads/targets; your adapter must map them just as you do for Node worker threads or browser workers. ([GitHub][2])

---

## 7) Chrome‑only features you should surface (but Node won’t)

* **Event Listener (instrumentation) breakpoints** and a **Network view** are browser‑side features js‑debug offers when connected to Chrome/Edge. They don’t exist in Node. Don’t assume parity; expose these only for `pwa-chrome`. ([GitHub][2])

---

## 8) Recommended implementation approach

**Yes, extend your Node adapter — but via a CDP‑aware base.**

You already have `BaseDebugAdapter` + `NodeDebugAdapter`. The smoothest path is:

1. **Extract a “CDPCommon” layer** that contains:

   * DAP plumbing for `variables`, `scopes`, `evaluate`, `setVariable`, paging/filters, value formatting, and your cycle‑detection/memory budgets.
   * A small policy table that maps CDP scope types → DAP scope names and flags (e.g., mark `Global` or `Script` scopes as `expensive`, disallow `setVariable` there).

2. **Create a `ChromeDebugAdapter`** that:

   * Uses Chrome‑style target discovery (page/iframe/worker/service worker) and maps each target to a DAP thread.
   * Opts into browser‑only convenience features (event listener breakpoints, network view) but keeps the **same** `initialize` capability set you use for Node where applicable. ([GitHub][2])

> This mirrors how js‑debug itself shares logic across Node and browser while swapping only the launcher/target manager and a few presentation extras. (The repo’s README lists these features at a high level.) ([GitHub][2])

---

## 9) Practical examples (as requested)

### Example 1: DAP capability comparison

```ts
// Capabilities your bridge can safely advertise for BOTH `pwa-node` and `pwa-chrome`
// (based on DAP spec and observed js-debug initialize payloads)
const commonCapabilities = {
  supportsConfigurationDoneRequest: true,
  supportsConditionalBreakpoints: true,
  supportsHitConditionalBreakpoints: true,
  supportsEvaluateForHovers: true,
  supportsSetVariable: true,
  supportsRestartFrame: true,
  supportsCompletionsRequest: true,
  supportsRestartRequest: true,
  supportsValueFormattingOptions: true,
  supportsExceptionInfoRequest: true,
  supportsLoadedSourcesRequest: true,
  supportsLogPoints: true,
  supportsBreakpointLocationsRequest: true,
  supportsClipboardContext: true,
  // Optional depending on your WASM support:
  supportsReadMemoryRequest: true,
  supportsWriteMemoryRequest: true,
  // Useful for browser step-in granularity:
  supportsStepInTargetsRequest: true
};

// Chrome-only niceties are feature/UI level (instrumentation breakpoints, network view),
// not new DAP fields, so we don't change capabilities for them. :contentReference[oaicite:20]{index=20}

const nodeCapabilities   = { ...commonCapabilities };
const chromeCapabilities = { ...commonCapabilities };
```

### Example 2: Scopes response (see §3 for details)

*(Shown earlier; include `Block`/`With` in Chrome, `Script`/`Module` wrappers in Node.)* ([cdpstatus.reactnative.dev][5])

### Example 3: Variables retrieval (paging/filters)

*(Shown earlier — same DAP for both adapters).)* ([Go Packages][8])

### Example 4: Evaluation contexts

*(Shown earlier — same DAP; side‑effect‑free hover backed by CDP `throwOnSideEffect` in both runtimes.)* ([Microsoft GitHub][3])

### Example 5: Extension Host debugging

```ts
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('my.cmd', () => {
    const panel = vscode.window.createWebviewPanel('x','y',vscode.ViewColumn.One,{});
    // You can inspect `context`, `disposable`, `panel` in the debugger.
    // Mutations via setVariable only work for locals/closures/catch (CDP restriction),
    // not for arbitrary global/module props. :contentReference[oaicite:24]{index=24}
  });
  context.subscriptions.push(disposable);
}
```

---

## 10) Pitfalls & mitigations

1. **Assuming identical scope trees.** Browser yields `Block`, `With`, `Eval`, multiple globals (e.g., iframes). **Mitigation:** feature‑detect scope types and label accordingly; don’t special‑case just three names. ([cdpstatus.reactnative.dev][5])

2. **`setVariable` everywhere.** It only works on `local`/`closure`/`catch`. **Mitigation:** degrade to `setExpression` when `evaluateName` exists; otherwise show an explanatory error. ([chromedevtools.github.io][6])

3. **Workers/iframes as threads.** Browser targets appear and vanish; stale thread IDs break variable/stack calls. **Mitigation:** refresh thread list on `Debugger.targetCreated/Destroyed` and clear variable handles per thread. ([GitHub][2])

4. **Side‑effect‑free evaluation failures.** CDP may reject expressions that might cause side effects. **Mitigation:** catch “side effect” errors for hover and show previews from already‑fetched variables. ([chromedevtools.github.io][7])

5. **Extension Host confusion.** Using `pwa-chrome` for desktop extension debugging is wrong; use `pwa-extensionHost`. **Mitigation:** route session by `type` and show a helpful error if a user selects the wrong one. ([GitHub][1])

---

## 11) Testing strategy

* **Minimal Chrome test app**: a single HTML file with a script that sets local, block, closure, and global vars; spawns a web worker; opens an iframe; throws and catches an exception. Validates scopes, workers→threads, and `setVariable` success/failure by scope type. (Use `--remote-debugging-port`/pipe as needed; js‑debug can also launch Chrome directly.) ([Visual Studio Code][9])

* **Minimal Node test app**: function with closure vars, try/catch, and a large array (to validate paging). Child process + worker thread to check thread handling. ([GitHub][2])

* **Automate** by recording DAP traffic (VS Code’s “trace: true” in launch config) and diffing `initialize`, `scopes`, `variables`, `evaluate` transactions across the two adapters to ensure your bridge emits the same shapes where expected. (Real initialize bodies from js‑debug look like the examples above.) ([GitHub][4])

---

## 12) Backwards compatibility & performance

* **Adapter registration:** keep your existing selection by `session.type` (`pwa-node`, `pwa-chrome`, `pwa-extensionHost`) so other adapters aren’t touched. ([GitHub][1])

* **Pagination defaults:** Chrome pages often surface huge DOM‑backed collections/arrays; keep conservative `start/count` defaults (e.g., 100–200) and show “load more” affordances the same way you do for Node.

* **Memory budgets & previews:** identical logic can be reused; just expect *more* threads (workers/iframes) and slightly deeper scope chains in browsers. ([GitHub][2])

---

## 13) Deliverables you asked for

1. **Protocol comparison matrix (pwa‑node vs pwa‑chrome)**

   * **Same DAP capabilities**: `supportsEvaluateForHovers`, `supportsSetVariable`, `supportsSetExpression`, `supportsRestartFrame`, `supportsBreakpointLocationsRequest`, paging in `variables` (spec). ([Microsoft GitHub][3])
   * **Different behaviors**: scope types present; target/thread model; mutation restrictions by scope (`local`/`closure`/`catch` only). ([cdpstatus.reactnative.dev][5])
   * **Chrome‑only features in UI**: instrumentation/event listener breakpoints, network view. ([GitHub][2])

2. **Actual DAP examples**

   * Initialize bodies and capability sets: see logs extracted above. ([GitHub][4])
   * Scopes examples: see §3.

3. **Implementation guidance**

   * Create `ChromeDebugAdapter` that *extends* your shared CDP/DAP logic; override only target discovery, scope labeling, and browser‑only feature toggles (no wholesale rewrite). ([GitHub][2])

4. **Test cases**

   * Minimal Node + Chrome apps as in §11. Use `trace: true` and thread/variables diffs to validate parity. ([Visual Studio Code][9])

5. **Known limitations**

   * `setVariable` only for `local`/`closure`/`catch` scopes.
   * Side‑effect‑free hover can reject expressions; handle error UX.
   * Chrome targets are dynamic (workers/iframes), so clear handles per thread and re‑query. ([chromedevtools.github.io][6])

6. **Code pointers (official sources)**

   * **DAP spec** (capabilities, evaluate contexts, variables paging). ([Microsoft GitHub][3])
   * **CDP** (Debugger scope types; setVariable restrictions; Runtime.evaluate flags). ([cdpstatus.reactnative.dev][5])
   * **js‑debug README** (what the adapter supports; workers/iframes; browser‑only features). ([GitHub][2])

---

## 14) Concrete to‑do list for your bridge

1. **Accept `pwa-chrome` sessions** alongside `pwa-node`/`pwa-extensionHost`. If your current error is `"Debug adapter 'pwa-chrome' is not currently supported"`, register a handler for that `type` and reuse your base DAP plumbing.

2. **Scope mapping**

   * Add a CDP→DAP scope name map:
     `local → "Local"`, `closure → "Closure"`, `block → "Block"`, `with → "With"`, `script → "Script"`, `module → "Module"`, `global → "Global"`.
   * Mark `global/script/module` as `expensive: true`; disallow `setVariable` outside `local/closure/catch`.

3. **Variables pagination**

   * Ensure `variables` supports `filter`, `start`, `count` for both adapters (arrays and large objects). ([Go Packages][8])

4. **Evaluate**

   * Honor `context: 'hover'` as side‑effect‑free; fall back to preview on “side‑effects” errors. Keep REPL/watch unrestricted. ([Microsoft GitHub][3])

5. **Threads/targets**

   * In Chrome: treat every page/iframe/worker as a thread; refresh on target create/destroy; clear variable handles per thread. ([GitHub][2])

6. **UX affordances**

   * Show browser‑only controls (event listener breakpoints, network view) only for `pwa-chrome`. ([GitHub][2])

---

## 15) Answers to your success criteria

* **Can you extend NodeDebugAdapter with minimal overrides?**
  **Yes**—split out CDP‑common logic, then implement a thin `ChromeDebugAdapter` (target management + scope mapping + browser‑only toggles). ([GitHub][2])

* **Which methods need `pwa-chrome`‑specific handling?**
  `threads`, `stackTrace` (multi‑target), `scopes` (names/types), and any UI features like event‑listener breakpoints/network view. `variables`, `evaluate`, `setVariable` reuse your base implementations with minor policy guards. ([GitHub][2])

* **Security/sandboxing restrictions in Extension Host?**
  No special block on variable inspection; mutation limits come from CDP scope rules and property writability. Use the correct type (`pwa-extensionHost`), not `pwa-chrome`, for desktop extension debugging. ([chromedevtools.github.io][6])

* **Test cases that validate correctness?**
  Use the minimal Node/browser scenarios in §11 and compare DAP traffic. ([GitHub][4])

* **Performance considerations?**
  Same paging/memory‑budget logic works. Expect more threads (workers/iframes) and more diverse scope chains in the browser; keep array paging conservative. ([Go Packages][8])

---

### References (key, high‑signal)

* **DAP spec** (capabilities, evaluate/variables): Microsoft Debug Adapter Protocol site. ([Microsoft GitHub][3])
* **CDP spec** (Debugger/Runtime; scopes; setVariable; throwOnSideEffect): Chrome DevTools Protocol. ([cdpstatus.reactnative.dev][5])
* **js‑debug README** (what the adapter supports, workers/iframes, browser features): vscode‑js‑debug. ([GitHub][2])
* **Extension Host debug type**: `pwa-extensionHost` in VS Code discussions/issues. ([GitHub][1])

If you want, I can draft a small `ChromeDebugAdapter` skeleton that mirrors your Node one, including a scope‑type policy map and a thread/target manager.

[1]: https://github.com/microsoft/vscode/issues/85984?utm_source=chatgpt.com "Test: Sanity check vscode-pwa · Issue #85984"
[2]: https://github.com/microsoft/vscode-js-debug "GitHub - microsoft/vscode-js-debug: A DAP-compatible JavaScript debugger. Used in VS Code, VS, + more"
[3]: https://microsoft.github.io/debug-adapter-protocol//specification.html "Specification"
[4]: https://github.com/microsoft/vscode-js-debug/issues/1659?utm_source=chatgpt.com "dapDebugServer.ts · Issue #1659 · microsoft/vscode-js- ..."
[5]: https://cdpstatus.reactnative.dev/devtools-protocol/v8/Debugger?utm_source=chatgpt.com "Debugger Domain"
[6]: https://chromedevtools.github.io/devtools-protocol/tot/Debugger/?utm_source=chatgpt.com "Debugger domain - Chrome DevTools Protocol - GitHub Pages"
[7]: https://chromedevtools.github.io/devtools-protocol/v8/Runtime/?utm_source=chatgpt.com "Chrome DevTools Protocol - version v8 - Runtime domain"
[8]: https://pkg.go.dev/github.com/google/go-dap?utm_source=chatgpt.com "dap package - github.com/google/ ..."
[9]: https://code.visualstudio.com/docs/nodejs/browser-debugging?utm_source=chatgpt.com "Browser debugging in VS Code"
