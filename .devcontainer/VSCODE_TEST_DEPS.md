# VS Code Extension Test Dependencies

**Issue**: Running `npm run test:extension` failed with library error in devcontainer.

## Problem

VS Code integration tests require a full Electron instance, which needs GUI libraries even in headless mode. The minimal devcontainer base image lacks these libraries.

**Error**:
```
libdbus-1.so.3: cannot open shared object file: No such file or directory
```

## Solution

### Files Modified

1. **`.devcontainer/install-vscode-test-deps.sh`** (created)
   - Installs 13 required system packages for VS Code/Electron
   - Run automatically during devcontainer setup

2. **`.devcontainer/post-install.sh`** (updated)
   - Calls `install-vscode-test-deps.sh` during Phase 2 (Dependencies Installation)

3. **`package.json`** (root, updated)
   - Changed `test:extension` to use `xvfb-run -a vscode-test`
   - Provides virtual display for headless testing

### Libraries Installed

Required for VS Code Electron runtime:
- `libasound2` - Audio library
- `libatk-bridge2.0-0` - Accessibility bridge
- `libatk1.0-0` - Accessibility toolkit
- `libatspi2.0-0` - Assistive Technology Service Provider
- `libdbus-1-3` - D-Bus message bus (the missing library)
- `libgbm1` - Generic Buffer Management
- `libgtk-3-0` - GTK3 GUI toolkit
- `libxcomposite1` - X11 Composite extension
- `libxdamage1` - X11 Damage extension
- `libxfixes3` - X11 Fixes extension
- `libxrandr2` - X11 RandR extension
- `libxkbcommon0` - Keyboard handling
- `xvfb` - X Virtual Framebuffer

## Usage

### Running Tests

```bash
# Extension unit tests (fs-bridge, no VS Code needed)
just test-extension

# VS Code integration tests (requires GUI libraries)
npm run test:extension
```

### Manual Installation

If rebuilding container is not desired:

```bash
bash .devcontainer/install-vscode-test-deps.sh
```

## Technical Details

- **Why needed**: VS Code uses Electron (Chromium browser engine) which requires GUI libraries even for headless testing
- **Overhead**: ~50MB additional packages, ~60s install time
- **CI Alignment**: Matches GitHub Actions workflow which already installs these dependencies

## References

- Issue discovered during Plan 16 Phase 3 testing
- Fixed: 2025-10-19
- Related: `.github/workflows/pull-request.yml` (CI already has these libraries)
