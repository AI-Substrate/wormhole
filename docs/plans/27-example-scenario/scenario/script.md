**Title:** *Seeing Between the Lines — a collaborative debugging story with VSC‑Bridge*

---

### 0:00 — Opening (gentle intro)

**VO (you):**
“Most bugs aren’t loud. They’re quiet, ‘obvious’ in hindsight, and practically invisible until you look at the code **while it’s running**. Today I’ll show how a debugger—wired into an AI agent through VSC‑Bridge—turns guesswork into evidence. It’s a short story about a shopping cart total that refuses to change, and how we finally see why.”

**On‑screen:** Project tree (the toy repo from earlier). Quick pan across:

* `shop/config.py` – tiny settings loader
* `shop/flags.py` – feature flag via `lru_cache`
* `shop/tax.py` – a closure that returns a tax rate
* `shop/checkout.py` – adds it all up
* `tests/test_checkout.py` – one focused test

---

### 0:30 — The problem unfolds

**VO:**
“We start with a single test that changes both a config file **and** an environment flag between two calls. On paper, the second call should use an EU tax rate and apply a discount. In practice… it doesn’t.”

**On‑screen action:** Run the test once (or just show the failing assertion). No deep code reading yet—linger on the red failure.

**VO:**
“Reading the code, everything looks reasonable. So either the file change isn’t being read, the flag change isn’t being seen, or something is holding onto old state. That’s where runtime visibility matters.”

---

### 1:00 — Enter the bridge (collaboration focus)

**VO:**
“VSC‑Bridge gives my agent the same knobs I’d use by hand—breakpoints, debug‑single‑test, *step in/over/out*, and, most importantly, **evaluate** in the paused process. The point isn’t to let the agent ‘go off and fix it.’ It’s to bring me along and make the investigation a shared, high‑fidelity experience.”

**On‑screen:** A sidebar cue card titled *Investigation Cycle* (Hypothesis → Plan → Observe → Refine → Confirm).
**VO:**
“This is the recommended flow in our project’s agent guide: pick one test as a harness, build a breakpoint ladder, pause at key boundaries, and inspect with `debug.evaluate`. We’ll follow that script.” 

---

### 1:25 — Ask the agent for a plan

**Dialogue style (subtitles):**

**You:** “Propose a debugging plan for this failing test. Where should we break, and what will we inspect at each stop?”

**Agent (plan summary):**

1. **Clear breakpoints** to avoid noise.
2. **Breakpoint ladder** at four inflection points:

   * `config.py:31` — conditional BP to catch the *second* read (suspect: hidden cache).
   * `tax.py:10` — inside the closure (suspect: captured `region`).
   * `checkout.py:12` — at the feature flag decision (suspect: stale flag).
   * `flags.py:11` — inside `flag_enabled` to inspect `lru_cache` behavior.
3. **Run one test at one line** using *debug single* from the second call site to jump straight to the interesting path.
4. **While paused**, use `debug.evaluate` to compare “what the code *thinks*” vs “what the world *is* right now.”
5. **Step‑in/over/out** to build a causal chain, then confirm the root cause.

**VO:**
“This plan mirrors the project’s ‘breakpoint ladder’ guidance—entry, decision, mutation, boundary, exit—and keeps us focused on runtime evidence over speculation.” 

---

### 1:55 — “Go to line” walkthrough (show, don’t tell)

**VO:**
“Before we actually run, the agent walks me through *why* each breakpoint matters, file by file. It’s a quick orientation pass, using editor navigation to **go to the exact line** we’ll pause on.”

**On‑screen (editor navigation, with brief highlights):**

* **`shop/config.py` → line 31**
  **Agent (subtitle):** “If the absolute path is in the default‑arg `cache`, this function returns **stale settings** without re‑reading the file. Let’s set a **conditional breakpoint**: `abspath in cache`.”

* **`shop/tax.py` → line 10**
  **Agent:** “The closure captured `region` at factory time. We’ll compare `region` with a fresh file read at pause.”

* **`shop/checkout.py` → line 12**
  **Agent:** “Branch on `flag_enabled('SALES')`. We’ll step **into** this call to see whether `lru_cache` is short‑circuiting.”

* **`shop/flags.py` → line 11**
  **Agent:** “At the return, we’ll evaluate `flag_enabled.cache_info()` and the current environment to prove or disprove a cache hit.”

**VO:**
“This orientation makes the upcoming pauses legible. I know what we’ll look for *and* where.”

---

### 2:40 — The collaborative setup (commands the agent runs)

**On‑screen terminal (agent driving):**

```bash
# Clean slate
vscb script run breakpoint.clear.project
# Breakpoints
vscb script run breakpoint.set --param path="$(pwd)/shop/config.py"   --param line=31 --param condition="abspath in cache"
vscb script run breakpoint.set --param path="$(pwd)/shop/tax.py"      --param line=10
vscb script run breakpoint.set --param path="$(pwd)/shop/checkout.py" --param line=12
vscb script run breakpoint.set --param path="$(pwd)/shop/flags.py"    --param line=11
```

**VO:**
“I can also do this from the VS Code UI; the agent just keeps the sequence disciplined and repeatable.” 

---

### 3:00 — Fire up exactly one test, exactly where we care

**Option A (agent):**

```bash
# Jump straight to the second call in the test
vscb script run tests.debug-single \
  --param path="$(pwd)/tests/test_checkout.py" \
  --param line=31
```

**Option B (you):**
Click the “debug test” gutter icon at that line in the VS Code Test UI.
**VO:**
“Two equal paths. Either way, we’re collaborating—same session, same pauses.”

---

## The four pauses (runtime, high‑fidelity)

### 3:20 — Pause 1: `config.py:31` (stale settings via mutable default)

**VO:**
“First stop—prove or dismiss the ‘stale settings’ theory.”

**On‑screen terminal (agent while paused):**

```bash
vscb script run debug.evaluate --param expression="abspath"
vscb script run debug.evaluate --param expression="abspath in cache"
vscb script run debug.evaluate --param expression="list(cache.keys())"
vscb script run debug.evaluate --param expression="cache[abspath]"
vscb script run debug.evaluate --param expression="id(cache)"
vscb script run debug.step-over
vscb script run debug.continue
```

**VO:**
“The same default‑arg dict persists across calls. The file changed, but the loader simply returns the first parsed result. That’s our first piece of evidence.”

---

### 4:00 — Pause 2: `tax.py:10` (closure captured the old region)

**On‑screen terminal:**

```bash
vscb script run debug.evaluate --param expression="region"
vscb script run debug.evaluate --param expression="load_settings(settings_path)['region']"
vscb script run debug.continue
```

**VO:**
“Textbook closure capture. The function keeps returning a rate for the **original** region, even though the file says otherwise now. Evidence piece two.”

---

### 4:25 — Pause 3: `checkout.py:12` → step into `flag_enabled`

**On‑screen terminal:**

```bash
vscb script run debug.step-into
vscb script run debug.evaluate --param expression="flag_enabled.cache_info()"
vscb script run debug.evaluate --param expression="__import__('os').getenv('FEATURE_SALES')"
# Optional experiment:
# vscb script run debug.evaluate --param expression="flag_enabled.cache_clear()"
vscb script run debug.continue
```

**VO:**
“Stepping into the call lands us in the `lru_cache` wrapper, not our function body—because the **decorator** is answering from cache. The env var has flipped, but the decorated function doesn’t know. That’s the third and final clue.”

---

### 4:55 — (Optional) Pause 4: back in the test

**On‑screen terminal:**

```bash
vscb script run debug.evaluate --param expression="total2"
vscb script run debug.evaluate --param expression="expected"
```

**VO:**
“And now the mismatch is obvious: stale file settings, stale tax region, stale feature flag. Three tiny, invisible state leaks—only visible once we looked at the program *running*.”

---

### 5:15 — The “click” moment (critical discovery)

**VO:**
“What felt like one problem is actually three ‘sticky’ states, each in a different layer: a mutable default cache in the loader, a closure that froze the region, and a decorator that cached the environment. Reading the code, you can **suspect** these pitfalls. Pausing and evaluating at runtime, you **prove** them in seconds.”

**On‑screen:** A simple three‑column card:

* **Loader:** default‑arg cache
* **Tax:** closure captures `region`
* **Flags:** `lru_cache` hides env changes

---

### 5:40 — Why the collaboration mattered

**VO:**
“The bridge didn’t replace me—it synchronized me. The agent set the rails—clear breakpoints, a single harness test, step discipline—and narrated every pause. I could drive from the UI or let it type the CLI; either way, I saw what it saw.” 

**VO (beat):**
“That shared, high‑fidelity runtime view is the difference between *guessing* and *knowing*.”

---

## Appendix — Script you can read verbatim (with on‑screen cues)

**Hook**

> “Let’s debug a deceptively simple test. I’ll change a config file from US to EU and flip a feature flag from 0 to 1. The total should go up—then drop with the discount. It… doesn’t.”

**Introduce VSC‑Bridge**

> “I’m using VSC‑Bridge so my agent can operate the debugger alongside me. We’ll keep to four tools: set breakpoints, run a single test at a line, step in/over/out/continue, and `debug.evaluate` to ask the runtime questions.”

**Ask for a plan (subtitle as agent speaks)**

> “First, clear any old breakpoints. Next, place breakpoints at: `config.py:31` (conditional, only hit when cached), `tax.py:10` (closure body), `checkout.py:12` (feature flag), and `flags.py:11` (inside the decorator). Run the one test at the call site so we jump straight to the second path. At each pause, evaluate the variables we care about.”

**Goto‑line orientation**

> “Open `config.py`, go to line 31—this returns cached settings if the path is present; we’ll test that hypothesis. Open `tax.py`, line 10—this closure probably captured `region`. `checkout.py`, line 12—branch on `flag_enabled`; we’ll step into it. `flags.py`, line 11—here we’ll inspect the cache wrapper.”

**Run the test and narrate each pause**

* Pause 1: “`abspath in cache` is True; the dict keys show the file path; the cached value is still ‘US’. Step over, continue.”
* Pause 2: “`region` is ‘US’ but a fresh load shows ‘EU’. That’s the closure. Continue.”
* Pause 3: “Stepped into `lru_cache` wrapper. `flag_enabled.cache_info()` shows a hit. Env says ‘1’ but the wrapper returns the old answer. Continue.”
* Final: “`total2` vs `expected` confirms our runtime story.”

**Close**

> “We’ve built a mental model backed by **evidence**. The fixes are straightforward—stop using a mutable default for cache, don’t cache env‑derived flags, and don’t capture region—or provide a reload path. What mattered was how quickly we knew *why* it was wrong.”

---

## Quick copy‑paste command block (for the recording)

```bash
# 1) Clear
vscb script run breakpoint.clear.project

# 2) Set the breakpoints
vscb script run breakpoint.set --param path="$(pwd)/shop/config.py"   --param line=31 --param condition="abspath in cache"
vscb script run breakpoint.set --param path="$(pwd)/shop/tax.py"      --param line=10
vscb script run breakpoint.set --param path="$(pwd)/shop/checkout.py" --param line=12
vscb script run breakpoint.set --param path="$(pwd)/shop/flags.py"    --param line=11

# 3) Debug exactly one test at exactly one line (or use the VS Code Test UI)
vscb script run tests.debug-single \
  --param path="$(pwd)/tests/test_checkout.py" \
  --param line=31

# 4) While paused — the greatest hits of evaluate + stepping
# config.py
vscb script run debug.evaluate --param expression="abspath"
vscb script run debug.evaluate --param expression="abspath in cache"
vscb script run debug.evaluate --param expression="list(cache.keys())"
vscb script run debug.evaluate --param expression="cache[abspath]"
vscb script run debug.step-over
vscb script run debug.continue

# tax.py
vscb script run debug.evaluate --param expression="region"
vscb script run debug.evaluate --param expression="load_settings(settings_path)['region']"
vscb script run debug.continue

# checkout.py → step into flag
vscb script run debug.step-into
vscb script run debug.evaluate --param expression="flag_enabled.cache_info()"
vscb script run debug.evaluate --param expression="__import__('os').getenv('FEATURE_SALES')"
vscb script run debug.continue
```

---

### Notes for voice and pacing

* Keep explanations bite‑size at each pause (what, why, one or two evals).
* Use editor **goto line** navigation before running to set the context: it helps viewers form a mental map.
* Switch between you driving (Test UI) and the agent driving (CLI) once, to underline the *collaboration* point. 

---

If you want a closing beat for the video:

> “This is why the bridge exists: so an agent and a human can investigate together, in the real program, at the real moment, with real state. The difference between a hunch and a fix is one `evaluate` away.”
