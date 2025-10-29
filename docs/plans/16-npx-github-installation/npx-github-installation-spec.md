# npx GitHub Installation Support

## Summary

Enable users to run the `vscb` CLI directly from the GitHub repository using `npx`, eliminating all manual setup steps. Users should be able to execute `npx github:AI-Substrate/vsc-bridge <command>` from any directory without cloning, building, or configuring anything locally. This provides instant access to the CLI for evaluation, CI/CD integration, and one-off usage scenarios while maintaining the clean repository structure required for long-term maintainability.

**User Value**: Dramatically reduces time-to-first-run from ~10 minutes (clone, install, build, link) to <60 seconds, making the tool accessible to evaluators, CI/CD pipelines, and users who want to try before committing to a global installation.

## Goals

- **Instant Access**: Users can run any vscb command via npx without any local setup or installation
- **Version Flexibility**: Users can specify branches, tags, or commits to run specific versions (e.g., `npx github:repo#v1.0.0`)
- **Clean Repository**: No committed build artifacts (dist/, compiled files) that create merge conflicts or bloat
- **npm Publishing Readiness**: Repository structure supports future publishing to npm registry without restructuring
- **Preserved Workflows**: Existing contributor development workflows remain functional (just build, npm link, F5 debugging)
- **Reasonable Performance**: First-time npx installation completes within 60 seconds (acceptable documented tradeoff)
- **CI/CD Integration**: Enable automated testing and deployment pipelines to use specific versions from GitHub
- **Feature Parity**: All CLI commands work identically whether run via npx, global install, or local development

## Non-Goals

- **npm Registry Publishing**: This feature prepares for but does not include publishing to npm registry (future work)
- **Installation Speed Optimization**: Sub-5-second installation is not required; 30-60s is acceptable for first run
- **Alternative Package Managers**: Support for yarn, pnpm, or other package managers beyond npm/npx
- **Private Repository Support**: Optimization for private repository access (focus on public repo usage)
- **Backward Compatibility**: Preserving exact existing installation paths/structure (major version bump acceptable)
- **Zero-Build Installation**: Committing pre-built artifacts to achieve instant installation (explicit non-goal)
- **Workspace Package Selection**: Supporting `npx github:repo/packages/cli` syntax (npm limitation)

## Acceptance Criteria

### Primary Installation Scenarios

1. **Basic npx Execution**
   - User runs `npx github:AI-Substrate/vsc-bridge script run bp.list` from any directory
   - CLI installs, builds automatically, and executes the command successfully
   - User sees expected output (list of breakpoints or "no breakpoints found")
   - Installation completes within 60 seconds on first run

2. **Branch Selection**
   - User runs `npx github:AI-Substrate/vsc-bridge#develop script run debug.status`
   - npx installs from the `develop` branch specifically
   - Command executes using code from that branch
   - User can verify branch/version being used

3. **Tag/Version Pinning**
   - User runs `npx github:AI-Substrate/vsc-bridge#v1.0.0 --help`
   - npx installs from the specific tagged version
   - Subsequent runs use cached version (no re-download)
   - Version pinning enables reproducible builds in CI/CD

4. **Cached Execution Performance**
   - User runs the same npx command a second time
   - npm uses cached installation (no re-download or rebuild)
   - Command executes within 5 seconds
   - Cache persists across terminal sessions

5. **Full Command Compatibility**
   - User executes complex commands via npx: `npx github:repo script run bp.set --param path=/test.js --param line=42`
   - All flags, parameters, and arguments pass through correctly
   - Command behavior identical to global installation
   - Error messages and help text display correctly

### Repository & Development Scenarios

6. **Clean Repository State**
   - Developer clones repository freshly
   - `git status` shows no uncommitted build artifacts (dist/, manifest.json)
   - Repository size remains reasonable (<10MB without node_modules)
   - No large binary files committed to git history

7. **Contributor Workflow Preservation**
   - Developer runs `just build` → builds successfully
   - Developer runs `just cli-link` → creates global symlink
   - Developer runs `vscb <command>` → uses local development version
   - Developer presses F5 in VS Code → extension debugging works
   - No workflow steps added or removed (same DX as before)

8. **Integration Tests Pass**
   - All existing MCP integration tests pass (`npm run test:integration:mcp`)
   - CLI integration tests pass (`npm run test:integration:cli`)
   - Extension tests pass (`npm run test:extension`)
   - No test timeouts or failures due to restructuring

### Error Handling & Edge Cases

9. **Build Failure Messaging**
   - User runs npx on a machine with Node.js 16 (below requirement)
   - Installation fails with clear error message indicating Node.js version requirement
   - Error provides actionable guidance (e.g., "Upgrade to Node.js >=18")

10. **Network Failure Recovery**
    - User's network connection drops during initial download
    - npm provides clear error message about network failure
    - Retry succeeds and completes installation
    - No corrupted cache state

11. **Extension Version Mismatch**
    - User runs npx with CLI v2.0.0 against extension v1.5.0
    - CLI detects version mismatch and warns user
    - Warning provides guidance on which component to upgrade
    - CLI continues to work with degraded functionality warning

### Documentation & Discoverability

12. **Installation Documentation**
    - README.md includes npx installation examples in prominent position
    - Examples show common use cases (list tools, set breakpoint, debug)
    - Performance expectations documented (first run ~60s)
    - Alternative installation methods clearly explained (npx vs global vs contributor)

## Risks & Assumptions

### Risks

1. **Monorepo Workspace Incompatibility**
   - **Risk**: npm may not support installing workspace sub-packages from git URLs
   - **Impact**: Would require significant restructuring or alternative approach
   - **Likelihood**: HIGH (confirmed through research)

2. **Cross-Platform Build Failures**
   - **Risk**: Build scripts may fail on Windows due to path separators or shell differences
   - **Impact**: Windows users cannot use npx installation
   - **Likelihood**: MEDIUM

3. **Breaking Contributor Workflows**
   - **Risk**: Restructuring breaks existing development scripts, IDE configurations, or muscle memory
   - **Impact**: Temporary productivity loss for all contributors
   - **Likelihood**: MEDIUM (mitigated by migration guide)

4. **Build Dependency Availability**
   - **Risk**: devDependencies may not be available during npm's prepare script for git installs
   - **Impact**: Cannot build during installation; would require committing artifacts
   - **Likelihood**: LOW (research confirms devDeps available in prepare)

5. **Installation Time Perception**
   - **Risk**: Users expect instant npx execution (<5s) but actual is 30-60s
   - **Impact**: Negative first impression, abandoned trials
   - **Likelihood**: MEDIUM (mitigated by documentation)

6. **Manifest Generation Complexity**
   - **Risk**: Cross-package dependency on extension metadata during build
   - **Impact**: Build failures if extension package structure changes
   - **Likelihood**: LOW (manifest generation is self-contained)

### Assumptions

1. **User Environment**
   - Users have Node.js >=18.0.0 installed
   - Users have npm >=8.0.0 (comes with Node.js 18+)
   - Users have network access to github.com
   - Users have sufficient disk space for installation (~50MB)

2. **npm Behavior**
   - npm's `prepare` lifecycle script executes for git dependencies
   - npm installs devDependencies before running prepare script
   - npm caches git dependencies in standard cache location
   - npm cache persists across terminal sessions and reboots

3. **Build Process**
   - TypeScript compilation succeeds on all supported platforms
   - Manifest generation completes within prepare script timeout
   - No external system dependencies required beyond Node.js
   - Build process is deterministic (same input → same output)

4. **Version Compatibility**
   - CLI can detect extension version from workspace `.vsc-bridge/host.json`
   - Version mismatch warnings are acceptable (hard failure not required)
   - Users understand semantic versioning conventions
   - Major version bumps communicate breaking changes

5. **Performance Expectations**
   - 30-60 second first-time installation is acceptable when documented
   - Users will read installation documentation before first use
   - CI/CD pipelines can tolerate 60s setup time
   - Cached execution <5s meets user expectations for subsequent runs

## Open Questions

### Installation & Distribution

1. **Should we maintain backward compatibility with existing CLI installation paths?**
   - If users have globally installed vscb from old structure, should it coexist with new npx version?
   - Should we provide migration script for existing users?
   - Is breaking change acceptable with major version bump (v1 → v2)?

2. **How should we handle private repository installations?**
   - Should documentation mention `npx git+ssh://...` syntax?
   - Should we test/support GitHub personal access token authentication?
   - Or explicitly mark as "public repository only" feature?

3. **What level of platform testing is required before release?**
   - Should we test on Windows, macOS, Linux before merging?
   - What Node.js versions should we test (just 18+, or 18/20/22)?
   - Should we add CI job that tests npx installation from GitHub?

### Version Management

4. **How should we communicate version mismatches between CLI and extension?**
   - Warning on every command (annoying) vs one-time warning?
   - Should we provide `vscb version check` command?
   - Should we auto-update detection/suggestion?

5. **What versioning strategy should we use for coordinated releases?**
   - Should CLI and extension always have matching version numbers?
   - How do we handle independent updates to CLI vs extension?
   - Should we enforce version parity or allow drift?

### Error Handling & Recovery

6. **What should happen if the prepare script fails on user's machine?**
   - Provide fallback to pre-built artifacts?
   - Fail with detailed troubleshooting guide?
   - Retry with verbose logging?

7. **How should we handle partial/corrupted installations?**
   - Should we detect corrupted npm cache and clear it?
   - Provide `--force-rebuild` flag for debugging?
   - Document manual cache clearing steps?

### Testing & Validation

8. **How do we test npx installation in CI/CD without publishing?**
   - Use test repository/branch?
   - Mock npm install behavior?
   - Manual testing only?

9. **Should we provide installation verification tool?**
   - `vscb doctor` command that checks installation health?
   - Automated validation after npx install?
   - Self-test mode for troubleshooting?

### Documentation & Communication

10. **How prominently should we feature npx installation in docs?**
    - Primary installation method (npx first, global second)?
    - Alternative method (global first, npx for special cases)?
    - Equal weight to both methods?

11. **What examples should we include in README for npx usage?**
    - Just basic commands or full debugging workflows?
    - Include CI/CD integration examples?
    - Show version pinning for reproducibility?

## Testing Strategy

**Approach**: Lightweight Testing

**Rationale**: This is primarily a build/packaging/distribution change rather than complex business logic. Core functionality validation is sufficient - verify npx works, builds succeed, commands execute correctly. Focus testing effort on critical paths rather than comprehensive coverage.

**Focus Areas**:
- Build pipeline succeeds from clean clone
- npx installation works end-to-end
- All CLI commands execute identically via npx vs global install
- Existing integration tests pass (no regressions)
- Error messages display correctly for common failure scenarios

**Excluded**:
- Extensive edge case testing (rely on real-world usage feedback)
- Complex test fixtures or test infrastructure
- Testing every possible npm/Node.js version combination
- Mocking npm behavior or installation mechanics

**Mock Usage**: Avoid mocks entirely

Use real data, real npm installs, real file operations. Maximum realism even if tests are slower. This ensures we catch real-world issues with npm behavior, filesystem operations, and cross-package dependencies. Use fixtures for test data only.

**Platform Coverage**: Single platform (Linux/devcontainer) for initial release. Document other platforms as "best effort" until community feedback indicates cross-platform issues.

## Documentation Strategy

**Location**: README.md only

**Rationale**: This feature is user-facing and needs to be discoverable immediately. README.md is the first place users look for installation instructions. No need for deep architectural docs since this is a packaging/distribution change, not new functionality.

**Content**:
- **Installation section** (prominent, top of README):
  - npx installation as PRIMARY method (instant access, zero setup)
  - Global installation as secondary method (persistent install)
  - Contributor installation (development workflow)
- **Quick start examples** showing npx usage with common commands
- **Performance expectations** (first run ~60s, cached runs <5s)
- **Version pinning examples** for CI/CD reproducibility
- **Troubleshooting** common build failures with actionable fixes

**Target Audience**:
- New users evaluating the tool (npx is zero-friction entry)
- CI/CD pipeline authors (version pinning, reproducibility)
- Contributors (preserve existing workflow docs)

**Maintenance**: Update installation section during implementation. Keep examples synchronized with actual command syntax. Add troubleshooting entries as users report issues.

## Clarifications

### Session 2025-10-18

**Q1: Testing Strategy**
- **Answer**: Lightweight Testing
- **Impact**: Focus on core functionality validation rather than comprehensive test coverage. Verify build pipeline, npx installation, command execution, and existing test pass. Skip extensive edge case testing and mocking infrastructure.

**Q2: Mock Usage Policy**
- **Answer**: Avoid mocks entirely
- **Impact**: Use real npm installs, real file operations, real build processes. Tests will be slower but catch real-world issues. Fixtures acceptable for test data.

**Q3: Documentation Strategy**
- **Answer**: README.md only
- **Impact**: All documentation goes in main README. No separate docs/how/ guides needed. Focus on discoverable installation instructions and quick-start examples.

**Q4: Backward Compatibility**
- **Answer**: Breaking change with major version bump (v1 → v2)
- **Impact**: No coexistence with old installation structure required. Provide migration guide in release notes. Semantic versioning communicates breaking change.
- **Updated Section**: Non-Goals (confirmed), Acceptance Criteria (no backward compat tests)

**Q5: Cross-Platform Testing**
- **Answer**: Single platform only (Linux/devcontainer)
- **Impact**: Test only on Linux where development happens. Document Windows/macOS as "best effort". Community feedback will drive cross-platform testing priorities.
- **Updated Section**: Testing Strategy (platform coverage), Risks (Windows build failures remain documented)

**Q6: Build Failure Handling**
- **Answer**: Fail fast with detailed troubleshooting guide
- **Impact**: When prepare script fails, show comprehensive error message with common causes, Node.js version requirements, manual build steps. No automatic retry or fallback mechanism.
- **Updated Section**: Acceptance Criteria #9 (enhanced error messaging requirements)

**Q7: Documentation Prominence**
- **Answer**: npx as primary installation method
- **Impact**: README installation section leads with npx (instant access). Global installation becomes secondary option. Emphasize zero-setup value proposition.
- **Updated Section**: Documentation Strategy (content structure)

**Q8: Version Mismatch Communication**
- **Answer**: Warning on every command
- **Impact**: CLI checks extension version on every execution and warns if mismatch detected. Ensures users always aware of version drift even if potentially repetitive.
- **Updated Section**: Acceptance Criteria #11 (version mismatch behavior)

---

## Clarification Summary

**Resolved** (8/11 open questions):
1. ✅ Backward compatibility → Breaking change with major version bump
2. ⏭️ Private repository installations → Deferred (out of scope)
3. ✅ Platform testing requirements → Linux only for initial release
4. ✅ Version mismatch communication → Warning on every command
5. ⏭️ Versioning strategy → Deferred (can evolve organically)
6. ✅ Prepare script failure handling → Fail fast with troubleshooting guide
7. ⏭️ Partial/corrupted installations → Deferred (edge case, document npm cache clear)
8. ⏭️ Testing npx in CI/CD → Deferred (implementation detail)
9. ⏭️ Installation verification tool → Deferred (nice-to-have, not MVP)
10. ✅ Documentation prominence → npx as primary installation method
11. ⏭️ README examples scope → Deferred (will emerge during documentation writing)

**Deferred Questions**: Low-impact decisions that can be made during implementation or evolved post-launch based on user feedback.

**Outstanding Critical Issues**: None. All high-impact architectural and scope decisions resolved.

---

**Next Steps**: Run `/plan-3-architect` to generate phase-based implementation plan.
