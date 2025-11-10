# Release-Please Integration

## Summary

Replace the current semantic-release workflow with release-please to enable automated version management and CHANGELOG generation that works within GitHub's branch protection constraints. The current semantic-release workflow fails because it attempts to push commits directly to the protected `main` branch, violating the PR-only ruleset.

Release-please solves this by creating "Release PRs" that contain version bumps and CHANGELOG updates. When these PRs are merged, they satisfy branch protection requirements while maintaining fully automated release workflows.

## Goals

- **Enable automated releases without bypassing branch protection** - All version changes go through PR review process
- **Maintain complete git history of version changes** - Version bumps and CHANGELOG updates are recorded via PR merge commits
- **Support conventional commit-based versioning** - Automatically determine version bumps (feat = minor, fix = patch, BREAKING = major pre-1.0)
- **Work within organization constraints** - Function despite org-level read-only GITHUB_TOKEN default policy
- **Eliminate Personal Access Token dependency** - Use GitHub App with minimal, scoped permissions instead
- **Provide clear audit trail** - All releases visible through PR review history and GitHub Releases

## Non-Goals

- **Publishing packages to registries** - Package publishing (npm, VS Code marketplace) handled by separate `publish-on-release` workflow
- **Custom versioning schemes** - Only conventional commits versioning supported (industry standard)
- **Multi-platform release automation** - Focus on GitHub Releases; other platforms out of scope
- **Modifying branch protection rules** - Work within existing PR-only ruleset without bypass configuration
- **Backward compatibility with semantic-release** - Clean migration, not hybrid approach; semantic-release will be completely removed

## Acceptance Criteria

1. **Release PR Creation**
   - GIVEN a conventional commit is merged to main
   - WHEN the release-please workflow runs
   - THEN a Release PR is created or updated with appropriate changes

2. **Accurate Version Bumping**
   - GIVEN commits of types: feat, fix, BREAKING CHANGE
   - WHEN Release PR is generated
   - THEN version bump follows conventional commits spec (feat→minor, fix→patch, BREAKING→major for ≥1.0 or minor for <1.0)

3. **CHANGELOG Generation**
   - GIVEN multiple commits since last release
   - WHEN Release PR is created
   - THEN CHANGELOG.md contains grouped changes by type with emoji section headers matching current format

4. **GitHub Release Creation**
   - GIVEN Release PR is merged to main
   - WHEN release-please detects the merge
   - THEN GitHub release is created with tag matching the new version

5. **Authentication Without PAT**
   - GIVEN organization enforces read-only GITHUB_TOKEN
   - WHEN release-please workflow uses GitHub App token
   - THEN workflow succeeds in creating/updating PRs

6. **Git History Preservation**
   - GIVEN Release PR is merged
   - WHEN examining git history
   - THEN version bump commit appears in main branch history with full CHANGELOG

7. **Branch Protection Compliance**
   - GIVEN PR-only ruleset on main branch
   - WHEN release workflow runs
   - THEN all changes go through PR process without protection violations

8. **End-to-End Automation**
   - GIVEN Release PR exists and is merged
   - WHEN merge completes
   - THEN GitHub release, tag, and artifact publishing complete without manual steps

## Risks & Assumptions

**Assumptions:**
- Organization allows GitHub App installations on repositories
- Repository admin can create and install GitHub Apps
- Team follows conventional commit format consistently
- Current CHANGELOG emoji format (🚀, 🐛, etc.) is acceptable for release-please output
- Merging Release PRs can happen on team's schedule (not time-critical)

**Risks:**
- **Manual merge required** - Release PRs require human decision to merge (not fully unattended)
  - *Mitigation*: Clear PR naming and labels make them easy to identify
- **Release PR accumulation** - Multiple changes may accumulate if PR not merged promptly
  - *Mitigation*: Team workflow includes regular Release PR review
- **GitHub App credential rotation** - Private key needs secure storage and occasional rotation
  - *Mitigation*: Use GitHub Secrets; document rotation procedure
- **Breaking change in release-please** - Dependency on external action maintained by Google
  - *Mitigation*: Pin to major version; monitor changelog; test updates in feature branch
- **Org policy changes** - Organization could restrict GitHub App permissions
  - *Mitigation*: Document fallback to PAT approach if needed

## Testing Strategy

- **Approach**: Manual Only
- **Rationale**: This is configuration-only work (GitHub workflows, GitHub App setup, semantic-release config changes)
- **Focus Areas**: Manual verification of workflow execution, Release PR creation, and GitHub release creation
- **Excluded**: Automated tests not needed for YAML/JSON configuration files
- **Mock Usage**: N/A (no programmatic tests)
- **Manual Verification Steps**:
  1. Verify release-please workflow triggers on push to main
  2. Verify Release PR is created with correct version bump and CHANGELOG
  3. Verify GitHub release is created when Release PR is merged
  4. Verify GitHub App authentication works (no PAT required)
  5. Verify branch protection compliance (no direct pushes to main)

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **Rationale**: Users need quick-start guidance in README, but detailed GitHub App setup and troubleshooting belongs in docs/how/
- **Content Split**:
  - **README.md**: Brief mention of automated releases, link to detailed docs
  - **docs/how/**: Complete setup guide for GitHub App, release-please configuration, troubleshooting
- **Target Audience**: Repository maintainers and contributors
- **Maintenance**: Update when release workflow changes or GitHub App permissions change

## Clarifications

### Session 2025-11-10

**Q1: Testing Strategy**
- **Answer**: Manual Only (D)
- **Rationale**: This is configuration-only work (GitHub workflows, GitHub App setup, semantic-release config changes)

**Q2: Semantic-Release Migration Strategy**
- **Answer**: Remove entirely (A)
- **Rationale**: Full release-please flow; clean break minimizes configuration complexity

**Q3: Release PR Auto-Merge Policy**
- **Answer**: Always manual (A)
- **Rationale**: Full human control over releases; team can merge on their schedule

**Q4: Publishing Workflow Separation**
- **Answer**: Single workflow (A)
- **Rationale**: Simpler configuration; all publishing in one place

**Q5: Pre-Release Version Handling**
- **Answer**: No pre-releases (A)
- **Rationale**: Only stable releases from main; skip beta/alpha complexity

**Q6: CHANGELOG Backward Compatibility**
- **Answer**: Start fresh from v1.0.0 (A)
- **Rationale**: Clean break; release-please owns CHANGELOG going forward

**Q7: GitHub App Scope**
- **Answer**: Organization-wide (B)
- **Rationale**: All apps in AI-Substrate will need releasing; reusable across repos with single setup

**Q8: Failure Handling**
- **Answer**: Both auto + manual (C)
- **Rationale**: Auto-retry on push covers most cases; manual dispatch enables immediate retry without dummy commit

---

### Clarification Coverage Summary

| Category | Status | Decision |
|----------|--------|----------|
| Testing Strategy | ✅ Resolved | Manual verification only (config-only work) |
| Documentation Strategy | ✅ Resolved | Hybrid (README + docs/how/) |
| Semantic-Release Migration | ✅ Resolved | Remove entirely; full release-please flow |
| Publishing Workflow | ✅ Resolved | Single workflow for all artifacts |
| Release PR Policy | ✅ Resolved | Always require manual merge approval |
| Pre-Release Versions | ✅ Resolved | No pre-releases; stable only from main |
| CHANGELOG Format | ✅ Resolved | Start fresh from v1.0.0 |
| GitHub App Scope | ✅ Resolved | Organization-wide for AI-Substrate |
| Failure Handling | ✅ Resolved | Auto-retry + manual dispatch option |

**Resolved:** 9/9 critical ambiguities
**Deferred:** 0
**Outstanding:** 0

## Open Questions

1. ~~**Semantic-release migration strategy**~~ ✅ **RESOLVED**
   - Remove semantic-release entirely
   - Release-please handles versioning + CHANGELOG
   - Publishing triggered by GitHub release event only

2. ~~**Publishing workflow separation**~~ ✅ **RESOLVED**
   - Single workflow for all publishing (VSIX + offline bundle)
   - Simpler configuration; triggered by GitHub release event
   - All artifacts published together

3. ~~**Release PR auto-merge**~~ ✅ **RESOLVED**
   - Always require manual approval
   - Team merges Release PRs on their schedule
   - No auto-merge automation needed

4. ~~**Pre-release version handling**~~ ✅ **RESOLVED**
   - No pre-releases; only stable releases from main
   - Simplifies release workflow; beta/alpha not needed currently

5. ~~**Backward compatibility**~~ ✅ **RESOLVED**
   - Start fresh from v1.0.0
   - Release-please generates CHANGELOG going forward
   - No migration of existing entries needed

6. ~~**GitHub App scope**~~ ✅ **RESOLVED**
   - Organization-wide GitHub App
   - Reusable across all AI-Substrate repositories
   - Single setup for entire organization

7. ~~**Failure handling**~~ ✅ **RESOLVED**
   - Auto-retry on next push to main
   - Manual workflow_dispatch trigger for immediate retry
   - Both automatic and manual recovery options available
