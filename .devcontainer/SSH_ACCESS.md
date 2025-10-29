# SSH Access to Dev Container

This Dev Container is configured with an SSH server, allowing remote access from other machines.

## Configuration

The container uses **manual SSH setup** (not the devcontainer sshd feature) for reliability:
- OpenSSH server installed directly via Dockerfile
- SSH port 22 mapped to host port 2222
- Port forwarding configured for VS Code/Codespaces
- Your host SSH keys mounted at `/home/node/.ssh`
- **Public key authentication only** (password authentication disabled)
- Root login disabled for security
- Passwordless sudo enabled for `node` user to start SSH service

### Why Manual Setup?

The `ghcr.io/devcontainers/features/sshd:1` feature can fail silently during container builds. This manual approach ensures SSH works reliably by explicitly installing and configuring OpenSSH in the Dockerfile.

### Critical Fix: Passwordless Sudo

The SSH auto-start script requires **passwordless sudo** because:
- `postStartCommand` runs as the `node` user (non-root)
- Starting SSH service requires root privileges
- Without passwordless sudo, the service won't start automatically
- The Dockerfile configures: `node ALL=(ALL) NOPASSWD: /usr/sbin/service ssh start`

## Connecting from Another Machine

### Local Development (Docker Desktop)

#### 1. Find Your Host IP Address

On your host machine, find the IP address:

```bash
# Linux/macOS
ip addr show  # or ifconfig
# Look for your network interface (e.g., eth0, wlan0)

# Windows
ipconfig
# Look for IPv4 Address
```

#### 2. Connect via SSH

From another machine, connect using:

```bash
ssh -p 2222 node@<host-ip-address>
```

For example:
```bash
ssh -p 2222 node@192.168.1.100
```

From localhost (same machine running Docker):
```bash
ssh -p 2222 node@localhost
```

### GitHub Codespaces

When using GitHub Codespaces, VS Code automatically forwards ports listed in `forwardPorts`.

#### 1. View Forwarded Ports

In VS Code Codespaces:
1. Open the **Ports** tab in the bottom panel
2. Find port **22** (SSH)
3. Copy the **Forwarded Address** (looks like: `https://username-repo-xxxxx.github.dev`)

#### 2. Connect via SSH

GitHub Codespaces forwards SSH through HTTPS. Use the forwarded URL:

```bash
# Get the forwarded address from VS Code Ports tab
# Example: https://username-repo-5xg4w6qp2vxxx-22.app.github.dev

# Connect using the forwarded address (remove https://, keep port in URL)
ssh node@username-repo-5xg4w6qp2vxxx-22.app.github.dev
```

**Note:** GitHub Codespaces uses port forwarding through their proxy, so you don't specify `-p 2222`.

### 3. Set Up VS Code Remote-SSH

1. Install the **Remote-SSH** extension in VS Code
2. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
3. Select "Remote-SSH: Add New SSH Host..."
4. Enter: `ssh -p 2222 node@<host-ip-address>`
5. Select the SSH config file to update (usually `~/.ssh/config`)
6. Connect to the host from Remote Explorer

Your SSH config will look like:

```ssh-config
Host vsc-bridge-devcontainer
    HostName <host-ip-address>
    User node
    Port 2222
    ForwardAgent yes
```

## Authentication

### Key-Based Authentication (Required)

This container uses **public key authentication only**. Password authentication is disabled for security.

**Setup:**
1. Your host SSH keys are automatically mounted into the container at `/home/node/.ssh`
2. Ensure your public key (e.g., `id_ed25519.pub`, `id_rsa.pub`) exists in the mounted directory
3. The container will recognize your mounted `authorized_keys` file automatically

**Verify your keys are mounted:**
```bash
# Inside the container
ls -la ~/.ssh/
# Should show: id_ed25519, id_ed25519.pub, authorized_keys, etc.
```

**If authorized_keys is missing:**
```bash
# Inside container
mkdir -p ~/.ssh
chmod 700 ~/.ssh
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys  # Or your key name
chmod 600 ~/.ssh/authorized_keys
```

## Security Notes

This configuration follows security best practices:

✅ **Public key authentication only** - No password guessing attacks
✅ **Root login disabled** - Prevents direct root access
✅ **SSH keys mounted from host** - Keys managed centrally
✅ **Non-standard host port** - Reduces automated attack surface

**Additional recommendations:**
1. **Restrict Access**: Only expose port 2222 on your local network
2. **Firewall**: Consider firewall rules to limit which machines can connect
3. **Key-based only**: Never enable password authentication in production

## Troubleshooting

### SSH Server Not Running

Check if SSH is running:
```bash
ps aux | grep sshd
# Should show: root ... /usr/sbin/sshd [listener]
```

Check SSH is listening on port 22:
```bash
sudo ss -tlnp | grep :22
# Should show: LISTEN on 0.0.0.0:22
```

**If SSH is not running, check:**

1. **Verify passwordless sudo is configured:**
   ```bash
   sudo cat /etc/sudoers.d/node-ssh
   # Should show: node ALL=(ALL) NOPASSWD: /usr/sbin/service ssh start
   ```

2. **Test passwordless sudo:**
   ```bash
   sudo service ssh start
   # Should NOT ask for password
   ```

3. **Start SSH manually if needed:**
   ```bash
   sudo service ssh start
   ```

4. **Verify configuration:**
   ```bash
   grep -E "^(PubkeyAuthentication|PasswordAuthentication|PermitRootLogin)" /etc/ssh/sshd_config
   # Should show:
   # PubkeyAuthentication yes
   # PasswordAuthentication no
   # PermitRootLogin no
   ```

### Connection Refused

1. Verify the container is running: `docker ps`
2. Check port mapping: `docker ps` should show `0.0.0.0:2222->22/tcp`
3. Verify firewall settings on host machine
4. Try connecting from host first: `ssh -p 2222 node@localhost`
5. Verify sshd is running inside container (see above)

### Permission Denied (publickey)

This means SSH is working but authentication failed:

1. **Check public key is in authorized_keys:**
   ```bash
   # Inside container
   cat ~/.ssh/authorized_keys
   # Should contain your public key
   ```

2. **Check SSH key permissions:**
   ```bash
   ls -la ~/.ssh/
   # authorized_keys should be 600 (rw-------)
   # .ssh directory should be 700 (rwx------)
   ```

3. **Fix permissions if needed:**
   ```bash
   chmod 700 ~/.ssh
   chmod 600 ~/.ssh/authorized_keys
   ```

4. **Verify ownership:**
   ```bash
   ls -la ~/.ssh/
   # Should be owned by node:node
   ```

5. **Test with verbose SSH from connecting machine:**
   ```bash
   ssh -v -p 2222 node@<host-ip>
   # Look for "Offering public key" and "Server accepts key" messages
   ```

6. **Check SSH logs inside container:**
   ```bash
   sudo tail -f /var/log/auth.log
   # Watch for authentication attempts and errors
   ```

### SSH Starts But Stops After Container Restart

1. **Verify postStartCommand is configured:**
   Check `.devcontainer/devcontainer.json` contains:
   ```json
   "postStartCommand": "/usr/local/share/ssh-init.sh"
   ```

2. **Check script exists and is executable:**
   ```bash
   ls -la /usr/local/share/ssh-init.sh
   # Should show: -rwxr-xr-x ... /usr/local/share/ssh-init.sh
   ```

3. **Manually run the script to test:**
   ```bash
   /usr/local/share/ssh-init.sh
   ps aux | grep sshd  # Verify sshd is running
   ```

## How This Works

The manual SSH setup uses four components:

1. **Dockerfile** - Installs `openssh-server` and `openssh-client`, configures sshd, creates auto-start script, enables passwordless sudo
2. **devcontainer.json** - Configures port mapping (2222:22), port forwarding, mounts SSH keys, runs auto-start script on startup
3. **ssh-init.sh** - Auto-start script at `/usr/local/share/ssh-init.sh` that launches sshd using `sudo service ssh start`
4. **Passwordless sudo** - Configured in `/etc/sudoers.d/node-ssh` to allow non-root user to start SSH

**Critical implementation details:**
- `postStartCommand` runs as `node` user (non-root)
- SSH service requires root privileges to start
- Solution: Passwordless sudo for `/usr/sbin/service ssh start` only
- Security: Only the specific SSH start command is allowed, not all commands

This approach is more reliable than devcontainer features because:
- Explicit ordering - Installation happens in defined build sequence
- No hidden dependencies - All steps visible in Dockerfile
- Build cache control - Docker caching works predictably
- Error visibility - Build failures are immediately obvious
- Reproducible - Same result every rebuild
- Handles privilege requirements - Properly configured sudo access

## Rebuilding the Container

After modifying `.devcontainer/devcontainer.json` or `.devcontainer/Dockerfile`, rebuild the container:

**Option A: VS Code**
1. Open Command Palette (Ctrl+Shift+P / Cmd+Shift+P)
2. Select "Dev Containers: Rebuild Container Without Cache"
3. Wait for the rebuild to complete
4. SSH should be available at port 2222

**Option B: CLI**
```bash
docker compose -f .devcontainer/compose.yml down  # If using compose
# Or for build-only setup:
docker stop <container-name>
docker rm <container-name>

# Rebuild without cache
docker build --no-cache -f .devcontainer/Dockerfile .
```

## Network Mode and Port Mapping

This configuration uses **bridge networking** with explicit port mappings (not `--network=host`).

**Current port mappings in devcontainer.json:**
```json
"runArgs": ["-p", "2222:22", "-p", "3001:3001"]
```

**To add more ports:**
```json
"runArgs": ["-p", "2222:22", "-p", "3001:3001", "-p", "8080:8080"]
```

This provides better isolation and security than host networking.
