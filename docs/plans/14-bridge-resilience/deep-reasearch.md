Below is a concrete, drop‑in path to make your filesystem queue resilient, fast, and self‑healing, with TypeScript examples you can paste into your codebase.

---

## A. Executive summary (what to fix first)

1. **Eliminate the claim‑file overwrite race.** Your `startLeaseRenewer()` rewrites `claimed.json` via temp+rename on each heartbeat; if recovery unlinks and a new claim attempt re‑claims, the old job can still overwrite the new claim on its next renewal. Move to **immutable claim file + separate heartbeat** (touch/utimes on a `lease.touch` file) and never overwrite `claimed.json` once created. 

2. **Adopt concurrent job execution with backpressure** instead of single‑file processing. Process N jobs concurrently, bound queue depth, and **delay claiming** when saturated (don't claim a job you can't start). This removes the single‑thread bottleneck and prevents cascading failures.

3. **Add a fencing token** to each claim and ensure late/stale job execution won't write results. Include the token in `response.json` (and in every side effect) and ignore any completion whose token < current token. This is the standard defense against lease expiry, GC pauses, and slow filesystems. ([Martin Kleppmann's Website][1])

4. **Hybrid watch + scan, with dedupe and jitter.** Keep your watcher, but add a fast periodic scan (100–250 ms on native, 250–400 ms on WSL) that only inspects directories updated since last tick. Debounce duplicate events for 50 ms. This cures missed events and ordering issues seen on WSL/inotify. ([Node.js][2])

5. **Harden EventWriter.** Always attach an `'error'` handler, respect backpressure (`'drain'`), and guarantee close on all paths. Your current implementation swallows write errors, which can mask stuck jobs and leaks. ([Node.js][3])  

6. **Recovery becomes cooperative first, forceful second.** Before reclaiming, write `revoke.json`, wait a short grace period (e.g., 5 s), then reclaim if the heartbeat hasn’t moved. Quarantine unrecoverable jobs into a **DLQ** folder. Use exponential backoff and a **per‑script circuit breaker** to stop retry storms. ([RabbitMQ][4])

7. **Durability/atomicity hygiene.** Keep using write‑temp+rename on the **same directory** (atomic on POSIX/NTFS when staying on the same filesystem), and avoid cross‑filesystem renames. After critical renames, fsync the directory (best effort). Use `O_CREAT|O_EXCL` only for *creation* (locking), not for periodic updates. ([pubs.opengroup.org][5])

---

## B. Target architecture

### Directory layout (unchanged for clients; new files are additive)

```
.vsc-bridge/
  execute/
    <jobId>/
      command.json          # written by client
      claimed.json          # immutable after creation (includes fencingToken)
      lease.touch           # heartbeat file (mtime is the lease)
      events.ndjson
      response.json | error.json
      done                  # completion marker
      revoke.json?          # recovery handshake (optional)
      keep?                 # opt-out from GC
```

### State machine

```
UNCLAIMED  --claim-->  CLAIMED  --start-->  PROCESSING  --complete--> DONE
     ^                        \--cancel-->  CANCELLED
     |----(recovery)---------^
     |--(revoke handshake)--> REVOKE_REQUESTED --(no heartbeat)--> RECLAIM
```

* **Claim = create `claimed.json` with O_EXCL** (unique fencing token), then **create `lease.touch`** and start heartbeating by `utimes` only. Do **not** rewrite `claimed.json` ever.
* **Fencing token** increments on each (re)claim and is included in all job writes (`response.json` has `meta.fencingToken`).
* **Recovery** treats a job as stale if `now - mtime(lease.touch) > leaseMs + graceMs` and `done` is absent.

### High‑level flow (pseudocode)

```ts
onWatcherEvent(jobDir):
  enqueueCandidate(jobDir)

schedulerTick():
  // Prefer not to claim when we're over capacity
  while (jobSlots.available() > 0 && candidates.nonEmpty()):
    jobDir = pickNext(candidates) // e.g., by priority, then oldest jobId
    if (jobSlots.isSaturated()) break
    if (tryClaim(jobDir)): jobSlots.start(process(jobDir))
```

---

## C. Key code examples

> Notes:
>
> * All examples are TypeScript, Node 18+.
> * They are designed to drop into your current modules with minimal surface change.

### 1) **Safe claim + heartbeat (no more overwrite races)**

Replace your renewal logic with immutable claims + heartbeat touch. (Today, `startLeaseRenewer()` rewrites `claimed.json` via atomic rename, which can clobber a new owner. )

```ts
// fs-bridge/processor.claim.ts (new helper)
import * as fs from 'fs';
import * as path from 'path';
import { promises as fsp } from 'fs';

export interface ClaimInfo {
  fencingToken: number;
  bridgeId: string;
  pid: number;
  claimedAt: string;
  leaseMs: number;
}

export async function claimJobAtomicWithToken(
  jobDir: string,
  bridgeId: string,
  token: number,
  leaseMs = 60_000
): Promise<ClaimInfo | null> {
  const claimedPath = path.join(jobDir, 'claimed.json');
  try {
    const fd = fs.openSync(claimedPath, 'wx'); // create once
    const claim: ClaimInfo = {
      fencingToken: token,
      bridgeId,
      pid: process.pid,
      claimedAt: new Date().toISOString(),
      leaseMs
    };
    fs.writeFileSync(fd, JSON.stringify(claim, null, 2));
    if (process.platform !== 'win32') fs.fsyncSync(fd);
    fs.closeSync(fd);

    // create heartbeat file once
    const hb = path.join(jobDir, 'lease.touch');
    await fsp.writeFile(hb, '');
    // ensure mtime is "now"
    const now = new Date();
    await fsp.utimes(hb, now, now);

    // fsync directory best-effort
    if (process.platform !== 'win32') {
      try {
        const dirfd = fs.openSync(jobDir, 'r');
        fs.fsyncSync(dirfd);
        fs.closeSync(dirfd);
      } catch {}
    }

    return claim;
  } catch (err: any) {
    if (err.code === 'EEXIST') return null; // already claimed
    throw err;
  }
}

// Heartbeat uses utimes (no rewrite of claimed.json)
export function startHeartbeat(jobDir: string, periodMs = 15_000) {
  const hb = path.join(jobDir, 'lease.touch');
  let timer = setInterval(async () => {
    try {
      const now = new Date();
      await fsp.utimes(hb, now, now);
    } catch {}
  }, periodMs);

  return { stop() { clearInterval(timer); } };
}
```

Update recovery to use `mtime(lease.touch)` as the source of truth instead of parsing/rewriting `claimed.json`. This avoids TOCTTOU on the claim file and removes the overwrite race. Atomic `O_EXCL` creation is the standard lockfile pattern; Git does the same (`*.lock` + rename). ([Git][6])

### 2) **Job execution pool with backpressure and cooperative scheduling**

```ts
// fs-bridge/pool.ts
export class JobExecutionPool<T> {
  private inFlight = 0;
  private readonly queue: Array<() => Promise<void>> = [];
  constructor(private readonly max: number, private readonly maxQueued = 1000) {}

  get capacity() { return Math.max(this.max - this.inFlight, 0); }
  get depth() { return this.queue.length + this.inFlight; }
  isSaturated() { return this.depth >= this.maxQueued; }

  async run(task: () => Promise<T>): Promise<void> {
    if (this.isSaturated()) return Promise.reject(new Error('E_BACKPRESSURE'));
    return new Promise((resolve, reject) => {
      const wrapped = async () => {
        this.inFlight++;
        try { await task(); resolve(); }
        catch (e) { reject(e); }
        finally {
          this.inFlight--;
          this.drain();
        }
      };
      this.queue.push(wrapped);
      this.drain();
    });
  }

  private drain() {
    while (this.inFlight < this.max && this.queue.length) {
      const t = this.queue.shift()!;
      void t();
    }
  }
}
```

Use it in your watcher path to **delay claiming** until an execution slot is available:

```ts
// in BridgeManager.setupWatcherWithProcessor(...)
const pool = new JobExecutionPool<void>(/* concurrency */ 4, /* maxQueued */ 500);

const scheduleCandidate = (jobDir: string) => {
  candidates.add(jobDir);  // Set<string>
  schedule();              // debounce ~20ms
};

const schedule = debounce(async () => {
  // pick jobs by priority / age BEFORE claiming
  const next = pickNextJobs(candidates, pool.capacity);
  for (const jobDir of next) {
    if (pool.isSaturated()) break;
    await pool.run(async () => {
      // try to claim here (not inside watcher)
      const token = await nextFencingToken(jobDir); // monotonic per job
      const claim = await claimJobAtomicWithToken(jobDir, bridge.bridgeId, token);
      if (!claim) return; // lost race
      try { await processCommandWithFencing(jobDir, claim.fencingToken, executor); }
      finally { /* nothing: processor writes done */ }
    });
    candidates.delete(jobDir);
  }
}, 20);
```

### 3) **Fencing-aware processing** (ignore stale completions)

```ts
// fs-bridge/processor.fenced.ts
import * as path from 'path';
import { promises as fsp } from 'fs';
import { EventWriter, createSuccessEnvelope, createErrorEnvelope, writeResponse, writeDone } from './processor'; // reuse your helpers
import { startHeartbeat } from './processor.claim';

export async function processCommandWithFencing(
  jobDir: string,
  fencingToken: number,
  executor: (cmd: any, writer: EventWriter, signal: AbortSignal) => Promise<any>
) {
  const start = Date.now();
  const command = JSON.parse(await fsp.readFile(path.join(jobDir, 'command.json'), 'utf8'));
  const events = new EventWriter(path.join(jobDir, 'events.ndjson')).attachDefaultHandlers();
  const hb = startHeartbeat(jobDir);

  const controller = new AbortController();
  const onRevokeCheck = setInterval(async () => {
    if (await hasRevocation(jobDir)) { controller.abort(); }
  }, 200);

  try {
    const result = await executor(command, events, controller.signal);
    // before writing response, re-check we’re still the owner
    const current = await readFencingToken(path.join(jobDir, 'claimed.json'));
    if (current !== fencingToken) {
      events.writeWarning(`Stale job execution (token ${fencingToken} < ${current}); dropping result`);
      return; // don’t write anything
    }
    const envelope = createSuccessEnvelope(result, command.id, start);
    envelope.meta.operation = command.scriptName;
    (envelope.meta as any).fencingToken = fencingToken;
    await writeResponse(jobDir, envelope);
  } catch (err: any) {
    const envelope = createErrorEnvelope('E_INTERNAL', err?.message ?? 'Unknown error', command.id, start, { err: String(err) });
    (envelope.meta as any).fencingToken = fencingToken;
    await writeResponse(jobDir, envelope);
  } finally {
    clearInterval(onRevokeCheck);
    hb.stop();
    await events.close();
    await writeDone(jobDir);
  }
}

async function readFencingToken(claimedPath: string): Promise<number> {
  const c = JSON.parse(await fsp.readFile(claimedPath, 'utf8'));
  return c.fencingToken as number;
}
async function hasRevocation(jobDir: string): Promise<boolean> {
  try { await fsp.access(path.join(jobDir, 'revoke.json')); return true; } catch { return false; }
}
```

**Why?** Even with leases, a paused/slow job execution can outlive its lease and finish later; fencing tokens ensure its outputs are ignored. This is the widely recommended approach in distributed systems (see Kleppmann). ([Martin Kleppmann's Website][1])

### 4) **EventWriter that can’t wedge**

Your current `EventWriter` swallows write errors; add error handling and backpressure (drain). Also expose a helper to attach default handlers. ([Node.js][3])  

```ts
// fs-bridge/processor.events.ts
import * as fs from 'fs';

export class EventWriter {
  private seq = 0;
  private stream: fs.WriteStream | null = null;
  private closed = false;
  private lastError: Error | null = null;

  constructor(private eventPath: string) {}

  attachDefaultHandlers() {
    const s = this.ensureStream();
    s.on('error', (e) => { this.lastError = e; this.closed = true; });
    return this;
  }

  private ensureStream(): fs.WriteStream {
    if (!this.stream && !this.closed) {
      this.stream = fs.createWriteStream(this.eventPath, { flags: 'a' });
    }
    if (!this.stream) throw new Error('Event stream is closed');
    return this.stream;
    }

  private async writeLine(line: string): Promise<void> {
    const s = this.ensureStream();
    if (!s.write(line)) {
      await new Promise<void>(resolve => s.once('drain', resolve)); // backpressure
    }
  }

  async writeEvent(type: 'progress'|'log'|'warn'|'error', data: any): Promise<void> {
    if (this.closed) return;
    if (this.lastError) throw this.lastError;
    const evt = { ts: Date.now(), seq: this.seq++, type, ...data };
    await this.writeLine(JSON.stringify(evt) + '\n');
  }

  writeLog(level: 'debug'|'info'|'warn'|'error', text: string, data?: any) {
    return this.writeEvent('log', { level, text, data }).catch(() => {});
  }
  writeWarning(text: string) { return this.writeEvent('warn', { text }).catch(() => {}); }
  writeError(text: string, data?: any) { return this.writeEvent('error', { text, data }).catch(() => {}); }

  close(): Promise<void> {
    this.closed = true;
    return new Promise((resolve) => {
      if (this.stream) { this.stream.once('finish', resolve); this.stream.end(); }
      else resolve();
    });
  }
}
```

### 5) **Circuit breaker per scriptName**

```ts
// fs-bridge/circuit.ts
export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  constructor(
    private readonly threshold = 5,      // N failures in window
    private readonly cooldownMs = 30_000 // open interval
  ) {}
  canPass() { return !(this.isOpen()); }
  recordSuccess() { this.failures = 0; }
  recordFailure() { this.failures++; if (this.failures >= this.threshold) { this.openedAt = Date.now(); } }
  private isOpen() {
    if (this.failures < this.threshold) return false;
    if (Date.now() - this.openedAt > this.cooldownMs) { this.failures = 0; return false; }
    return true;
  }
}
```

Wire this in `BridgeManager` before claiming a job of that `scriptName`. On open, **fail fast** with an `error.json` and move the job to DLQ (simply write a `dlq` file and let GC keep it).

### 6) **Robust NDJSON tailing (client or internal tools)**

```ts
// robust-tail.ts: handle partial lines
import * as fs from 'fs';
export function tailNdjson(file: string, onEvent: (e: any) => void) {
  let buf = '';
  const stream = fs.createReadStream(file, { encoding: 'utf8' });
  stream.on('data', (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      if (line.trim().length) { try { onEvent(JSON.parse(line)); } catch {} }
    }
  });
  stream.on('error', () => {/* tolerate file rotation */});
  return () => stream.close();
}
```

---

## D. Recovery, retries, DLQ

* **Stale detection:** `stale = !exists(done) && (now - mtime(lease.touch) > leaseMs + graceMs)`. Prefer mtime over parsing JSON. (Inotify queues can overflow; robust systems must treat watchers as hints, not truth. ([man7.org][7]))
* **Cooperative revoke:** write `revoke.json { by, at }`, wait 5 s, then reclaim if heartbeat doesn’t move.
* **Retries:** write `retries.json { count }` and use **exponential backoff** (e.g., `2^attempt * baseDelay`) for transient errors; move to **DLQ** after `maxRetries`. ([Celery Docs][8])
* **DLQ:** `execute/<jobId>/dlq` marker (+ reason). Your `cleaner.ts` already honors `keep`; treat DLQ the same so jobs remain for inspection. (RabbitMQ formalizes this as DLX; pattern applies. ([RabbitMQ][4]))

---

## E. Concurrency, backpressure, and scheduling

* **Don’t claim on watch callback.** Push to `candidates` and let the scheduler pick by priority and capacity; this avoids racing many concurrent claim attempts when N new jobs arrive at once.
* **Pool sizing:** start with 2–4 concurrent jobs (IO‑bound tasks like adapter calls usually tolerate 4–8). Add per‑script concurrency limits if needed.
* **Backpressure policy:** If `pool.depth > maxQueued`, do not claim new jobs; let them remain UNCLAIMED. The client sees “queued” via absence of `claimed.json`.
* **Priorities:** Add `priority?: number` to `CommandJson` (higher = earlier). The scheduler always sorts `candidates` by `(priority desc, jobId asc)` before claiming.

> Reference patterns from message queues
>
> * Lock/heartbeat & **stalled job** recycling are the norm in BullMQ/Bee‑Queue; renewal failures put jobs back to waiting or fail them, not block the queue. ([BullMQ][9])
> * Consumer-group style partitioning (Kafka) is the gold standard for distributing work while preserving ordering per key; your single‑host variant can mimic this with "N buckets" (directories) and one job execution slot per bucket if you ever need strict per‑key ordering. ([Confluent Documentation][10])

---

## F. File‑system correctness notes (why this works)

* **Atomic rename**: atomic only *within the same filesystem*; never rely on it across volumes. Keep your temp files in the same directory as the destination (you already do). ([pubs.opengroup.org][5])
* **O_EXCL + O_CREAT** on `claimed.json` guarantees only one winner for the initial claim. Use it only for the first write; later “heartbeats” use `utimes` on `lease.touch`. ([pubs.opengroup.org][11])
* **Watchers are lossy**: `fs.watch`/inotify can miss or coalesce events (especially on WSL and network filesystems). Always combine with scanning. ([Node.js][2])
* **Handle stream backpressure**; if `write()` returns false, wait for `'drain'`. ([Node.js][3])

---

## G. Concrete refactoring steps (highest impact first)

1. **Fix lease renewal race**

   * Introduce `lease.touch`, modify renewal to `utimes` (no claim rewrite).
   * Change `isJobStale()` to use `mtime(lease.touch)`; stop updating `claimed.json` in the renewer. 

2. **Add fencing tokens**

   * On claim, compute `fencingToken = previousToken + 1` (store next to `claimed.json` in a `token.seq` file or derive from job‑local monotonic counter).
   * Include `meta.fencingToken` in responses; processor re‑reads `claimed.json` before writing and drops stale results. ([Martin Kleppmann's Website][1])

3. **Replace immediate claim-in-watcher with scheduler + pool**

   * Buffer URIs from watcher; periodically pick jobs according to capacity/priority; then claim.
   * Add backpressure policy (do not claim when saturated).

4. **EventWriter hardening**

   * Attach `'error'` handler, handle `'drain'`, surface errors, and always close. ([Node.js][3])

5. **Recovery overhaul**

   * Cooperative revoke step (write `revoke.json`, wait 5 s), then reclaim.
   * Quarantine perma‑failures (DLQ marker) and prevent reprocessing loops with a **circuit breaker** per `scriptName`.

6. **Hybrid watch + fast scan**

   * Keep your 2 s safety scan for belt‑and‑suspenders, but add a light 100–250 ms scanner that only lists dirs and checks for `command.json` without `claimed.json`/`done`.
   * On WSL, use a slightly larger period (250–400 ms). ([Stack Overflow][12])

7. **Durability edges**

   * After writing `claimed.json` initially, fsync file and directory (best effort). Continue using temp+rename for `response.json` and `error.json`. ([pubs.opengroup.org][5])

8. **Observability**

   * Emit health metrics: queue depth, concurrency, claims/sec, retries, DLQ size, stale recoveries, watcher misses. Expose them via a `bridge.stats.json` side file and a `vscode` status bar.

---

## H. Testing strategy (to catch races and platform quirks)

1. **Race injection**

   * Simulate two claimers: while A is renewing, delete `claimed.json` and have B try to reclaim; assert A cannot overwrite B (the new heartbeat design guarantees this).
   * Simulate `revoke.json` mid‑job; assert processor aborts via `AbortController` and doesn’t write result.

2. **Watcher loss**

   * Flood create/rename bursts (hundreds of rapid jobs); randomly drop watch callbacks in tests; assert the fast scanner picks up all unclaimed jobs. (inotify queues *do* overflow). ([man7.org][7])

3. **Crash/restart**

   * Kill the extension process mid‑job (SIGKILL); assert recovery reclaims after lease expiry and fencing prevents duplicate writes.

4. **WSL regime**

   * Run the suite under WSL and on Windows native; specifically exercise watcher behavior and scan cadence. Known caveats exist on WSL/9P. ([Stack Overflow][12])

5. **Throughput & backpressure**

   * Load test to 10× normal job rate; assert queue depth caps, no starvation, and latency SLA.

6. **Filesystem semantics**

   * Verify atomic rename invariants: temp and final path in the **same directory**; cross‑volume rename should be rejected in tests. ([pubs.opengroup.org][5])

---

## I. Migration plan (no wire‑format break)

* **No client changes**: `command.json`, `response.json`, `done` remain the observable contract.
* **Additive metadata**: new `lease.touch`, `revoke.json`, and `meta.fencingToken` in responses are internal; clients can ignore them.
* **Rolling upgrade**: ship the bridge with hybrid scan enabled and cooperative revoke. On activation:

  1. Continue your existing “clean pending jobs” step (you already have it). 
  2. New claims create `lease.touch` and stop rewriting `claimed.json`.
  3. Recovery starts honoring `lease.touch` mtime and fencing tokens.
* **Backout**: if needed, you can delete `lease.touch` and fall back to the old behavior; keep the safety scan.

---

## J. Additional notes & pitfalls to avoid

**Filesystem pitfalls**

* Don’t assume rename across filesystems is atomic; keep temp files in the destination directory. ([pubs.opengroup.org][5])
* Always fsync directories after critical renames (best effort).
* Use `O_EXCL|O_CREAT` only for the *first* claim, not for heartbeats. ([pubs.opengroup.org][11])

**Concurrency pitfalls**

* Avoid “check‑then‑act” between read & write for ownership; prefer immutable claims + fencing.
* Always handle stream `'error'` and backpressure (`'drain'`). ([Node.js][3])

**Recovery pitfalls**

* Don't steal from a live job execution without fencing; late writes will corrupt state. Use revoke+grace and fencing tokens. ([Martin Kleppmann's Website][1])
* Implement retry backoff and cap attempts before DLQ to avoid storms. ([Celery Docs][8])

**Watcher pitfalls**

* Expect missed/duplicated events; dedupe and scan. WSL/windows-9P and inotify can drop events under load. ([man7.org][7])

---

## K. Appendix: small, surgical changes in your repo

*Where this intersects your current codebase (file paths from the repo you shared):*

* `processor.ts`: stop rewriting `claimed.json` in `startLeaseRenewer`; replace with `lease.touch` heartbeat as shown above. Also attach an `'error'` handler to `EventWriter` and wait for `'drain'` on backpressure. 
* `recovery.ts`: modify `isJobStale()` to use `mtime(lease.touch)` + grace and add the cooperative revoke/write‑then‑wait before reclaim. Quarantine unrecoverable jobs by creating a `dlq` marker in the job dir. 
* `index.ts` (`BridgeManager`): insert the worker pool and **move claim attempts out of the watcher callback**. Watcher enqueues candidates; scheduler claims when capacity is available. Keep the existing 2 s sweep, but add a faster (100–250 ms) light scan. 
* `io.ts`: keep using temp+rename + directory fsync (you already do this correctly). 

---

## References (design patterns you asked to “investigate”)

* **Atomicity & locks**: POSIX `rename()` (atomic same‑FS), `open(O_EXCL|O_CREAT)` for lockfiles; Git uses `*.lock` + rename. ([pubs.opengroup.org][5])
* **Spoolers**: CUPS uses control/data files in a spool directory—simple, proven queue semantics on FS. ([CUPS][13])
* **Queues**: BullMQ/Bee‑Queue “stalled job” detection via lock renewal; listen for stalled and recycle/fail. ([BullMQ][9])
* **Retries/DLQ**: Celery exponential backoff; RabbitMQ DLX / DLQ patterns. ([Celery Docs][8])
* **Consumer groups**: Kafka model for distributing partitions (inspires job execution buckets). ([Confluent Documentation][10])
* **Watcher caveats**: Node `fs.watch` caveats & inotify overflow; WSL limitations. ([Node.js][2])
* **Fencing tokens**: recommended solution to stale lock holders. ([Martin Kleppmann's Website][1])

---

If you'd like, I can turn this into two PRs: (1) **heartbeat/fencing + recovery** and (2) **concurrent job execution + scheduler + backpressure**, leaving the wire protocol intact for CLI/MCP clients.

[1]: https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html?utm_source=chatgpt.com "How to do distributed locking"
[2]: https://nodejs.org/api/fs.html?utm_source=chatgpt.com "File system | Node.js v24.10.0 Documentation"
[3]: https://nodejs.org/api/stream.html?utm_source=chatgpt.com "Stream | Node.js v24.10.0 Documentation"
[4]: https://www.rabbitmq.com/docs/dlx?utm_source=chatgpt.com "Dead Letter Exchanges"
[5]: https://pubs.opengroup.org/onlinepubs/000095399/functions/rename.html?utm_source=chatgpt.com "rename"
[6]: https://git-scm.com/docs/api-lockfile?utm_source=chatgpt.com "api-lockfile Documentation"
[7]: https://man7.org/linux/man-pages/man7/inotify.7.html?utm_source=chatgpt.com "inotify(7) - Linux manual page"
[8]: https://docs.celeryq.dev/en/stable/userguide/tasks.html?utm_source=chatgpt.com "Tasks — Celery 5.5.3 documentation"
[9]: https://docs.bullmq.io/guide/workers/stalled-jobs?utm_source=chatgpt.com "Stalled Jobs"
[10]: https://docs.confluent.io/platform/current/clients/consumer.html?utm_source=chatgpt.com "Kafka Consumer for Confluent Platform"
[11]: https://pubs.opengroup.org/onlinepubs/007904875/functions/open.html?utm_source=chatgpt.com "open"
[12]: https://stackoverflow.com/questions/78258259/development-tools-wont-watch-for-changes-in-wsl2?utm_source=chatgpt.com "Development tools won't watch for changes in WSL2"
[13]: https://www.cups.org/doc/spec-design.html?utm_source=chatgpt.com "CUPS Design Description"
