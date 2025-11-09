# VSC-Bridge Interactive Debugging Demonstration Scenario

## Summary

Create a compelling, reproducible demonstration scenario that showcases VSC-Bridge's debugging capabilities through a realistic Python debugging challenge. The scenario centers on a shopping cart calculation that mysteriously produces incorrect results due to three different "invisible state" bugs that are nearly impossible to diagnose through static code reading alone but become trivial to identify using interactive debugging with breakpoints, stepping, and runtime evaluation.

This demonstration serves multiple purposes: onboarding new users to VSC-Bridge, presenting the value proposition to stakeholders, and providing a reference implementation for collaborative human-AI debugging workflows.

## Goals

- **Demonstrate core VSC-Bridge value**: Show how runtime inspection beats static analysis for certain bug classes
- **Enable collaborative workflows**: Illustrate human-AI pair debugging where an agent helps guide investigation
- **Provide reproducible learning**: Create a scenario that users can run themselves to learn VSC-Bridge
- **Showcase key capabilities**: Highlight breakpoints, conditional breakpoints, single-test debugging, stepping (in/over/out), and `debug.evaluate` for runtime expression evaluation
- **Create presentation assets**: Deliver both the technical scenario and a narrated walkthrough script suitable for demonstrations
- **Establish debugging patterns**: Model the "breakpoint ladder" approach documented in project guidelines

## Non-Goals

- **Not a production application**: This is a teaching tool with intentional bugs, not real e-commerce code
- **Not comprehensive feature coverage**: Focus on core debugging workflow, not every VSC-Bridge capability
- **Not multi-language**: Python only to maintain focus and simplicity
- **Not automated test validation**: The scenario demonstrates debugging, it doesn't test VSC-Bridge itself
- **Not fixing the bugs**: Show identification and diagnosis, not necessarily the fixes (though optional fix examples can be provided)

## Acceptance Criteria

### 1. Problem Space Implementation
The scenario includes a Python shopping cart project with:
- A failing pytest test that calls a calculation function twice with different inputs
- Three distinct "invisible state" bugs that cause the second call to produce incorrect results:
  1. **Mutable default parameter cache** (`config.py`) - settings loader reuses cached values despite file changes
  2. **LRU-cached environment flag** (`flags.py`) - decorator caches environment variable reads
  3. **Closure-captured configuration** (`tax.py`) - tax rate function captures region at creation time
- Code that appears correct on static reading but fails at runtime
- Clear inline comments marking suggested breakpoint locations (BP1, BP2, etc.)

### 2. Integration with Test Environment
The scenario:
- Lives in `/test/python/` directory alongside existing integration tests
- Does not break or interfere with existing test discovery
- Works with the VS Code Test UI (users can click "debug test" in the gutter)
- Can be launched via both CLI (`vscb script run tests.debug-single`) and MCP tools

### 3. Progressive Revelation Walkthrough
The scenario includes a single comprehensive walkthrough document with:
- **Challenge description** explaining what makes these bugs hard without debugging
- **Breakpoint ladder strategy** showing where to pause and what to inspect at each stop
- **Progressive revelation structure** at each breakpoint stop using collapsible `<details>` sections:
  - 🤔 **The Mystery** - Frame what's strange (always visible, prompts thinking)
  - 🎯 **Hypothesis** - What might explain it (collapsible spoiler)
  - 🔍 **Investigation Commands** - CLI/MCP calls to run (collapsible spoiler)
  - 📊 **Expected Results** - What output to expect (collapsible spoiler)
  - 💡 **The Insight** - Root cause explanation and "aha moment" (collapsible spoiler)
- **Dual-mode support**: Works for self-paced learning (click spoilers when ready) and presentations (expand all beforehand)

### 4. Time and Complexity Constraints
The demonstration:
- Completes in under 10 minutes when following the script
- Requires no more than 5 breakpoints
- Uses no more than 4-5 evaluation expressions per pause
- Stays focused on a single test harness

### 5. Educational Value
Users completing the scenario should understand:
- When runtime debugging is superior to static analysis
- How to use conditional breakpoints to filter noise
- How `debug.evaluate` can compare "what code thinks" vs "current reality"
- Why stepping into decorated functions reveals caching behavior
- How to build a "breakpoint ladder" for systematic investigation

### 6. Presentation Quality
The progressive revelation walkthrough:
- Provides clear framing at each stop suitable for narration or screen recording
- Uses consistent structure (Mystery → Hypothesis → Commands → Results → Insight)
- Highlights the collaborative human-AI debugging aspect
- Connects to project documentation (CLAUDE.md agent guidelines, breakpoint ladder pattern)
- Has a clear narrative arc (problem → investigation → discovery → insight)
- Enables "pause and think" moments before revealing answers

## Risks & Assumptions

### Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Line numbers shift with edits** | Breakpoints miss targets | Use inline `# <-- BPx` markers and document the pattern; provide validation script |
| **Too complex for beginners** | Users get lost | Provide both a full walkthrough and a "quick start" variant; use clear section headers |
| **Python environment issues** | Scenario won't run | Document prerequisites clearly; provide pytest.ini configuration |
| **Conflicts with real testing** | Users confuse demo with tests | Name files clearly (`test_checkout_demo.py`?); add README in scenario directory |

### Assumptions

- Users have basic Python knowledge (functions, decorators, closures)
- Users understand pytest fundamentals (running tests, assertions)
- VSC-Bridge extension is installed and the bridge is running
- Test workspace is properly configured with Python debugger support
- Users have either CLI access (`vscb`) or MCP integration working
- Extension Host can open the test workspace successfully

## Testing Strategy

**Approach**: Manual Only (No Automated Tests)

**Rationale**: This is demonstration code with intentional bugs designed to teach debugging workflows. The scenario itself IS the test harness - users run a failing pytest test and debug it interactively. Automated tests would be testing the demo, not adding value.

**Focus Areas**:
- Manual verification that the scenario runs successfully
- Validation that breakpoints trigger at correct locations
- Confirmation that `debug.evaluate` expressions produce expected results

**Excluded**:
- Unit tests for demo code modules
- Integration tests for the scenario
- Automated validation of walkthrough steps

**Mock Usage**: Not applicable (no automated tests)

---

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: This is comprehensive teaching material requiring detailed walkthrough, narration, and progressive revelation structure. It's too substantial for README and belongs in the how-to documentation alongside other debugging guides.

**Target Audience**:
- New VSC-Bridge users learning debugging workflows
- Presenters demonstrating VSC-Bridge capabilities
- AI agent developers learning collaborative debugging patterns

**Maintenance**:
- Update when VSC-Bridge CLI/MCP APIs change
- Refresh if Python debugging workflow changes
- Validate line numbers if demo code structure changes

**Documentation Structure**:
- `docs/how/scenarios/invisible-state-debugging.md` - Main progressive revelation walkthrough
- Reference from main docs as learning/demo resource
- Link from AGENTS-TEMPLATE.md as example workflow

---

## Design Decisions

### Module Naming Convention
**Decision**: Use `demo_shop/` prefix for all Python modules

**Rationale**: Explicitly marks this as demonstration code, preventing confusion with real test fixtures. Makes it clear in test discovery UI that this is a learning scenario.

**File Structure**:
- `test/python/demo_shop/__init__.py`
- `test/python/demo_shop/config.py`
- `test/python/demo_shop/flags.py`
- `test/python/demo_shop/tax.py`
- `test/python/demo_shop/checkout.py`
- `test/python/test_checkout_demo.py`

### Progressive Revelation Format
**Decision**: Single walkthrough with collapsible `<details>` sections

**Structure per breakpoint stop**:
1. 🤔 **The Mystery** - Frame what's strange (always visible)
2. 🎯 **Hypothesis** - What might explain it (spoiler)
3. 🔍 **Investigation Commands** - CLI/MCP calls to run (spoiler)
4. 📊 **Expected Results** - What output to expect (spoiler)
5. 💡 **The Insight** - Root cause explanation (spoiler)

**Benefits**:
- Single document (no multiple difficulty versions to maintain)
- Self-paced learning (expand spoilers when ready)
- Works for presentations (expand all beforehand)
- Enables agent collaboration (agent can ask "what do you think?" before revealing)

---

## Open Questions

1. **Should we include "fix verification" steps?**
   - Show the bugs being fixed (change mutable default, remove `lru_cache`, etc.)
   - Re-run the test to prove it passes
   - Trade-off: Adds time but provides closure
   - **DEFERRED**: Implement core scenario first, add fix examples if time permits

2. **Video vs. written-only deliverables?**
   - Is a pre-recorded video walkthrough needed?
   - Or is the written script sufficient for users to self-guide?
   - **DEFERRED**: Start with written walkthrough; video can be added later based on demand

3. **Should we create multiple scenarios?**
   - This spec focuses on one scenario (shopping cart)
   - Future: async concurrency bugs? Database state issues?
   - **DEFERRED**: Perfect one scenario first; expand library based on feedback

4. **Integration with docs site?**
   - Should this scenario be linked from main documentation?
   - Should it be part of a "Getting Started" tutorial track?
   - **DEFERRED**: Add to docs/how/ first; promote to main docs navigation if valuable

5. **Agent prompt format?**
   - Should the walkthrough script be structured as a system prompt for AI agents?
   - Or remain as human-readable narration that agents can follow?
   - **DECISION**: Human-readable with markdown that agents can parse; include agent-specific notes in callouts

## Clarifications

### Session 2025-11-04

**Q1: What testing approach best fits this demonstration scenario's complexity and risk profile?**
- **Answer**: Not required at all for this
- **Impact**: No automated tests; scenario is demonstration code with intentional bugs
- **Sections Updated**: Added Testing Strategy section

**Q2: Where should this demonstration scenario's documentation live?**
- **Answer**: docs/how/ only
- **Impact**: Comprehensive walkthrough will be created in `docs/how/scenarios/invisible-state-debugging.md`
- **Sections Updated**: Added Documentation Strategy section

**Q3: What naming convention should distinguish demo code from real test code?**
- **Answer**: demo_shop/ (explicit)
- **Impact**: All modules use `demo_shop/` prefix; test file named `test_checkout_demo.py`
- **Sections Updated**: Added Design Decisions → Module Naming Convention

**Q4: Should the scenario provide multiple difficulty levels for different user experience?**
- **Answer**: Progressive revelation (Single walkthrough only with expandable spoilers)
- **Impact**: Uses `<details>` sections for Mystery → Hypothesis → Commands → Results → Insight pattern
- **Sections Updated**: Added Design Decisions → Progressive Revelation Format

**Summary**:
- ✅ **Resolved**: Testing strategy (manual only), documentation location (docs/how/), naming (demo_shop/), difficulty levels (progressive revelation)
- 📋 **Deferred**: Fix verification steps, video production, multiple scenarios, docs site integration
- 🎯 **Key Decision**: Progressive revelation format enables self-paced learning while supporting presentations and agent collaboration

---

## Success Metrics (Post-Implementation)

After implementation, success can be measured by:

- **Usability**: Can a new user complete the scenario in under 15 minutes?
- **Clarity**: Does the walkthrough script answer "why this breakpoint?" at each step?
- **Repeatability**: Does the scenario produce consistent results across multiple runs?
- **Educational impact**: Do users report understanding breakpoint strategies better after completing it?
- **Presentation value**: Can the scenario be demonstrated live in under 10 minutes?

---

## Related Documentation

- `CLAUDE.md` - Project instructions including agent debugging guidelines
- `AGENTS-TEMPLATE.md` - Template for AI agents using VSC-Bridge MCP tools
- `docs/how/dogfood/dogfooding-vsc-bridge.md` - Dogfooding workflows
- `docs/manual-test/debug-single.md` - Manual testing instructions for debug-single

---

## Next Steps

After spec approval:
1. Run `/plan-2-clarify` to resolve open questions
2. Create architecture plan (file structure, module organization)
3. Implement problem space (shop modules + failing test)
4. Write walkthrough script with command sequences
5. Validate scenario works in both CLI and MCP modes
6. Create quick reference guide for presentations
