# PR Quality Gates

## Summary

Automated pre-merge validation checks that run on every pull request to ensure code quality before merge. The system validates that the project builds successfully, tests pass, the npm package installs correctly, and the CLI functions properly. Test results are surfaced in GitHub's UI for immediate developer feedback. Release automation PRs (from release-please) are exempted to avoid slowing the release process.

**User Value**: Catch breaking changes early, protect main branch stability, and give reviewers confidence that basic functionality works before they invest time in code review.

## Goals

- **Prevent broken builds from reaching main** – Automatically block PRs that don't compile/build
- **Catch test failures before merge** – Surface test failures in GitHub UI so developers can fix issues immediately
- **Validate distribution pipeline** – Ensure the npm package can be installed as end users would install it
- **Verify CLI functionality** – Confirm the `vscb` CLI works after changes (basic smoke test)
- **Actionable failure feedback** – Make it easy for developers to understand why checks failed and where to look
- **Fast-track release PRs** – Allow release-please automation to proceed without unnecessary quality gates

## Non-Goals

- Post-merge deployment or publishing automation (satisfied with existing workflow)
- Code coverage enforcement or coverage reporting
- Linting, formatting, or code style checks
- Security vulnerability scanning
- Documentation completeness validation
- Performance benchmarking or regression testing
- Multi-platform testing across different operating systems (unless determined necessary)

## Acceptance Criteria

**AC1: Build Validation**
When a developer pushes code that breaks the build, the PR shows a failed "Build" check in GitHub, and the compilation errors are visible in the GitHub Actions log.

**AC2: Test Validation with GitHub UI Reporting**
When a developer pushes code that causes test failures, the PR shows:
- A failed "Test" check in the GitHub status checks section
- Test failures rendered in GitHub's UI using test annotations/reporters
- Clear indication of which tests failed and why

**AC3: Package Installation Validation**
When a developer pushes code that breaks the npm package structure, the PR shows a failed "Install" check with details about why installation failed (missing files, broken package.json, etc.).

**AC4: CLI Functionality Validation**
When a developer pushes code that breaks the CLI, the PR shows a failed "CLI Check" with the error output from running `vscb script list`.

**AC5: All-Pass Indication**
When all validation steps pass, the PR shows green checkmarks next to each check, clearly indicating the PR is ready for human review.

**AC6: Release-Please Exemption**
When release-please opens a PR (version bump, changelog update), the quality gate checks are skipped entirely, and the PR can be merged without waiting for build/test/install validation.

**AC7: Merge Protection**
When quality gate checks are failing, GitHub prevents the PR from being merged (enforced via required status checks in branch protection rules).

## Risks & Assumptions

**Risks:**
- **CI/Local Environment Mismatch**: CI environment might have different Node versions, OS, or dependencies than local development, causing false positives or false negatives
- **Flaky Network Operations**: npm install step could fail intermittently due to network issues or registry downtime
- **Slow CI Feedback**: Long-running checks could frustrate developers if they have to wait 10+ minutes for results
- **Misconfigured Exemptions**: Incorrect release-please detection could either block release PRs or allow non-release PRs to skip checks

**Assumptions:**
- GitHub Actions is the CI/CD platform
- The project uses "just" as the task runner/build tool
- Release-please is configured and actively creating PRs
- The project structure supports `npm pack` and installation from tarball
- Test framework outputs can be consumed by GitHub Actions test reporters

## Open Questions

**Q1: Release-Please PR Detection**
[NEEDS CLARIFICATION: How should we identify release-please PRs to exempt them?]
- Option A: Check if PR author is `github-actions[bot]`
- Option B: Check if branch name matches pattern like `release-please--*`
- Option C: Check for specific PR labels applied by release-please
- Option D: Combination of author + branch pattern for robustness

**Q2: Dependency Caching Strategy**
[NEEDS CLARIFICATION: Should we cache node_modules and build artifacts?]
- Caching could speed up CI by 30-60 seconds per run
- Need to balance speed vs. cache invalidation complexity
- Consider cache key strategy (lock file hash? package.json hash?)

**Q3: Node.js Version Matrix**
[NEEDS CLARIFICATION: Which Node.js version(s) should we test against?]
- Single version (e.g., Node 18 LTS) for speed
- Multiple versions (e.g., 18, 20, 22) for compatibility
- What is the minimum supported Node version for this project?

**Q4: Multi-Platform Testing**
[NEEDS CLARIFICATION: Should we validate on multiple operating systems?]
- Linux only (fastest, cheapest)
- Linux + macOS (cover most developers)
- Linux + macOS + Windows (comprehensive but slow/expensive)
- Are there known platform-specific issues in this codebase?

**Q5: Timeout Configuration**
[NEEDS CLARIFICATION: What timeout limits for each step?]
- Build step: 5 minutes? 10 minutes?
- Test step: 10 minutes? 15 minutes?
- Install validation: 3 minutes? 5 minutes?
- CLI check: 1 minute? 2 minutes?

**Q6: Installation Test Isolation**
[NEEDS CLARIFICATION: Where should we test npm package installation?]
- In the same workspace after build (faster, less realistic)
- In a separate temporary directory (more realistic, simulates user experience)
- In a Docker container (most realistic, but slower)

**Q7: Test Reporter Implementation**
[NEEDS CLARIFICATION: Which GitHub Actions test reporting mechanism?]
- Built-in GitHub Actions annotations (`console.log` with special syntax)
- Third-party action like `dorny/test-reporter` or `EnricoMi/publish-unit-test-result-action`
- Vitest's built-in GitHub Actions reporter
- JUnit XML output consumed by GitHub
