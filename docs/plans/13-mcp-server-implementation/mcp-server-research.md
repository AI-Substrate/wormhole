Below is a production‑ready blueprint (with drop‑in TypeScript) for your **auto‑generated MCP server** using `@modelcontextprotocol/sdk`, `StdioServerTransport`, and your **.vsc-bridge** file IPC.

---

## 1) Architecture at a glance

**Runtime pieces**

* **MCP server (TypeScript, ESM)**
  Uses `McpServer` from `@modelcontextprotocol/sdk`. We dynamically **register 35+ tools** from code‑generated modules. We run over **STDIO** for local agents (Claude Desktop, Cursor, VS Code, etc.). ([GitHub][1])

* **Tool handlers → File IPC adapter**
  Every tool handler **serializes a command** into `.vsc-bridge/execute/<jobId>/command.json`, then **polls** that folder for `claimed.json`, `response.json | error.json`, and a **done** sentinel. Supports **timeout + cancellation** via the SDK’s `AbortSignal` provided to handlers. ([GitHub][2])

* **Extension side (your VS Code extension)**
  Claims jobs and executes scripts, then writes envelopes:

  ```json
  // success
  { "ok": true, "type": "success", "data": {...}, "meta": {...} }

  // failure
  { "ok": false, "type": "error", "error": { "code": "...", "message": "...", "details": {...} }, "meta": {...} }
  ```

**Build‑time pieces**

* `scripts/generate-mcp.ts` reads your **`manifest.json`** (built from YAML) and generates:

  * `toolDefinitions.gen.ts` (names, titles, descriptions, **Zod input/output schemas**)
  * `handlers.gen.ts` (strongly‑typed adapters that call the **file IPC**)
  * `registry.gen.ts` (bulk registration on server)

The SDK automatically **converts Zod to JSON Schema** for tool metadata and **validates inputs** on invocation; if you declare an `outputSchema`, the server enforces that you return `structuredContent` matching it. We lean into that. ([GitHub][2])

---

## 2) Server skeleton (STDIO) — minimal, correct, and extendable

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./registry.gen.js"; // <-- generated
import packageJson from "../package.json" assert { type: "json" };

const server = new McpServer({
  name: "vsc-bridge-mcp",
  version: packageJson.version ?? "0.0.0",
});

// Bulk-register generated tools (see §4)
registerAllTools(server);

// STDIO transport for local agents (Claude, VS Code, Cursor, etc.)
const transport = new StdioServerTransport();
await server.connect(transport);
```

The SDK documents the **STDIO transport** pattern exactly like this; it’s the canonical way to run locally. ([GitHub][1])

---

## 3) Generic tool handler that executes via **file IPC**

```ts
// src/ipc/bridge.ts
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export type BridgeCommand = {
  name: string;              // tool name
  args: Record<string, any>; // validated by Zod upstream
  meta?: Record<string, any>;
};

export type BridgeSuccess<T = unknown> = {
  ok: true;
  type: "success";
  data: T;
  meta?: Record<string, any>;
};

export type BridgeError = {
  ok: false;
  type: "error";
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: Record<string, any>;
};

export type BridgeResult<T = unknown> = BridgeSuccess<T> | BridgeError;

export type ExecuteOptions = {
  rootDir: string;              // ".vsc-bridge/execute"
  timeoutMs?: number;           // default 90_000
  pollMs?: number;              // default 120
  signal?: AbortSignal;         // from MCP RequestHandlerExtra.signal
};

async function pathExists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}

export async function executeViaBridge<TOut = unknown>(
  cmd: BridgeCommand,
  opts: ExecuteOptions,
): Promise<BridgeResult<TOut>> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const pollMs = opts.pollMs ?? 120;
  const jobId = randomUUID();
  const jobDir = join(opts.rootDir, jobId);
  const commandPath = join(jobDir, "command.json");
  const claimedPath = join(jobDir, "claimed.json");
  const responsePath = join(jobDir, "response.json");
  const errorPath = join(jobDir, "error.json");
  const donePath = join(jobDir, "done");

  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(commandPath, JSON.stringify({ id: jobId, ...cmd }, null, 2), "utf8");

  const started = Date.now();

  const abortOrTimeout = () => {
    if (opts.signal?.aborted) throw new Error("Operation cancelled");
    if (Date.now() - started > timeoutMs) throw new Error("Operation timed out");
  };

  // Poll until done sentinel; read response or error
  while (true) {
    abortOrTimeout();

    if (await pathExists(responsePath)) {
      const json = JSON.parse(await fs.readFile(responsePath, "utf8")) as BridgeSuccess<TOut>;
      return json;
    }
    if (await pathExists(errorPath)) {
      const json = JSON.parse(await fs.readFile(errorPath, "utf8")) as BridgeError;
      return json;
    }

    // Optional: wait for claimed.json to send progress logs
    if (await pathExists(claimedPath)) {
      // no-op here; you can emit MCP logging notifications from your handler (see below)
    }

    if (await pathExists(donePath)) {
      // Defensive: done without response -> treat as infra error
      return {
        ok: false,
        type: "error",
        error: { code: "NoResponse", message: "Job ended without response.json" },
      };
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}
```

**Cancellation & timeouts** tie into the MCP SDK’s handler `AbortSignal`, which is passed via the `RequestHandlerExtra` argument. You can stop polling when `signal.aborted` and surface a structured error. The SDK exposes this `signal` and a request timeout facility. ([GitHub][3])

---

## 4) Build‑time code generation (from `manifest.json`)

**Input assumption:** your build already consolidates `*.meta.yaml` → `manifest.json` with complete fields and **Zod** validation types generated (as you mentioned).

**Generator outline**

```ts
// scripts/generate-mcp.ts
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ROOT = join(__dirname, "..");

type ToolEntry = {
  name: string;             // "breakpoint_add"
  title?: string;           // optional pretty title
  description: string;
  enabled?: boolean;        // allow opt-out
  inputZodImport: string;   // e.g., "./zod/breakpoint_add.input.js"
  outputZodImport?: string; // e.g., "./zod/breakpoint_add.output.js"
  annotations?: Record<string, any>; // from mcp.llm section
};

type Manifest = { tools: ToolEntry[] };

async function run() {
  const manifest: Manifest = JSON.parse(
    await fs.readFile(join(ROOT, "manifest.json"), "utf8"),
  );

  const defLines: string[] = [
    `// AUTO-GENERATED. Do not edit.`,
    `import { z } from "zod";`,
  ];
  const handlerLines: string[] = [
    `// AUTO-GENERATED. Do not edit.`,
    `import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
    `import { executeViaBridge } from "./ipc/bridge.js";`,
  ];
  const registryLines: string[] = [
    `// AUTO-GENERATED. Do not edit.`,
    `import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`,
    `import { createHandlers } from "./handlers.gen.js";`,
    `export function registerAllTools(server: McpServer) {`,
    `  const handlers = createHandlers();`,
    `  for (const h of handlers) {`,
    `    server.registerTool(h.name, h.definition, h.callback);`,
    `  }`,
    `}`,
  ];

  const handlerEntries: string[] = [];
  for (const t of manifest.tools.filter(t => t.enabled !== false)) {
    const pascal = t.name.replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
    const inputSym = `${pascal}Input`;
    const outputSym = `${pascal}Output`;

    defLines.push(`import { ${inputSym} } from "${t.inputZodImport}";`);
    if (t.outputZodImport) {
      defLines.push(`import { ${outputSym} } from "${t.outputZodImport}";`);
    }

    handlerEntries.push(`
{
  name: "${t.name}",
  definition: {
    title: ${JSON.stringify(t.title ?? pascal)},
    description: ${JSON.stringify(t.description)},
    inputSchema: ${inputSym},
    ${t.outputZodImport ? `outputSchema: ${outputSym},` : ``}
    annotations: ${JSON.stringify(t.annotations ?? {})}
  },
  callback: async (args: unknown, extra: any) => {
    // Validate output on the extension side; here we just bridge it back
    const res = await executeViaBridge(
      { name: "${t.name}", args: args as Record<string, any> },
      { rootDir: ".vsc-bridge/execute", signal: extra?.signal }
    );

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: \`[\${res.error.code}] \${res.error.message}\` }],
        structuredContent: { error: res.error, meta: res.meta }
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
      structuredContent: res.data
    };
  }
}
    `);
  }

  await fs.writeFile(
    join(ROOT, "src", "toolDefinitions.gen.ts"),
    defLines.join("\n") + "\n",
    "utf8",
  );

  await fs.writeFile(
    join(ROOT, "src", "handlers.gen.ts"),
    handlerLines.join("\n") +
      `\nexport function createHandlers() { return [${handlerEntries.join(",")}]; }\n`,
    "utf8",
  );

  await fs.writeFile(
    join(ROOT, "src", "registry.gen.ts"),
    registryLines.join("\n") + "\n",
    "utf8",
  );
}

run().catch((e) => { console.error(e); process.exit(1); });
```

**Why this shape?**

* `server.registerTool(name, { title, description, inputSchema, outputSchema }, handler)` is the SDK’s high‑level API. It publishes **JSON Schema** to clients by **converting your Zod** via `zod-to-json-schema`, and automatically **validates inputs**. If you provide an `outputSchema`, the SDK **requires** that the handler returns `structuredContent` that matches it (and it validates it). ([GitHub][1])

* Your extra `mcp.llm` hints map to `annotations` on tools; the SDK forwards them to clients in the tool listing. ([GitHub][2])

---

## 5) YAML → MCP Tool JSON Schema rules (with example)

**Given YAML:**

```yaml
params:
  expression:
    type: string
    required: true
    description: "Expression to evaluate"
  frameId:
    type: number
    required: false
    description: "Frame ID (defaults to top frame)"
mcp:
  name: debug_evaluate
  description: "Evaluate JS in current debug context."
  llm:
    category: "debugging"
    idempotent: true
    examples:
      - "debug_evaluate expression:'2+2' frameId:0"
```

**Generated Zod (consumed by `registerTool`)**:

```ts
// src/zod/debug_evaluate.input.ts
import { z } from "zod";
export const DebugEvaluateInput = z.object({
  expression: z.string().describe("Expression to evaluate"),
  frameId: z.number().describe("Frame ID (defaults to top frame)").optional(),
}).strict();
```

**What the SDK exposes to clients**
The SDK converts this Zod to **JSON Schema** automatically when tools are listed. ([GitHub][2])
MCP spec requires a **name**, **description**, and **inputSchema** (JSON Schema), with optional **annotations** for behavior hints. ([Model Context Protocol][4])

> Notes:
>
> * **Enums** → `z.enum(["a","b"])`
> * **Union** → `z.union([A, B])` or `z.discriminatedUnion("kind", [...])`
> * **Defaults** → `z.string().default("x")` (be sure your extension honors defaults when building the `command.json`)
> * **Arrays** → `z.array(z.object({...}))`
> * **Objects** → `.strict()` to avoid surprise fields
> * **Descriptions** → `.describe("...")` (propagates into JSON Schema)
> * If you define `outputSchema`, **return `structuredContent`** that matches it; otherwise the SDK throws. ([GitHub][2])

---

## 6) Concrete handler pattern (tying **AbortSignal** & progress)

```ts
// Example inside handlers.gen.ts callback body
return {
  // Use SDK logging notifications (shows in capable clients)
  // If you prefer, call extra.server.sendLoggingMessage(...) when you
  // hold a reference to the McpServer; see the "Everything" example server.
  // (We keep this minimal in generated code.)

  ...(await (async () => {
    const res = await executeViaBridge({ name: "long_task", args }, { rootDir: ".vsc-bridge/execute", signal: extra?.signal, timeoutMs: 180_000 });

    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `[${res.error.code}] ${res.error.message}` }],
        structuredContent: { error: res.error }
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
      structuredContent: res.data
    };
  })())
};
```

The SDK passes a **`RequestHandlerExtra`** object into tool callbacks; it includes the `signal` plus request utilities. You can also use the low‑level `Server` to send logging messages; see an “everything server” example that invokes `sendLoggingMessage`. ([GitHub][2])

---

## 7) LLM‑friendly metadata that works in practice

Add these under your `mcp.llm` in YAML → map to `annotations`:

* `category`: `"debugging" | "build" | "test" | ..."`
* `idempotent`: boolean
* `destructive`: boolean
* `prerequisites`: `["debugger_attach", ...]`
* `latency_ms_estimate`: number
* `cost_level`: `"low" | "medium" | "high"`
* `examples`: short strings showing parameterized invocations
* `returns`: human summary of `structuredContent` shape
* `workflow`: short instructions like *“call `breakpoint_add` then `debug_continue`”*

The spec’s “Tools” guidance recommends **clear names**, **detailed schemas**, **examples**, **error handling**, **timeouts**, and **progress reporting**—exactly what the above drives. ([Model Context Protocol][5])

---

## 8) Error normalization (actionable for agents)

Normalize all failures from the bridge into **MCP tool errors**:

```ts
// If bridge returns { ok:false, error:{ code, message, details } }
return {
  isError: true,
  content: [{ type: "text", text: `[${code}] ${message}` }],
  structuredContent: {
    error: { code, message, details },
    hint: "Try `debugger_attach` first or pass a valid frameId"
  }
};
```

The SDK enforces output validation; if you specify `outputSchema` you **must** return `structuredContent` that conforms or the call fails server‑side. ([GitHub][2])

---

## 9) Testing & validation

**Unit (Jest/Vitest)**

* Mock the bridge folder with a temp dir; write `response.json` after a small delay and assert the handler returns `structuredContent`.
* Write `error.json` to assert error mapping.
* Abort via `AbortController.abort()` to verify cancellation.

**Schema validation**

* Since you hand the SDK Zod, **the SDK validates arguments** on every call and converts to JSON Schema for clients. That means your **tool listing** will always be in‑sync with runtime validation. ([GitHub][2])

**Integration**

* Use the SDK’s client with **`StdioClientTransport`** to `listTools` and `callTool` end‑to‑end. The README shows this pattern. ([GitHub][1])

**Manual**

* Try the **MCP Inspector** (CLI) to connect and call tools. The README references how to run it. ([GitHub][1])

---

## 10) Common pitfalls & mitigations

* **Not returning `structuredContent` when `outputSchema` is set** → SDK will throw. Always return it (we do in generated code). ([GitHub][2])
* **Ambiguous tool names** → enforce `snake_case thing_action` (`breakpoint_add`), add `title` for UI discoverability. ([Model Context Protocol][5])
* **Large unions / nested types** → prefer `discriminatedUnion("type", [...])` so LLMs can select branches more reliably.
* **Timeouts & hangs** → default 90s; reset or lengthen per tool via annotations and handler options; the SDK also has request timeouts. ([GitHub][3])
* **IPC crashes** → if `done` appears with no `response.json`, return a normalized infrastructure error and surface a recovery hint.
* **Hot reload** → generate files on `prebuild` and in `watch` mode; import from `dist` with ESM.

---

## 11) Distribution & agent configs

**Claude Desktop / local agents (STDIO)**: spawn `node dist/server.js`. The SDK doc shows the stdio server connect pattern and is the recommended approach for local integrations. ([GitHub][1])

---

## 12) End‑to‑end example: add two tools

**YAML (short)**

```yaml
# breakpoint_add.meta.yaml
mcp:
  name: breakpoint_add
  description: "Create a breakpoint at file:line (optionally condition)."
  llm:
    category: debugging
    idempotent: true
params:
  file: { type: string, required: true, description: "Absolute or workspace-relative path" }
  line: { type: integer, required: true, description: "1-based line number" }
  condition: { type: string, required: false, description: "Optional condition" }

# debug_evaluate.meta.yaml (as above)
```

**Generated Zod**

```ts
// src/zod/breakpoint_add.input.ts
import { z } from "zod";
export const BreakpointAddInput = z.object({
  file: z.string().describe("Absolute or workspace-relative path"),
  line: z.number().int().describe("1-based line number"),
  condition: z.string().describe("Optional condition").optional(),
}).strict();
```

**Generated tool registration (excerpt)**

```ts
// src/handlers.gen.ts (excerpt)
{
  name: "breakpoint_add",
  definition: {
    title: "Breakpoint Add",
    description: "Create a breakpoint at file:line (optionally condition).",
    inputSchema: BreakpointAddInput,
    annotations: { category: "debugging", idempotent: true }
  },
  callback: async (args, extra) => {
    const res = await executeViaBridge(
      { name: "breakpoint_add", args: args as any },
      { rootDir: ".vsc-bridge/execute", signal: extra?.signal, timeoutMs: 30_000 }
    );
    if (!res.ok) {
      return {
        isError: true,
        content: [{ type: "text", text: `[${res.error.code}] ${res.error.message}` }],
        structuredContent: { error: res.error }
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(res.data) }],
      structuredContent: res.data
    };
  }
}
```

**Server entry (unchanged)**

```ts
// src/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./registry.gen.js";

const server = new McpServer({ name: "vsc-bridge-mcp", version: "1.0.0" });
registerAllTools(server);
await server.connect(new StdioServerTransport());
```

This follows the SDK’s stdio example and `registerTool` shape. ([GitHub][1])

---

## 13) Schema & mapping checklist (use this for your generator)

* **Required vs optional**: map `required: true|false` → Zod presence and `.optional()`
* **Numbers**: `integer` → `.int()`, include `min`, `max` if present
* **Defaults**: map to `.default(value)`; also materialize defaults into the **bridge** `command.json` if missing
* **Enums**: `z.enum([...])`
* **Unions**: prefer `z.discriminatedUnion("type", [...])` where possible
* **Descriptions**: `.describe()` for every field → becomes JSON Schema description
* **Examples**: keep in `annotations.examples` (portable; many clients surface these in UI/tooltips)
* **Strict objects**: `.strict()` to prevent silent extra args

---

## 14) Validation that you’re aligned with the SDK

Key behaviors we leveraged straight from the SDK:

* **STDIO transport** for local server processes. ([GitHub][1])
* **`registerTool` with Zod `inputSchema` / `outputSchema`** (SDK converts to JSON Schema and validates both input and output; enforces `structuredContent` when output is declared). ([GitHub][1])
* **Handler extra** includes cancellation via `AbortSignal` and request parameters. Use it to stop polling. ([GitHub][3])
* **Tool spec** requires name/description/schema and supports **annotations** for richer guidance. ([Model Context Protocol][4])

---

## 15) Recommended next steps (practical)

1. Wire your current `manifest.json` into the generator above; mark a few tools `enabled: false` to test exclusion.
2. Port two or three real scripts to the **.vsc-bridge** flow and validate success/error envelopes.
3. Run **MCP Inspector** and **a Stdio client** integration test to exercise `listTools` and `callTool`. ([GitHub][1])
4. Add `annotations` in YAML for **idempotent**, **destructive**, **examples**, **workflows**.
5. Add per‑tool **timeouts** and return **actionable errors** (with hints).

---

### Sources

* Official TypeScript SDK README: `McpServer`, `registerTool`, **STDIO** usage, client examples. ([GitHub][1])
* SDK implementation showing **Zod → JSON Schema**, input validation, and the **requirement to return `structuredContent`** when `outputSchema` is provided. ([GitHub][2])
* MCP “Tools” documentation & best practices (names, detailed schemas, examples, progress, timeouts). ([Model Context Protocol][5])
* `RequestHandlerExtra` / request control (timeouts, progress, **AbortSignal**). ([GitHub][3])
* Example server showing logging notifications usage (`sendLoggingMessage`) and low‑level patterns. ([Glama – MCP Hosting Platform][6])

If you want, I can adapt the generator to your **exact** `manifest.json` shape and hand you the ready‑to‑run repo structure.

[1]: https://github.com/modelcontextprotocol/typescript-sdk "GitHub - modelcontextprotocol/typescript-sdk: The official TypeScript SDK for Model Context Protocol servers and clients"
[2]: https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/src/server/mcp.ts "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/refs/heads/main/src/shared/protocol.ts?utm_source=chatgpt.com "https://raw.githubusercontent.com/modelcontextprot..."
[4]: https://modelcontextprotocol.io/specification/2025-03-26/server/tools?utm_source=chatgpt.com "Tools"
[5]: https://modelcontextprotocol.io/docs/concepts/tools?utm_source=chatgpt.com "Tools"
[6]: https://glama.ai/mcp/servers/%40modelcontextprotocol/github/blob/117c1c45362ab6505f0736335daeaff94c0215d2/src/everything/everything.ts?utm_source=chatgpt.com "GitHub MCP Server"
