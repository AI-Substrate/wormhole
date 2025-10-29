# Dev Container Configurations

This project supports multiple dev container configurations. VS Code will prompt you to choose one when opening the project.

## Available Configurations

### 🔧 Default
**Path:** `.devcontainer/default/`

Standard development configuration for working on the VSC-Bridge extension.

**Mounts:**
- `~/.ssh` - SSH keys
- `~/.opencode` - OpenCode configuration

---

### 🤖 Claude Mode
**Path:** `.devcontainer/claude-mode/`

Extended configuration for dogfooding - using VSC-Bridge with Claude Code to debug other projects.

**Additional Mounts:**
- `~/Library/Application Support/Claude` → `/home/node/.claude` - Claude Code settings and MCP configs
- `~/projects` → `/home/node/projects` - Access your local projects for debugging

**Permission Fix:** Automatically fixes Claude directory permissions during container creation to prevent `EACCES` errors when Claude CLI tries to create subdirectories.

---

## Switching Configurations

1. **Command Palette** (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type: `Dev Containers: Rebuild and Reopen in Container`
3. Select configuration when prompted

---

## Customizing Claude Mode

Edit `.devcontainer/claude-mode/devcontainer.json` to add more mounts:

```jsonc
"mounts": [
  // ... existing mounts ...
  "source=${localEnv:HOME}/work,target=/home/node/work,type=bind,consistency=cached"
]
```

**Platform Notes:**
- **macOS:** `~/Library/Application Support/Claude`
- **Linux:** `~/.config/Claude`
- **Windows:** `%APPDATA%/Claude`
