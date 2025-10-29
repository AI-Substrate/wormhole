# Offline Installation Bundle

## Summary

A complete, self-contained installation package for vsc-bridge that enables distribution and installation without internet access. The bundle combines the VS Code extension (VSIX), CLI package with all dependencies, and automated installation scripts into a single archive that can be shared via instant messaging, email, USB drives, or other offline channels.

**What:** A build process that produces a single distributable archive containing VSIX, npm CLI package (with dependencies), installation scripts (.sh and .ps1), and documentation.

**Why:** Enable vsc-bridge adoption in air-gapped environments, corporate networks with restricted registry access, and scenarios where developers need to quickly share a complete working installation with colleagues without requiring access to VS Code Marketplace or npm registry.

## Testing Strategy

**Approach:** Manual Only

**Rationale:** This is a packaging and installation feature with straightforward success criteria. Manual verification ("does it work, does it have the right files") is sufficient to validate the bundle contents and installation process without the overhead of automated tests.

**Focus Areas:**
- Bundle contains all required files (VSIX, npm tarball, install scripts, README)
- Installation scripts execute successfully on target platforms (Windows, macOS, Linux)
- Installed components are functional (`vscb --version`, `code --list-extensions`)
- Offline installation works without internet connectivity

**Excluded:**
- Unit tests for bundling logic
- Integration tests for installation scripts
- Automated e2e installation testing across platforms

**Verification Process:**
1. Build bundle with `just package-offline`
2. Extract and inspect bundle contents manually
3. Test installation on clean VM/container for each platform
4. Verify installed CLI and extension work correctly
5. Test upgrade scenario from previous version

**Mock Usage:** N/A (manual testing only)

## Documentation Strategy

**Location:** README.md only

**Rationale:** Users need quick access to offline bundle creation and usage instructions in the main README. The feature is straightforward enough to not require separate detailed guides.

**Content:**
- How to create offline bundle: `just package-offline`
- Where to find the bundle: `artifacts/vsc-bridge-offline-<version>.tar.gz`
- Basic installation steps (extract, run installer script)
- Link to bundled README.txt for detailed installation instructions
- Troubleshooting common issues (VS Code CLI not in PATH, npm permissions)

**Target Audience:**
- Developers who need to share vsc-bridge with colleagues
- DevOps teams deploying to air-gapped environments
- Enterprise users with registry restrictions

**Maintenance:** Update README.md when offline bundle structure or usage changes (e.g., new installation options, different archive format)

## Goals

1. **Single-file distribution**: Produce one archive file that contains everything needed for complete installation
2. **Mostly-offline capability**: VSIX installs completely offline; CLI installation requires internet access for npm dependencies (standard npm pack approach for smaller bundle size)
3. **Cross-platform support**: Work seamlessly on Windows (PowerShell), macOS (Bash), and Linux (Bash)
4. **Idempotent installation**: Support both fresh installations and upgrades from existing versions
5. **Developer convenience**: Allow developers to quickly package and share vsc-bridge via IM/email/Slack (smaller ~5-10 MB bundle)
6. **Enterprise-ready**: Support corporate environments with npm registry access (bundle avoids VS Code Marketplace dependency)
7. **Automated installation**: Provide one-command installation experience with clear status reporting
8. **Version verification**: Ensure installed components match expected versions and work together

## Non-Goals

1. **Auto-update mechanism**: This is for offline distribution; updates require obtaining a new bundle
2. **Digital signatures/code signing**: Security signing is important but deferred to future enhancement
3. **GUI installer**: Command-line scripts only; no graphical installation wizard
4. **Bundling Node.js/VS Code**: Assumes prerequisites (Node.js >=18, npm, VS Code) are already installed
5. **Configuration customization**: Installation uses default settings; configuration happens post-install
6. **Uninstaller scripts**: Manual uninstall via standard VS Code/npm mechanisms (may be added later)
7. **Delta updates**: Each bundle is complete; no incremental update support
8. **Binary compilation**: Uses standard npm package format, not compiled executables (e.g., pkg/nexe)
9. **Fully air-gapped installation**: CLI installation requires npm registry access for dependencies; only VSIX is truly offline (chosen for smaller bundle size ~5-10 MB vs ~20-50 MB with bundled node_modules)

## Acceptance Criteria

1. **Build produces complete bundle:**
   - Running `just package-offline` creates single archive file `artifacts/vsc-bridge-offline-<version>.zip`
   - Archive contains: VSIX file, npm CLI tarball (.tgz), install.sh, install.ps1, and README.txt
   - Archive size target: ~5-10 MB (VSIX + npm tarball without node_modules)
   - Archive can be created in both CI (semantic version) and local dev (hash version) environments

2. **Fresh installation succeeds:**
   - User extracts bundle on system with Node.js, npm, and VS Code installed
   - User runs `./install.sh` (or `install.ps1` on Windows) with internet connection for npm dependencies
   - VSIX extension installs offline; CLI package installs via `npm install -g <tarball>` (downloads dependencies from registry)
   - Running `code --list-extensions` shows vsc-bridge extension
   - Running `vscb --version` shows correct version
   - Installation completes successfully with all dependencies resolved

3. **Upgrade installation detects and updates:**
   - System has older version of vsc-bridge already installed
   - Installer detects existing installation and displays: "Found vsc-bridge v1.2.3, upgrading to v1.4.0..."
   - Installer automatically upgrades both extension and CLI to bundle version (no confirmation prompt)
   - Previous version is cleanly replaced (no duplicate installations)
   - Installer displays final status: "Successfully upgraded from v1.2.3 → v1.4.0"

4. **Installation script validates prerequisites:**
   - Script checks for Node.js >=18 and reports error if missing/too old
   - Script checks for npm and reports error if missing
   - Script checks for VS Code CLI (`code` command) and provides helpful guidance if missing
   - Script reports version information for all detected prerequisites

5. **Installation verifies success:**
   - After installation, script runs `vscb --version` to confirm CLI works
   - Script runs `code --list-extensions` to confirm extension installed
   - Script reports clear success/failure status with next steps
   - Does NOT test bridge connection (requires Extension Host - tested by user on first use)

6. **Cross-platform compatibility:**
   - Bash installer (`install.sh`) works on macOS and Linux without modification
   - PowerShell installer (`install.ps1`) works on Windows 10/11
   - Both installers produce consistent behavior and output formatting
   - Archive format (.zip) is extractable natively on all platforms (Windows Explorer, macOS Finder, Linux unzip)

7. **Clear documentation included:**
   - `README.txt` in bundle explains prerequisites, installation steps, and troubleshooting
   - Installation scripts output helpful messages at each step
   - Error messages include actionable guidance (not just "failed")

8. **Handles edge cases gracefully:**
   - VS Code CLI (`code`) not in PATH: provides instructions for adding it
   - npm global bin directory not in PATH: provides shell configuration guidance
   - Permission errors: suggests using sudo or checking file permissions
   - Multiple VS Code installations (code vs code-insiders): prefers stable `code`; displays which was used

## Risks & Assumptions

### Assumptions

1. **Prerequisites installed:** User has Node.js >=18, npm, and VS Code already installed on target system
2. **Installation permissions:** User has sufficient permissions to install VS Code extensions and npm global packages
3. **Extraction tools available:** User can extract `.tar.gz` (or chosen format) using standard OS tools
4. **Shell access:** User can run bash/PowerShell scripts (not blocked by corporate policy)
5. **CLI dependencies are bundleable:** All npm dependencies can be packaged offline without requiring registry access during installation
6. **VSIX is self-contained:** VS Code extension has no runtime dependencies beyond VS Code itself

### Risks

1. **Bundle size:** Including node_modules for CLI may create large archives (20-50 MB), which could be problematic for IM/email sharing with attachment limits
   - *Mitigation:* Provide both standard and "full offline" bundle variants, or optimize dependency tree

2. **npm global path varies by platform:** Different operating systems and npm configurations use different global installation paths, which may not be in user's PATH
   - *Mitigation:* Installation script detects npm global bin and provides shell config guidance

3. **VS Code CLI availability:** The `code` command may not be in PATH, especially on macOS where it requires manual setup
   - *Mitigation:* Detect and provide clear instructions; consider supporting manual VSIX path specification

4. **Windows execution policy:** PowerShell scripts may be blocked by default execution policy
   - *Mitigation:* Document execution policy adjustment; provide alternative commands

5. **Version compatibility:** Bundle may contain VSIX and CLI with different version numbers if builds are out of sync
   - *Mitigation:* Build process ensures both are from same version; verification step in installer

6. **Concurrent installations:** User may have installed vscb via different methods (npx, npm link, global install) causing conflicts
   - *Mitigation:* Detect and warn about multiple installation methods; guide user to clean install

## Design Decisions (Defaults)

The following decisions were made using sensible defaults without requiring clarification:

1. **Verification depth:** Simple checks only
   - Installer verifies commands exist (`vscb --version`, `code --list-extensions`)
   - Does NOT test bridge connection (requires Extension Host running - not guaranteed during install)
   - Rationale: Installation is not the right time for functional testing; users will discover issues on first use

2. **Multiple VS Code installations:** Prefer stable `code`
   - If both `code` and `code-insiders` exist, installer uses `code` (stable version)
   - Rationale: Most users use stable VS Code; advanced users can manually install to Insiders if needed
   - Installer displays which VS Code binary was used: "Installing extension to VS Code (code)"

3. **Bundled documentation:** Installation instructions only
   - README.txt contains: prerequisites, installation steps, verification, troubleshooting
   - Points to repo README.md for full usage documentation
   - Does NOT duplicate usage guides or MCP documentation
   - Rationale: Installation bundle is for getting started; full docs live in repo

4. **Version communication:** Full semantic version in filename
   - Bundle filename: `vsc-bridge-offline-1.2.3.zip` (full semver)
   - Follows existing VSIX naming pattern (consistent)
   - Each build overwrites previous version in artifacts/ (no accumulation)

5. **CI/CD integration:** Manual only (Phase 1)
   - Initial implementation: `just package-offline` for manual distribution
   - Future enhancement: Integrate with semantic-release to auto-attach to GitHub releases
   - Rationale: Start simple, add automation once proven useful

## Clarifications

### Session 2025-10-25

**Q1: What testing approach best fits this feature's complexity and risk profile?**

Answer: Manual Only - "very basic -> does it work, does it have the right files in it etc... eyeball it"

Rationale: This is a straightforward packaging feature where manual verification of bundle contents and installation process is sufficient. No need for automated test overhead.

Impact: Added Testing Strategy section with manual verification process (build, inspect, test on platforms, verify functionality).

---

**Q2: Where should this feature's documentation live?**

Answer: README.md only

Rationale: Users need quick access to offline bundle creation and usage. Feature is straightforward - no need for separate docs/how/ guide.

Impact: Added Documentation Strategy section. Will add section to README.md with: `just package-offline` command, bundle location, basic install steps, troubleshooting tips.

---

**Q3: How should npm dependencies be bundled for offline installation?**

Answer: Standard npm pack (smaller)

Rationale: Smaller bundle size (~5-10 MB vs ~20-50 MB) is better for IM/email sharing. CLI installation via `npm install -g <tarball>` will download dependencies from registry during install.

Impact:
- Changed Goal #2 from "True offline" to "Mostly-offline" (VSIX offline, CLI needs internet for deps)
- Added Non-Goal #9: Clarified not fully air-gapped
- Updated acceptance criteria to reflect internet needed for npm dependency installation
- Bundle size target: ~5-10 MB (was ~20-50 MB)

---

**Q4: What archive format should the offline bundle use?**

Answer: .zip (Windows-friendly)

Rationale: Native extraction on all platforms including Windows (no special tools needed). Slightly larger than tar.gz but better cross-platform UX.

Impact:
- Bundle filename: `artifacts/vsc-bridge-offline-<version>.zip`
- Updated acceptance criteria #1 and #6 to reflect .zip format
- Build process will use zip utility instead of tar

---

**Q5: How should the installer handle upgrades when vsc-bridge is already installed?**

Answer: Show info and auto-upgrade

Rationale: Display current and new versions to inform user, then automatically upgrade. Balances awareness with convenience - no friction but user knows what happened.

Impact:
- Updated acceptance criteria #3: Installer displays version info ("Found v1.2.3, upgrading to v1.4.0...") then auto-upgrades
- No confirmation prompt required (enables automated/scripted usage)
- Final status shows upgrade path: "Successfully upgraded from v1.2.3 → v1.4.0"

---

**Q6: How should the CLI package be installed from the tarball?**

Answer: Use npm install -g <tarball>

Rationale: Standard npm approach is simple, reliable, and handles PATH configuration automatically. npm is already a prerequisite for installation.

Impact:
- Installation script will use: `npm install -g vsc-bridge-<version>.tgz`
- Leverages existing npm global install infrastructure
- PATH handling is automatic (npm manages symlinks)

---

## Clarification Summary

**Questions Asked:** 6 of 8 allowed
**Total Open Questions:** 9 initial → 0 remaining

### Coverage:

| Category | Status | Decision |
|----------|--------|----------|
| **Testing Strategy** | ✅ Resolved (Q1) | Manual verification only |
| **Documentation Strategy** | ✅ Resolved (Q2) | README.md only |
| **Dependency Bundling** | ✅ Resolved (Q3) | Standard npm pack (no node_modules) |
| **Archive Format** | ✅ Resolved (Q4) | .zip (Windows-friendly) |
| **Upgrade Behavior** | ✅ Resolved (Q5) | Show info + auto-upgrade |
| **CLI Installation Method** | ✅ Resolved (Q6) | npm install -g <tarball> |
| **Verification Depth** | ✅ Resolved (Default) | Simple checks only |
| **Multiple VS Code** | ✅ Resolved (Default) | Prefer stable `code` |
| **Bundled Documentation** | ✅ Resolved (Default) | Installation instructions only |
| **Version Communication** | ✅ Resolved (Default) | Full semver in filename |
| **CI/CD Integration** | ✅ Resolved (Default) | Manual only (Phase 1) |

### Outstanding Issues: None

All critical ambiguities resolved. Spec is ready for architecture phase (/plan-3-architect).
