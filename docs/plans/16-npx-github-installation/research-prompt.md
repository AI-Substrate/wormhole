# Deep Research Prompt: Modern Best Practices for npx GitHub Installation

## 1. Clear Problem Definition

**Challenge**: We need to enable users to install and run our CLI tool (`vscb`) directly from GitHub using npx, without any manual setup steps. Our current architecture is a TypeScript monorepo with the CLI in a workspace subdirectory (`packages/cli/`), which creates complications for direct npx installation.

**Current Blockers**:
- npm does NOT support installing workspace sub-packages from git URLs (e.g., `npm install github:org/repo/packages/cli` doesn't work)
- npx installs from the root package.json, but our root is marked `"private": true` and has no `bin` field
- We need to build TypeScript source during installation (using `prepare` script)
- CLI depends on a generated manifest.json from another workspace package (extension)

**Desired Outcome**: Users run `npx github:AI-Substrate/vsc-bridge <command>` and it just works - builds automatically, executes the CLI, with <60s installation time on first run.

## 2. Contextual Information

### Technology Stack
- **Language**: TypeScript 5.9.3
- **Runtime**: Node.js ≥18.0.0
- **Package Manager**: npm (workspaces)
- **CLI Framework**: oclif 3.18.1
- **Build Tools**: tsc (TypeScript compiler), tsx 4.20.6, shx 0.3.4
- **Project Structure**: Monorepo with npm workspaces

### Current Repository Structure
```
vsc-bridge/
├── package.json (root - private: true, workspaces defined)
├── packages/
│   ├── cli/ (our CLI - needs to be installable via npx)
│   │   ├── package.json (name: @vsc-bridge/cli, bin: vscb)
│   │   ├── src/ (TypeScript source)
│   │   └── dist/ (gitignored, built via tsc)
│   ├── extension/ (VS Code extension)
│   └── shared-test/
└── mcp-server/
```

### Build Pipeline
1. **Manifest generation**: `scripts/build-manifest.ts` scans `packages/extension/src/vsc-scripts/**/*.meta.yaml` and generates `manifest.json` (149KB)
2. **CLI compilation**: `tsc -p packages/cli/tsconfig.json` outputs to `packages/cli/dist/`
3. **Manifest copy**: `shx cp packages/extension/src/vsc-scripts/manifest.json packages/cli/dist/manifest.json`

### Dependencies
**Runtime** (must be in `dependencies`):
- @oclif/core, ink, react, @modelcontextprotocol/sdk, chalk, fs-extra, zod

**Build-time** (currently in `devDependencies`):
- typescript, tsx, shx, js-yaml (for manifest generation)

### Recent Changes
- MCP server integration embedded within CLI (`packages/cli/src/lib/mcp/`)
- Integration tests use real file operations (no mocking policy)
- Manifest generation is critical dependency from extension package

## 3. Key Research Questions

### Architecture & Structure
1. **What is the modern, idiomatic way to structure a TypeScript CLI monorepo for npx GitHub installation?**
   - Should the CLI be at the root, or can workspace packages work with npx?
   - Are there npm/pnpm/yarn features we're missing that enable workspace sub-package installation from GitHub?
   - What do popular TypeScript CLI tools (turbo, changesets, etc.) do?

2. **How should monorepos handle cross-package build dependencies during npm prepare scripts?**
   - Our CLI needs manifest.json from the extension package - is this anti-pattern?
   - Should we duplicate manifest generation logic in the root?
   - Are there better patterns for shared build artifacts?

3. **What's the correct package.json configuration for npx + GitHub + future npm registry publishing?**
   - Should we have separate package.json configurations for different distribution methods?
   - How do we mark a package as "installable from GitHub" vs "private workspace root"?

### Build & Distribution
4. **What's the best practice for build artifacts in git repositories for npx installation?**
   - Is committing `dist/` acceptable in 2025, or universally discouraged?
   - If using prepare scripts, what's the standard timeout/performance expectation?
   - How do popular tools handle the "clean repo vs instant install" tradeoff?

5. **How should prepare scripts be structured for reliability across platforms (Windows/macOS/Linux)?**
   - Are there common pitfalls with path separators, shell commands, or filesystem operations?
   - Should we use cross-platform build tools (like esbuild, tsup, or unbuild)?
   - What's the standard error handling pattern for prepare script failures?

6. **What's the modern approach to handling devDependencies in prepare scripts for git installs?**
   - Confirm: npm DOES install devDeps before running prepare for git URLs?
   - Are there version-specific behaviors or edge cases we should know?
   - Should build tools be in dependencies vs devDependencies?

### Version Management
7. **How should coordinated CLI + extension versioning work in a monorepo?**
   - Should both always have matching versions, or can they drift?
   - What's the standard for version mismatch warnings (every command vs once)?
   - Are there tools/patterns for enforcing version parity across workspace packages?

8. **What's the correct semantic versioning strategy for restructuring (breaking changes)?**
   - Is moving from `packages/cli` to root a breaking change requiring major version bump?
   - How should we communicate migration to existing users?
   - Are there tools for automating migration scripts?

### Testing & Validation
9. **How do projects test npx GitHub installation in CI/CD without publishing?**
   - Can we test `npx github:org/repo#branch` against the current branch in CI?
   - Are there tools for simulating npm install from git in isolated environments?
   - What's the standard for testing prepare scripts in CI?

10. **What's the modern approach to integration testing TypeScript CLI tools?**
    - Should tests run against compiled `dist/` output or source with tsx/ts-node?
    - How do we test the full npx install flow without hitting GitHub repeatedly?
    - Are there standard patterns for testing CLI + server architectures (our MCP integration)?

## 4. Recommended Tools and Resources

### Please Investigate These Tools/Patterns
- **unbuild** or **tsup**: Modern TypeScript build tools (simpler than raw tsc?)
- **changesets**: Monorepo versioning and release management
- **publint**: Validate package.json for npm publishing best practices
- **pkg-pr-new**: Test npm packages from PRs before merging
- **pkgroll**: Zero-config TypeScript package bundler
- **Modern oclif best practices**: Has oclif's recommended structure evolved?

### Reference Projects to Analyze
Please examine how these popular TypeScript CLI tools handle npx + GitHub installation:
1. **turbo** (Vercel) - Monorepo, TypeScript CLI, npx installable
2. **changesets** (Atlassian) - Monorepo tool, widely npx'd from GitHub for testing
3. **tsx** (esbuild-kit) - TypeScript executor, simple structure
4. **zx** (Google) - Shell scripting with TypeScript, npx-first design
5. **vite** - Not CLI-focused but handles complex monorepo + build well

### Key Questions for Each Reference
- Where is their primary package.json (root vs sub-package)?
- How do they handle TypeScript compilation during installation?
- Do they commit build artifacts or use prepare scripts?
- How do they structure their `files` field in package.json?
- How do they test npx installation in CI?

### Documentation to Review
- **npm documentation**: Latest lifecycle scripts behavior (2024-2025)
- **GitHub Packages**: Any features for hosting pre-built packages?
- **Node.js LTS changes**: Any relevant changes in v18/v20/v22 affecting package installation?
- **TypeScript 5.x**: New compiler options affecting distribution?

## 5. Practical Examples

### Please Provide Code Examples For:

1. **Ideal package.json for npx + GitHub + npm registry**
   ```json
   // Show complete configuration with:
   // - bin field
   // - prepare script
   // - files field
   // - dependencies vs devDependencies split
   // - any modern fields we might be missing (exports, type, etc.)
   ```

2. **Robust prepare script with error handling**
   ```javascript
   // Show modern pattern for:
   // - Cross-platform compatibility
   // - Clear error messages on failure
   // - Validation before build
   // - Performance optimization
   ```

3. **Monorepo CLI structure for npx compatibility**
   ```
   // Show directory structure for:
   // - CLI at root vs sub-package
   // - Handling shared dependencies
   // - Build output organization
   ```

4. **CI/CD workflow testing npx installation**
   ```yaml
   // GitHub Actions example:
   // - Test npx install from current branch
   // - Validate build succeeds
   // - Run smoke tests against installed package
   ```

5. **Version check implementation with mismatch warnings**
   ```typescript
   // Modern pattern for:
   // - Reading package versions from monorepo
   // - Comparing semantic versions
   // - Displaying warnings without being annoying
   ```

## 6. Pitfalls and Mitigation

### Known Anti-Patterns to Avoid
Please identify if we're falling into any of these traps:

1. **Monorepo Mistakes**
   - Is `private: true` on root preventing npx installation?
   - Are we structuring workspaces incorrectly for distribution?
   - Should we use pnpm/yarn instead of npm workspaces for better git install support?

2. **Build Pipeline Issues**
   - Are we over-complicating the build (could use simpler bundler)?
   - Should manifest.json generation happen at publish time vs build time?
   - Is cross-package dependency on extension a code smell?

3. **npm/npx Misunderstandings**
   - Are there recent npm changes we're not aware of (npm 9/10)?
   - Is prepare script the right lifecycle hook, or should we use prepack/postinstall?
   - Are we correctly understanding how npx caches git dependencies?

4. **TypeScript Distribution**
   - Should we ship `.d.ts` files for a CLI tool?
   - Is sourcemap generation necessary/wasteful for user installations?
   - Should we bundle dependencies (like esbuild does) vs external deps?

5. **Version Management**
   - Is warning on every command the wrong UX (should it be cached)?
   - Should we fail hard on major version mismatches vs warn?
   - Are there standard patterns for monorepo version coordination we're missing?

### Platform-Specific Gotchas
Please highlight any Windows/macOS/Linux-specific issues:
- Path separator handling in build scripts
- Shebang line requirements for bin executables
- File permission issues (chmod +x needed?)
- Case-sensitive filesystem differences

## 7. Integration Considerations

### Existing Workflows to Preserve
We MUST NOT break these:
- Contributors run `just build` → compiles all packages
- Contributors run `just cli-link` → symlinks CLI globally for development
- VS Code F5 debugging works for extension development
- `npm run test:integration` passes (MCP tests use real file operations)

### CI/CD Impact Assessment
Current CI/CD considerations:
- We use semantic-release for versioning (package.json in root)
- GitHub Actions runs tests on Linux only currently
- No existing npx installation testing (would be new)

### Migration Path Validation
If restructuring is needed:
- How do we communicate changes to existing users?
- Should we provide automated migration tooling?
- Can we maintain a compatibility shim temporarily?
- What's the rollback plan if npx installation fails in the wild?

### Future npm Registry Publishing
We plan to publish to npm registry eventually:
- Will the recommended structure work for both GitHub + npm?
- Are there any "prepare for npm" vs "install from GitHub" conflicts?
- Should we set up npm provenance/attestation now?
- What about package scope (@vsc-bridge vs vsc-bridge)?

## 8. Success Criteria Validation

Please validate our success criteria against modern standards:

**Our Criteria**:
1. `npx github:AI-Substrate/vsc-bridge <command>` works in <60s first run
2. Cached runs complete in <5s
3. No committed build artifacts (dist/ gitignored)
4. All CLI commands work identically (npx vs global vs local dev)
5. Existing contributor workflows unchanged
6. Builds succeed on Linux (Windows/macOS best-effort)

**Questions**:
- Is 60s acceptable in 2025, or is that too slow (what's industry standard)?
- Should we target smaller cache footprint (our build is ~50MB)?
- Are there performance optimizations we're missing?
- Should we provide pre-built binaries for instant installation?

## Expected Research Deliverables

Please provide:

1. **Architectural Recommendation**: Root vs sub-package CLI placement with rationale
2. **package.json Template**: Complete, production-ready configuration
3. **Build Pipeline Code**: Cross-platform prepare script with error handling
4. **Testing Strategy**: How to validate npx installation in CI/CD
5. **Migration Checklist**: If restructuring needed, step-by-step tasks
6. **Risk Assessment**: Any discovered risks not in our current analysis
7. **Reference Examples**: Links to 3-5 real projects doing this well
8. **Performance Benchmarks**: What's realistic for installation time/size

## Current Working Hypothesis

We believe the solution is:
1. Move CLI to root (restructure monorepo)
2. Use prepare script to build manifest + compile TypeScript
3. Keep dist/ gitignored (clean repo)
4. Accept 30-60s first install time (document it)
5. Major version bump for breaking change

**Please validate or challenge this approach** based on 2025 best practices and modern tooling.

---

**Research Timeline**: We're ready to implement once we confirm this is the idiomatic modern approach.
