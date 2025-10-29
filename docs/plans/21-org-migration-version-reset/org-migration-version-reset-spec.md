# Organization Migration and Version Reset

## Summary

Migrate repository metadata from `AI-Substrate/vsc-bridge` to `AI-Substrate/wormhole` and reset version numbering to 0.1.0 with standard 0.x.y semantic versioning. This provides a clean slate for the new organization while maintaining automated release capabilities with proper breaking change signals.

## Goals

- Update all repository references to new organization (AI-Substrate)
- Reset version to 0.1.0 for fresh start in new org
- Configure standard 0.x.y versioning: breaking/features → minor (0.1.0 → 0.2.0), fixes → patch (0.1.0 → 0.1.1)
- Maintain automated release workflow with semantic-release
- Enable semantic-release to commit to protected main branch (via documentation)

## Non-Goals

- Preserving git tag history (fresh start is intentional)
- Complex versioning schemes with prerelease tags or build metadata
- Manual version management (keep automation)
- Migrating existing GitHub issues/PRs (handled separately if needed)
- Configuring branch protection (separate task, instructions provided)

## Acceptance Criteria

1. All package.json files reference `AI-Substrate/wormhole` URLs
2. Extension publisher set to `AI-Substrate`
3. Version set to `0.1.0` in root and extension package.json
4. Semantic-release configured for standard 0.x.y versioning (breaking/feat → minor, fix/refactor → patch)
5. Build succeeds with new configuration (`just build`)
6. CHANGELOG updated with migration notice
7. Documentation provided for configuring branch protection bypass (separate from this migration)

## Risks & Assumptions

**Risks:**
- Breaking CI/CD if branch protection not configured correctly
- VS Code Marketplace may reject publisher change (needs verification)
- Users may be confused by version reset to 0.0.x

**Assumptions:**
- No existing git tags to clean up (confirmed: repository is clean)
- GitHub repository already migrated to AI-Substrate org
- Team has admin access to configure branch protection bypass

## Testing Strategy

**Approach**: Manual Only

**Rationale**: This is chore work - metadata and configuration updates with no new logic or algorithms.

**Verification Steps**:
- Build succeeds (`just build`)
- Version numbers correct in package.json files
- GitHub Actions workflow runs without errors
- Semantic-release can create releases with new configuration

**Excluded**: No automated tests needed for configuration changes.

## Open Questions

None remaining.

## Documentation Strategy

**Location**: docs/how/ only

**Rationale**: Document semantic versioning basics and semantic-release commit conventions with simplicity in mind.

**Content**:
- Common commit types (feat, fix, chore, etc.) and how they affect versioning
- Standard 0.x.y versioning rules (breaking/feat → minor, fix → patch)
- Branch protection bypass setup for semantic-release
- Simple reference guide for contributors
- Note: Major versions (1.0.0+) reserved for manual milestones only

**Target Audience**: Contributors and maintainers

**Maintenance**: Update when versioning policy changes

## Clarifications

### Session 2025-10-22

**Q1: Testing approach?**
- Answer: D (Manual Only)
- Rationale: No TDD, this is just chore work

**Q2: Documentation strategy?**
- Answer: B (docs/how/ only)
- Rationale: Just have basics on semver and semantic-release, write some rules on what the common commit things are and how they work. Simplicity is key.

**Q3: Migration notice in README.md?**
- Answer: No
- Rationale: Ignore this, no notice needed

**Q4: Unpublish old extensions from VS Code Marketplace?**
- Answer: No, there are none
- Rationale: Extension not yet published to Marketplace

**Q5: Branch protection timeline?**
- Answer: D (No specific timeline)
- Rationale: Will enable later today, but not tied to this migration. Need instructions provided in documentation.

**Q6: Versioning strategy refinement (from didyouknow Insight #4)?**
- Answer: Standard 0.x.y versioning (breaking/feat → minor, fix → patch)
- Rationale: Enables semantic signaling for breaking changes while staying conservative in 0.x range. Major versions (1.0.0+) reserved for manual "big party" milestones only.
