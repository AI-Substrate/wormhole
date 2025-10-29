Below is a production‑ready plan and drop‑in code to add privacy‑safe, low‑overhead Application Insights telemetry to your VS Code extension (VSC‑Bridge). I’m using the VS Code team’s official wrapper for Application Insights, and I call out where to correlate events across debug sessions, handle remote/WSL, and flush on shutdown. References are embedded inline.

---

## 1) Recommended architecture (and why)

**SDK choice.** Use the VS Code team’s official wrapper `@vscode/extension-telemetry` (class `TelemetryReporter`) instead of taking a direct dependency on the low‑level `applicationinsights` SDK. It respects the user’s VS Code telemetry setting automatically, provides a stable event API, includes common VS Code properties (machine/session IDs, remote name, UI kind, etc.), and its lifecycle/dispose semantics flush pending telemetry on shutdown. ([GitHub][1])

**Connection string, not instrumentation key.** Initialize with an **Application Insights connection string** (not the old instrumentation key). Microsoft has ended support for instrumentation‑key–based global ingestion as of **March 31, 2025**; connection strings are the path forward. The wrapper’s README also notes the connection string isn’t considered a secret, so it can be checked into source (though environment‑based override is often convenient). ([Microsoft Learn][2])

**Where to initialize.** Create one process‑wide `TelemetryReporter` during `activate()`, push it into `context.subscriptions` so `dispose()` is called automatically on shutdown (which flushes). Don’t create one per workspace folder—one reporter per extension host is idiomatic. ([GitHub][1])

**Dependency injection.** Wrap the reporter behind a tiny `ITelemetry` interface and pass it to singleton services (such as your `DebugSessionCaptureService`). This keeps units testable (inject a mock) and decouples you from the reporter API surface.

**Remote/WSL/containers.** You get `common.remotename`, `common.product`, and `common.uikind` for free, which makes remote debugging scenarios distinguishable without you plumbing those details. ([GitHub][1])

**If/when you ever outgrow the wrapper.** If you need deep control (batching, proxies, disk retry caching), you can wire the low‑level `applicationinsights` client. Defaults include `maxBatchIntervalMs = 15000` and `samplingPercentage = 100`; there are client config hooks for proxies and disk retry. But for VS Code extensions, the wrapper is typically sufficient and safer. ([GitHub][3])

---

## 2) Complete, production‑grade code examples

### Example 1 — `TelemetryService` singleton (TypeScript)

```ts
// telemetry/TelemetryService.ts
import * as vscode from 'vscode';
import TelemetryReporter from '@vscode/extension-telemetry';

export interface ITelemetry {
  sendEvent(
    name: string,
    properties?: Record<string, string>,
    measurements?: Record<string, number>
  ): void;
  sendErrorEvent(
    name: string,
    properties?: Record<string, string>,
    measurements?: Record<string, number>,
    errorProps?: string[]
  ): void;
  sendException(
    error: Error,
    properties?: Record<string, string>,
    measurements?: Record<string, number>
  ): void;
  isEnabled(): boolean;
  dispose(): Promise<void>;
}

export class TelemetryService implements ITelemetry {
  private static _instance: TelemetryService | null = null;
  static get instance(): TelemetryService {
    return (this._instance ??= new TelemetryService());
  }

  private reporter?: TelemetryReporter;
  private enabled = true; // mirrors vscode.env.isTelemetryEnabled

  private constructor() {}

  initialize(context: vscode.ExtensionContext, connectionString: string): void {
    if (this.reporter) return;

    // Respect VS Code’s telemetry setting.
    this.enabled = vscode.env.isTelemetryEnabled;
    context.subscriptions.push(
      vscode.env.onDidChangeTelemetryEnabled(e => (this.enabled = e))
    );

    // Optional: disable during local dev unless explicitly overridden
    const devDisabled =
      context.extensionMode === vscode.ExtensionMode.Development &&
      process.env.VSCBRIDGE_TELEMETRY_IN_DEV !== '1';

    if (devDisabled) {
      this.enabled = false;
      return;
    }

    // Create and register the reporter; "dispose" will flush on shutdown.
    this.reporter = new TelemetryReporter(connectionString);
    context.subscriptions.push(this.reporter);
  }

  isEnabled(): boolean {
    return this.enabled && !!this.reporter;
  }

  sendEvent(
    name: string,
    properties?: Record<string, string>,
    measurements?: Record<string, number>
  ): void {
    if (!this.isEnabled()) return;
    this.reporter!.sendTelemetryEvent(name, properties, measurements);
  }

  sendErrorEvent(
    name: string,
    properties?: Record<string, string>,
    measurements?: Record<string, number>,
    errorProps?: string[]
  ): void {
    if (!this.isEnabled()) return;
    this.reporter!.sendTelemetryErrorEvent(name, properties, measurements, errorProps);
  }

  sendException(
    error: Error,
    properties?: Record<string, string>,
    measurements?: Record<string, number>
  ): void {
    if (!this.isEnabled()) return;
    this.reporter!.sendTelemetryException(error, properties, measurements);
  }

  async dispose(): Promise<void> {
    // The TelemetryReporter’s dispose() flushes pending events, returns a Promise.
    await this.reporter?.dispose();
    this.reporter = undefined;
  }
}
```

Usage in `extension.ts`:

```ts
export async function activate(context: vscode.ExtensionContext) {
  const connectionString = "<AI_CONNECTION_STRING>"; // can be env, secret storage, or literal
  TelemetryService.instance.initialize(context, connectionString);
  // ...
}

export async function deactivate() {
  await TelemetryService.instance.dispose(); // flushes
}
```

*Why this shape?* The wrapper’s constructor is `new TelemetryReporter(connectionString)`; pushing it into `context.subscriptions` ensures it’s properly disposed (and flushed) on shutdown. `dispose()` returns a Promise (good for awaiting explicitly in `deactivate()`). ([GitHub][1])

---

### Example 2 — Privacy‑aware path sanitization

```ts
// telemetry/privacy.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { createHash } from 'crypto';

export function sanitizePath(
  absolutePath: string,
  workspaceFolders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): string {
  try {
    // 1) Prefer workspace-relative (handles multi-root and remote)
    for (const folder of workspaceFolders) {
      const root = folder.uri.fsPath; // remote: path is the remote fs view
      if (absolutePath.startsWith(root)) {
        const rel = path.relative(root, absolutePath);
        return `<ws:${folder.name}>/${rel.replace(/\\/g, '/')}`;
      }
    }

    // 2) Replace user home portion with "~" when outside workspace
    const home = os.homedir();
    if (absolutePath.startsWith(home)) {
      return `~/${path.relative(home, absolutePath).replace(/\\/g, '/')}`;
    }

    // 3) As a last resort, hash the full absolute path (no raw segments leave the process)
    const h = createHash('sha256').update(absolutePath).digest('hex').slice(0, 12);
    return `<abs#${h}>`;
  } catch {
    // If anything goes wrong, return a coarse token
    return `<path>`;
  }
}

// Optional: strip obvious secrets/tokens from strings
export function scrubPII(s: string | undefined): string | undefined {
  if (!s) return s;
  // Drop typical tokens/emails/usernames
  const redacted = s
    // email
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '<email>')
    // bearer-like tokens
    .replace(/\b([a-z0-9_-]{20,})\b/gi, '<token>');
  return redacted.length > 2048 ? redacted.slice(0, 2048) : redacted;
}
```

**Rationale.** VS Code’s telemetry guidance: do not collect PII or raw file paths; respect `isTelemetryEnabled` and make telemetry transparent. Using workspace‑relative paths preserves utility while removing machine‑specific data; hashing is a safe fallback. ([Visual Studio Code][4])

---

### Example 3 — Event correlation for debug sessions

```ts
// telemetry/correlation.ts
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { TelemetryService } from './TelemetryService';
import { sanitizePath } from './privacy';

type SessionMeta = {
  corrId: string;
  startedAt: number;
  parentCorrId?: string;
};

const sessionMap = new Map<string, SessionMeta>();

export function installDebugCorrelation(): void {
  const t = TelemetryService.instance;

  vscode.debug.onDidStartDebugSession(session => {
    const corrId = randomUUID();
    const parent = session.parentSession ? sessionMap.get(session.parentSession.id)?.corrId : undefined;
    sessionMap.set(session.id, { corrId, startedAt: Date.now(), parentCorrId: parent });

    t.sendEvent('vscbridge.debug.session.started', {
      corrId,
      parentCorrId: parent ?? '',
      type: session.type ?? '',
      name: session.name ?? '',
      workspace: (vscode.workspace.workspaceFolders?.[0]?.name) ?? ''
    });
  });

  vscode.debug.onDidTerminateDebugSession(session => {
    const meta = sessionMap.get(session.id);
    if (!meta) return;
    const durationMs = Date.now() - meta.startedAt;

    // Collect minimal outcome information; sanitize paths or user-provided fields.
    t.sendEvent(
      'vscbridge.debug.session.completed',
      {
        corrId: meta.corrId,
        parentCorrId: meta.parentCorrId ?? ''
      },
      { durationMs }
    );

    sessionMap.delete(session.id);
  });

  // Example: capture debug console output with correlation
  vscode.debug.onDidReceiveDebugSessionCustomEvent(e => {
    const meta = sessionMap.get(e.session.id);
    if (!meta) return;

    t.sendEvent('vscbridge.debug.session.event', {
      corrId: meta.corrId,
      event: e.event,
      // If you include paths, sanitize them first:
      details: typeof e.body?.path === 'string'
        ? sanitizePath(e.body.path)
        : ''
    });
  });
}
```

**Why not rely on AI operation IDs?** `@vscode/extension-telemetry` sends **custom events**; while the low‑level SDK has `operation_Id`/parentId and W3C trace context, the wrapper doesn’t expose those controls. A consistent `corrId` custom dimension across events is simple and robust for KQL joins. (If you ever switch to the low‑level SDK or Azure Monitor OpenTelemetry, you can promote your correlation into traces.) ([GitHub][3])

---

### Example 4 — Integrating with your `StructuredError`

```ts
// errors/telemetry.ts
import { TelemetryService } from '../telemetry/TelemetryService';

export enum ErrorSeverity { Info='info', Warning='warning', Error='error', Fatal='fatal' }

export function trackStructuredError(e: StructuredError, extra?: Record<string,string>) {
  const t = TelemetryService.instance;
  // Expected operational errors -> send as error *events* (no stack)
  t.sendErrorEvent(
    'vscbridge.error',
    {
      code: e.code,
      httpStatus: String(e.httpStatus),
      severity: (e as any).severity ?? ErrorSeverity.Error,
      ...extra
    },
    undefined,
    // Explicitly drop any fields that may carry PII
    ['details', 'message', 'stack']
  );
}

export function trackUnexpectedException(e: unknown, extra?: Record<string,string>) {
  const t = TelemetryService.instance;

  if (e instanceof Error) {
    // Unexpected bugs -> send as exception (includes stack)
    t.sendException(e, extra);
  } else {
    t.sendErrorEvent('vscbridge.nonErrorThrow', { ...extra });
  }
}
```

**Pattern.** Don’t fire telemetry inside the `StructuredError` constructor (too easy to double‑report). Instead, centralize in your top‑level catch/handler and decide whether it’s expected (operational) or unexpected (bug). Use `sendTelemetryErrorEvent` for expected/handled error codes (no stack), and `sendTelemetryException` for genuine faults. ([GitHub][1])

---

### Example 5 — Graceful deactivation and flush

```ts
// extension.ts
export async function deactivate() {
  // TelemetryReporter.dispose() flushes and returns a Promise.
  // Use a timeout guard so deactivation can’t hang.
  const flush = TelemetryService.instance.dispose();
  const timeout = new Promise<void>(resolve => setTimeout(resolve, 3000));
  await Promise.race([flush, timeout]);
}
```

The wrapper documents that disposal **flushes**. Await it (with a timeout) to avoid losing the last few events. ([GitHub][1])

---

## 3) Privacy checklist for VS Code Marketplace compliance

* **Use the official wrapper** so the extension respects `vscode.env.isTelemetryEnabled` and responds to `onDidChangeTelemetryEnabled`. ([Visual Studio Code][4])
* **Document telemetry** in your README and publish a privacy notice. Consider shipping a `telemetry.json` that enumerates event names/properties; VS Code’s CLI `--telemetry` can include your extension’s events if you provide that file. ([Visual Studio Code][5])
* **Never send PII** (names, emails, tokens, full file paths, code content). Sanitize or hash. ([Visual Studio Code][4])
* **Respect enterprise policy.** Organizations can centrally enforce the telemetry level; your extension should honor it implicitly via the wrapper. ([Visual Studio Code][6])
* **Make opt‑out explicit.** Note in your README that VSC‑Bridge telemetry follows VS Code’s telemetry setting (`telemetry.telemetryLevel`). ([Visual Studio Code][7])

---

## 4) Performance & reliability guidance

* **Asynchronous by default.** `sendTelemetryEvent` et al. are non‑blocking; events are buffered/batched and sent in the background. (Low‑level defaults: `maxBatchIntervalMs = 15000`, `samplingPercentage = 100`.) Avoid synchronous work in hot paths. ([GitHub][3])
* **Don’t enable auto‑collectors** from the low‑level SDK in an extension host; the wrapper doesn’t enable any patching and that’s desirable. If you ever go low‑level, be sparing with `.setAutoCollectConsole()` etc. to avoid overhead. ([GitHub][3])
* **Sampling & rate limiting.** If you have high‑frequency events (e.g., DAP output spam), do your own client‑side sampling (e.g., 10%) and/or aggregate into periodic “snapshot” events. The SDK also supports sampling if you drop to it. ([GitHub][3])
* **Disk retry & proxies.** If your users are behind corporate proxies, the low‑level client supports proxy settings (`proxyHttpsUrl`) and disk retry caching; the wrapper relies on that stack beneath it. ([GitHub][3])
* **Flush on shutdown.** Always await `TelemetryReporter.dispose()` in `deactivate()` with a timeout guard. ([GitHub][1])

> **Note (endpoints):** In locked‑down networks, outbound HTTPS to `dc.services.visualstudio.com` and your region’s `*.in.applicationinsights.azure.com` endpoint must be allowed; these are standard egress requirements for App Insights. ([Microsoft Learn][8])

---

## 5) Event design & correlation

**Naming.** Pick a **stable, dot‑separated** schema that mirrors your domain and reads well in KQL. E.g.:

* Lifecycle: `vscbridge.extension.activated`, `vscbridge.extension.deactivated`
* Debug: `vscbridge.debug.session.started`, `.event`, `.completed`
* Commands: `vscbridge.command.run.started`, `.completed`
* Capacity: `vscbridge.capacity.snapshot`

**Dimensions vs. measurements.**
Put **strings/IDs/states** in properties; use **`measurements`** for numeric values (durationMs, queueDepth, activeSessions, etc.). The wrapper’s measurements land alongside the event in App Insights and are easy to chart. (Custom metrics can also be ingested, but for extensions, numeric measurements on events are sufficient and cheaper/simpler.) ([Azure Docs][9])

**Correlation.**
Add a `corrId` (UUID) to every related event in a debug session; include `parentCorrId` for child sessions (e.g., Python subprocess debug). This makes KQL joins trivial. If you later adopt OpenTelemetry to create true spans/traces, keep the same correlation dimension and promote it into trace context. (App Insights supports W3C trace context in the Node SDK.) ([GitHub][3])

---

## 6) Error tracking strategy

* **Operational (expected) errors** (e.g., `E_TIMEOUT`, `E_NO_SESSION`): `sendTelemetryErrorEvent("vscbridge.error", { code, ... })` with **no stack**; include severity derived from your error code (e.g., timeout=Warning, internal=Error).
* **Unexpected exceptions**: `sendTelemetryException(err, { corrId, feature: 'Debug' })` so you get stacks in **`exceptions`**.
* **Deduplication**: Report in centralized handlers (top‑level command wrapper, debug event pump). Don’t log in constructors or deep helpers. ([GitHub][1])

---

## 7) Testing & validation

* **Interface‑based:** Your services depend on `ITelemetry`. Provide an in‑memory mock:

```ts
export class InMemoryTelemetry implements ITelemetry {
  public events: any[] = [];
  sendEvent(name: string, p?: Record<string,string>, m?: Record<string,number>) { this.events.push({type:'event', name, p, m}); }
  sendErrorEvent(name: string, p?: Record<string,string>, m?: Record<string,number>, drop?: string[]) { this.events.push({type:'error', name, p, m, drop}); }
  sendException(error: Error, p?: Record<string,string>, m?: Record<string,number>) { this.events.push({type:'exception', error, p, m}); }
  isEnabled() { return true; }
  async dispose() {}
}
```

* **Separation of environments:** Use a **separate AI resource/connection string** per environment (dev/test/prod). The Node docs recommend dynamic connection strings per environment; do not mix test events into prod. ([GitHub][3])
* **Local validation without polluting prod:** Point your dev builds at a **dev** AI resource. Use VS Code’s **Developer: Show Telemetry** output and the CLI `--telemetry` report (plus an optional `telemetry.json`) to verify event shapes locally. ([Visual Studio Code][7])

---

## 8) Monitoring, KQL, and alerts (starter set)

**Usage & reliability (last 24h):**

```kusto
customEvents
| where timestamp > ago(24h)
| where name startswith "vscbridge."
| summarize count() by name
| order by count_ desc
```

**Command success rate:**

```kusto
let completed = customEvents
  | where name == "vscbridge.command.run.completed"
  | project timestamp, success = tostring(customDimensions.success);
completed
| summarize total = count(), errors = countif(success == "false")
| extend errorRatePct = todouble(errors) * 100.0 / todouble(total)
```

**Debug session duration (p95) by type:**

```kusto
customEvents
| where name == "vscbridge.debug.session.completed"
| summarize p95_durationMs = percentile(toint(todouble(customMeasurements.durationMs)), 95)
          by debugType = tostring(customDimensions.type)
| order by p95_durationMs desc
```

**Capacity snapshots (queue depth, every minute):**

```kusto
customEvents
| where name == "vscbridge.capacity.snapshot"
| summarize avgQueue=avg(todouble(customMeasurements.queueDepth)),
            p95Queue=percentile(todouble(customMeasurements.queueDepth),95)
          by bin(timestamp, 1m)
```

You can wire Alerts against these queries (Scheduled Query Alerts) to page on error spikes or capacity issues. (KQL basics and the `customEvents/customDimensions` model are documented in App Insights/Monitor docs.) ([Microsoft Learn][10])

---

## 9) Cost model & controls

* **Billing is per‑GB ingestion** through Azure Monitor Logs. Prices vary by region; commitment tiers offer discounts vs. pay‑as‑you‑go. There’s also a small monthly free allowance per billing account in the default tier. Use sampling, daily caps, and aggregation to control volume. ([Microsoft Learn][11])

**Simple estimator (pay‑as‑you‑go):**

```
monthlyGB ≈ (avgEventBytes * eventsPerMonth) / (1024^3)
estCost   ≈ monthlyGB * (regionPricePerGB)
```

Keep events lean (short names, a few dimensions, and a couple of numeric measurements). Aggregate repetitive signals into minute‑level snapshots, not per‑item spam.

---

## 10) Pitfalls & mitigations

1. **Blocking the extension host** — Don’t do sync work before sending telemetry. Calls are fire‑and‑forget; avoid awaiting anything except on shutdown. ([GitHub][1])
2. **Memory growth** — Don’t buffer your own queues; let the reporter batch. For high‑rate events, sample and aggregate. ([GitHub][3])
3. **Privacy leaks** — Never log raw file paths, code, or tokens. Use `sanitizePath`/`scrubPII`. ([Visual Studio Code][4])
4. **Telemetry storms** — Add a per‑event rate limiter and a circuit breaker that drops noisy categories temporarily.
5. **Lost data on shutdown** — Always await `dispose()` in `deactivate()` with a timeout. ([GitHub][1])
6. **Inconsistent schemas** — Centralize event names and property keys in a TypeScript enum/type; add PR checks for schema changes.
7. **Costs too high** — Enable sampling/aggregation; set daily caps in the portal if necessary; evaluate commitment tiers. ([Microsoft Learn][11])
8. **Proxy/firewall issues** — Document required endpoints (`dc.services.visualstudio.com`, regional `*.in.applicationinsights.azure.com`) for enterprise users. ([Microsoft Learn][8])

---

## 11) Integration considerations

**Development workflow.**
Default telemetry **off** in local development unless `VSCBRIDGE_TELEMETRY_IN_DEV=1`. Use a dev AI resource. Validate events with the Telemetry output channel and `--telemetry` CLI reports. ([Visual Studio Code][7])

**CI/CD.**
Store the connection string in CI secrets and bake into builds per environment (PR builds → “staging” AI, release → “prod” AI). Never hardcode prod keys into PR/test builds. The wrapper’s README confirms using the connection string directly is OK, but environment injection gives flexibility. ([GitHub][1])

**Versioning & rollouts.**
Add `common.extversion` (auto‑added by the wrapper) to every event. For schema changes, support both shapes during a transition window and record a `schemaVersion` property. Feature‑flag new telemetry to ramp gradually. ([GitHub][1])

**Remote development.**
Rely on `common.remotename`/`common.product`/`common.uikind` to segment WSL/SSH/containers/Codespaces usage; adjust path handling accordingly. ([GitHub][1])

---

## 12) Real‑world references

* **Official wrapper**: setup, send events/errors, common properties, and dispose/flush guidance. ([GitHub][1])
* **VS Code telemetry authors guide**: using the wrapper, respecting `isTelemetryEnabled`, transparency (`telemetry.json`). ([Visual Studio Code][4])
* **Node SDK config (if you need it)**: batching defaults, sampling, proxies/disk retry, and modern 3.x notes. ([GitHub][3])

---

## 13) Migration plan for an existing codebase

1. **Introduce `TelemetryService` & `ITelemetry`** (no‑op implementation initially).
2. **Instrument boundaries**: extension activation/deactivation, command start/stop, debug session start/stop, circuit breaker trips, and capacity snapshots (queue depth, workers).
3. **Add correlation**: emit `corrId` for each debug session and carry it through related events.
4. **Wire privacy hooks**: swap raw paths/messages for `sanitizePath`/`scrubPII`.
5. **Turn on dev telemetry** against a staging AI resource and validate event volumes & KQL dashboards.
6. **Flip prod** via connection string injection at release, set a daily cap, and monitor.

---

## 14) What to track (based on your requirements)

* **Lifecycle**: `extension.activated`, `extension.deactivated` (+ cold start timing).
* **Commands/scripts**: `command.run.started/completed` (durationMs, success, errorCode).
* **Debug**: `debug.session.started/event/completed` (corrId, type, durationMs, stopReason, exitCode).
* **Errors**: `vscbridge.error` (expected with code/severity) and exceptions for unexpected faults.
* **Performance/capacity**: `capacity.snapshot` every 60s with measurements `{ queueDepth, activeWorkers, pending, cpuPct? }`.
* **User interactions with debugging**: toggling breakpoints, stepping, restart/stop actions (rate‑limited, sampled).

---

## 15) Cross‑platform/remote notes

* **WSL/SSH/Containers**: you’ll get a `common.remotename` dimension (“wsl”, “ssh”, “dev-container” or “other”), which makes analysis across environments straightforward. ([GitHub][1])
* **Corporate networks**: document the egress FQDNs (`dc.services.visualstudio.com`, and regional `*.in.applicationinsights.azure.com`). If you later need low‑level config, the Node client supports proxy URLs. ([Microsoft Learn][8])

---

### Optional: low‑level knobs (only if you outgrow the wrapper)

If you ever swap to the `applicationinsights` SDK directly in the extension host (again, usually not required):

```ts
import appInsights = require('applicationinsights');
appInsights.setup(process.env.APPLICATIONINSIGHTS_CONNECTION_STRING)
  .setAutoCollectRequests(false)       // not relevant in VS Code extensions
  .setAutoCollectDependencies(false)
  .setAutoCollectConsole(false)        // be conservative in extension host
  .setSendLiveMetrics(false)
  .start();

appInsights.defaultClient.config.maxBatchIntervalMs = 15000; // default
appInsights.defaultClient.config.samplingPercentage = 100;   // default
```

Defaults shown above come from the SDK docs. ([GitHub][3])

---

## TL;DR decisions

* **Library**: `@vscode/extension-telemetry` (wrapper) → it respects VS Code settings, adds common dims, and flushes on `dispose()`. ([GitHub][1])
* **Init**: one reporter in `activate()`, push to `context.subscriptions`.
* **Privacy**: sanitize paths, scrub PII, no raw stacks in expected errors. ([Visual Studio Code][4])
* **Performance**: fire‑and‑forget; sample/aggregate chatty signals; flush on `deactivate()` with timeout. ([GitHub][1])
* **Correlation**: `corrId` per debug session (and `parentCorrId` for child sessions).
* **Cost**: keep events lean; estimate GB from event size × volume; consider commitment tiers if volume grows. ([Microsoft Learn][11])

If you want, I can fold these snippets into your existing `DebugSessionCaptureService` and add a minimal KQL workbook JSON to import into Azure.

[1]: https://github.com/microsoft/vscode-extension-telemetry "GitHub - microsoft/vscode-extension-telemetry: Node module to help VS Code extensions send telemetry using application insights"
[2]: https://learn.microsoft.com/en-us/azure/azure-monitor/app/nodejs "Monitor Node.js Applications and Services with Application Insights (Classic API) - Azure Monitor | Microsoft Learn"
[3]: https://github.com/microsoft/ApplicationInsights-node.js/ "GitHub - microsoft/ApplicationInsights-node.js: Microsoft Application Insights SDK for Node.js"
[4]: https://code.visualstudio.com/api/extension-guides/telemetry "Telemetry extension authors guide | Visual Studio Code Extension
API"
[5]: https://code.visualstudio.com/api/extension-guides/telemetry?utm_source=chatgpt.com "Telemetry extension authors guide"
[6]: https://code.visualstudio.com/docs/setup/enterprise?utm_source=chatgpt.com "Enterprise support"
[7]: https://code.visualstudio.com/docs/configure/telemetry?utm_source=chatgpt.com "Telemetry"
[8]: https://learn.microsoft.com/en-us/azure/aks/outbound-rules-control-egress?utm_source=chatgpt.com "Outbound network and FQDN rules for Azure Kubernetes ..."
[9]: https://docs.azure.cn/en-us/azure-monitor/app/api-custom-events-metrics?utm_source=chatgpt.com "Application Insights API for custom events and metrics"
[10]: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/get-started-queries?utm_source=chatgpt.com "Get started with log queries in Azure Monitor Logs"
[11]: https://learn.microsoft.com/en-us/azure/azure-monitor/logs/cost-logs?utm_source=chatgpt.com "Azure Monitor Logs cost calculations and options"
