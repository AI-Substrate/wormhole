################################################################################
#                                                                              #
#   VSC-BRIDGE OFFLINE INSTALLER                                              #
#   READ THIS!                                                                 #
#                                                                              #
################################################################################
#
#  PREREQUISITES REQUIRED:
#  =======================
#   * Node.js >= 18.0.0
#   * npm (comes with Node.js)
#   * Visual Studio Code
#   * Internet connection for CLI dependencies
#
#  IMPORTANT:
#  ==========
#   * Extension installs COMPLETELY OFFLINE
#   * CLI installation REQUIRES INTERNET for npm dependencies
#   * Use -ExecutionPolicy Bypass flag to run this script
#
#  See README.txt for full installation guide
#
################################################################################
#
# install-vscb-offline.ps1 - Install vsc-bridge from offline bundle
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1                 # Install both CLI and extension
#   powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1 -InstallCli     # Install CLI only
#   powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1 -InstallVsix    # Install extension only
#
################################################################################

param(
    [switch]$InstallCli,
    [switch]$InstallVsix,
    [switch]$Help
)

$ErrorActionPreference = 'Stop'

# Helper functions for colored output
function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-InfoMsg {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

# Show help if requested
if ($Help) {
    Write-Host "Usage: powershell -ExecutionPolicy Bypass -File install-vscb-offline.ps1 [OPTIONS]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -InstallCli     Install CLI only"
    Write-Host "  -InstallVsix    Install VS Code extension only"
    Write-Host "  -Help           Show this help message"
    Write-Host ""
    Write-Host "Default: Install both CLI and extension"
    exit 0
}

# Component selection logic (T012b)
if ($InstallCli -and $InstallVsix) {
    Write-ErrorMsg "Cannot specify both -InstallCli and -InstallVsix"
    Write-Host "Run with -Help for usage information"
    exit 1
}

$INSTALL_CLI = $true
$INSTALL_VSIX = $true

if ($InstallCli) {
    $INSTALL_CLI = $true
    $INSTALL_VSIX = $false
}

if ($InstallVsix) {
    $INSTALL_CLI = $false
    $INSTALL_VSIX = $true
}

# Function: Validate-Node (T013)
function Validate-Node {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-ErrorMsg "Node.js is not installed"
        Write-Host ""
        Write-Host "Please install Node.js (>=18.0.0) from:"
        Write-Host "  https://nodejs.org/"
        exit 1
    }

    $nodeVersion = (node --version) -replace 'v', ''
    $nodeMajor = [int]($nodeVersion.Split('.')[0])

    if ($nodeMajor -lt 18) {
        Write-ErrorMsg "Node.js version $nodeVersion is too old"
        Write-Host ""
        Write-Host "Required: Node.js >=18.0.0"
        Write-Host "Current:  Node.js $nodeVersion"
        Write-Host ""
        Write-Host "Please upgrade Node.js from: https://nodejs.org/"
        exit 1
    }

    Write-Success "Node.js $nodeVersion"
}

# Function: Validate-Npm (T014)
function Validate-Npm {
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-ErrorMsg "npm is not installed"
        Write-Host ""
        Write-Host "npm should be installed with Node.js"
        Write-Host "Please reinstall Node.js from: https://nodejs.org/"
        exit 1
    }

    $npmVersion = npm --version
    Write-Success "npm $npmVersion"
}

# Function: Get-VSCodeCLI (T019)
function Get-VSCodeCLI {
    $script:CODE_CMD = $null

    if (Get-Command code.cmd -ErrorAction SilentlyContinue) {
        $script:CODE_CMD = "code.cmd"
    }
    elseif (Get-Command code-insiders.cmd -ErrorAction SilentlyContinue) {
        $script:CODE_CMD = "code-insiders.cmd"
    }
    elseif (Test-Path "C:\Program Files\Microsoft VS Code\bin\code.cmd") {
        $script:CODE_CMD = "C:\Program Files\Microsoft VS Code\bin\code.cmd"
    }
    elseif (Test-Path "C:\Program Files (x86)\Microsoft VS Code\bin\code.cmd") {
        $script:CODE_CMD = "C:\Program Files (x86)\Microsoft VS Code\bin\code.cmd"
    }
    else {
        Write-ErrorMsg "VS Code CLI not found"
        Write-Host ""
        Write-Host "Please install VS Code and ensure the CLI is available:"
        Write-Host "  1. Download from: https://code.visualstudio.com/"
        Write-Host "  2. During installation, check 'Add to PATH'"
        Write-Host "  3. Or manually add VS Code bin directory to PATH"
        exit 1
    }
}

# Function: Validate-VSCodeCLI (T014)
function Validate-VSCodeCLI {
    Get-VSCodeCLI
    if ($script:CODE_CMD) {
        Write-Success "VS Code CLI: $script:CODE_CMD"
    }
}

# Function: Get-CurrentVersion (T015)
function Get-CurrentVersion {
    # Try npm list first (most reliable)
    try {
        $npmList = npm list -g vsc-bridge --depth=0 2>&1 | Out-String
        if ($npmList -match 'vsc-bridge@(\S+)') {
            return $matches[1]
        }
    }
    catch {
        # Ignore errors, try fallback
    }

    # Fallback to vscb --version
    if (Get-Command vscb -ErrorAction SilentlyContinue) {
        try {
            $version = (vscb --version 2>&1 | Select-Object -First 1)
            if ($version) {
                return $version.Trim()
            }
        }
        catch {
            # Ignore errors
        }
    }

    return "not-installed"
}

# Function: Show-VersionMessage (T016)
function Show-VersionMessage {
    # Extract versions from bundle filenames
    $vsixFile = Get-ChildItem -Path . -Filter "vsc-bridge-*.vsix" | Select-Object -First 1
    if (-not $vsixFile) {
        Write-ErrorMsg "VSIX file not found in current directory"
        Write-Host "Expected: vsc-bridge-*.vsix"
        exit 1
    }
    $vsixVersion = $vsixFile.Name -replace '^vsc-bridge-', '' -replace '\.vsix$', ''

    $tarballFile = Get-ChildItem -Path . -Filter "vsc-bridge-*.tgz" | Select-Object -First 1
    if (-not $tarballFile) {
        Write-ErrorMsg "CLI tarball not found in current directory"
        Write-Host "Expected: vsc-bridge-*.tgz"
        exit 1
    }
    $cliVersion = $tarballFile.Name -replace '^vsc-bridge-', '' -replace '\.tgz$', ''

    # Detect current installation
    $currentVersion = Get-CurrentVersion

    Write-Host ""
    # Display appropriate message based on build type and current state
    if ($currentVersion -eq "not-installed") {
        # Fresh install
        if ($vsixVersion -match '^0\.0\.1-[a-f0-9]{8}$') {
            Write-InfoMsg "Fresh installation from LOCAL DEV BUILD"
            Write-InfoMsg "  Extension: v$vsixVersion"
            Write-InfoMsg "  CLI: v$cliVersion"
        }
        else {
            Write-InfoMsg "Fresh installation of vsc-bridge v$cliVersion"
        }
    }
    else {
        # Upgrade
        if ($vsixVersion -match '^0\.0\.1-[a-f0-9]{8}$') {
            Write-InfoMsg "Installing LOCAL DEV BUILD from bundle..."
            Write-InfoMsg "  Current: v$currentVersion"
            Write-InfoMsg "  Extension: v$vsixVersion"
            Write-InfoMsg "  CLI: v$cliVersion"
        }
        else {
            Write-InfoMsg "Found vsc-bridge v$currentVersion, upgrading to v$cliVersion..."
        }
    }
    Write-Host ""
}

# Function: Cleanup-NpmLink (T017)
function Cleanup-NpmLink {
    $npmPrefix = npm config get prefix
    $linkPath = Join-Path $npmPrefix "node_modules\vsc-bridge"

    # Also check APPDATA location
    if (-not (Test-Path $linkPath)) {
        $linkPath = Join-Path $env:APPDATA "npm\node_modules\vsc-bridge"
    }

    if (Test-Path $linkPath) {
        $item = Get-Item $linkPath
        if ($item.LinkType -eq "SymbolicLink" -or $item.Attributes -match "ReparsePoint") {
            Write-WarningMsg "Found npm link symlink (development installation)"
            Write-InfoMsg "Removing symlink to install from bundle..."
            npm unlink -g vsc-bridge 2>$null
        }
    }

    # Check if vsc-bridge is globally installed
    $npmList = npm list -g vsc-bridge --depth=0 2>&1 | Out-String
    if ($npmList -match "vsc-bridge") {
        Write-InfoMsg "Removing existing global installation..."
        npm uninstall -g vsc-bridge 2>$null
    }

    # Remove existing binary if it still exists (npm sometimes leaves it)
    if (Get-Command vscb -ErrorAction SilentlyContinue) {
        $vscbPath = (Get-Command vscb).Source
        if (Test-Path $vscbPath) {
            Write-InfoMsg "Removing existing vscb binary at: $vscbPath"
            Remove-Item -Path $vscbPath -Force -ErrorAction SilentlyContinue
        }
    }
}

# Function: Install-CLI (T018)
function Install-CLI {
    if (-not $INSTALL_CLI) {
        return
    }

    Write-InfoMsg "Installing CLI from tarball..."
    Write-WarningMsg "Note: This requires internet access to download npm dependencies"
    Write-Host ""

    $tarballFile = Get-ChildItem -Path . -Filter "vsc-bridge-*.tgz" | Select-Object -First 1
    $retries = 3
    $attempt = 1

    while ($attempt -le $retries) {
        if ($attempt -gt 1) {
            Write-Host "Retry attempt $attempt of $retries..."
        }

        try {
            Write-Host ""
            Write-InfoMsg "Running: npm install -g $($tarballFile.FullName)"
            Write-Host ""

            # Run npm and capture exit code (shows all output in real-time)
            & npm install -g $tarballFile.FullName
            $exitCode = $LASTEXITCODE

            if ($exitCode -eq 0) {
                Write-Host ""
                Write-Success "CLI installed successfully"
                return
            }
            else {
                throw "npm install exited with code $exitCode"
            }
        }
        catch {
            if ($attempt -eq $retries) {
                Write-Host ""
                Write-ErrorMsg "CLI installation failed after $retries attempts"
                Write-Host ""
                Write-Host "=========================================="
                Write-Host "MANUAL INSTALLATION INSTRUCTIONS"
                Write-Host "=========================================="
                Write-Host ""
                Write-Host "Option 1 - Install CLI using Command Prompt (cmd.exe):"
                Write-Host "  1. Open Command Prompt (Win+R -> cmd -> Enter)"
                Write-Host "  2. Navigate to bundle directory:"
                Write-Host "     cd $PWD"
                Write-Host "  3. Run npm install:"
                Write-Host "     npm install -g $($tarballFile.Name)"
                Write-Host ""
                Write-Host "Option 2 - Install CLI using PowerShell:"
                Write-Host "  1. Run PowerShell as Administrator"
                Write-Host "  2. Set execution policy for current session:"
                Write-Host "     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass"
                Write-Host "  3. Install the package:"
                Write-Host "     npm install -g $($tarballFile.FullName)"
                Write-Host ""
                Write-Host "Common Issues:"
                Write-Host "  - 'npm.ps1 cannot be loaded' -> Use cmd.exe instead of PowerShell"
                Write-Host "  - Internet connectivity -> npm needs internet to download dependencies"
                Write-Host "  - Proxy settings -> Check with: npm config get proxy"
                Write-Host "  - Registry access -> Test with: npm ping"
                Write-Host ""
                Write-Host "To retry with this script:"
                Write-Host "  powershell -ExecutionPolicy Bypass -File $PSCommandPath -InstallCli"
                Write-Host ""
                exit 1
            }

            $attempt++
            Start-Sleep -Seconds 2
        }
    }
}

# Function: Install-VSIX (T020)
function Install-VSIX {
    if (-not $INSTALL_VSIX) {
        return
    }

    Write-InfoMsg "Installing VS Code extension..."
    Get-VSCodeCLI

    $vsixFile = Get-ChildItem -Path . -Filter "vsc-bridge-*.vsix" | Select-Object -First 1

    try {
        Write-Host ""
        Write-InfoMsg "Running: $script:CODE_CMD --install-extension $($vsixFile.FullName)"
        Write-Host ""

        # Show full output
        & $script:CODE_CMD --install-extension $vsixFile.FullName

        if ($LASTEXITCODE -eq 0) {
            Write-Host ""
            Write-Success "Extension installed (using $script:CODE_CMD)"

            # Verify installation
            $extensions = & $script:CODE_CMD --list-extensions 2>&1 | Out-String
            if ($extensions -match "vsc-bridge") {
                Write-Success "Extension verified in VS Code"
            }
        }
        else {
            throw "VS Code extension install exited with code $LASTEXITCODE"
        }
    }
    catch {
        Write-Host ""
        Write-ErrorMsg "VSIX installation failed"
        Write-Host ""
        Write-Host "=========================================="
        Write-Host "MANUAL INSTALLATION INSTRUCTIONS"
        Write-Host "=========================================="
        Write-Host ""
        Write-Host "Option 1 - Install Extension using VS Code GUI:"
        Write-Host "  1. Open Visual Studio Code"
        Write-Host "  2. Press Ctrl+Shift+X (or Cmd+Shift+X on Mac)"
        Write-Host "  3. Click the '...' menu -> Install from VSIX..."
        Write-Host "  4. Navigate to: $PWD"
        Write-Host "  5. Select: $($vsixFile.Name)"
        Write-Host ""
        Write-Host "Option 2 - Install Extension using Command Line:"
        Write-Host "  Open Command Prompt (cmd.exe) and run:"
        Write-Host "     cd $PWD"
        Write-Host "     code --install-extension $($vsixFile.Name)"
        Write-Host ""
        Write-Host "Option 3 - Install Extension using full path:"
        Write-Host "     `"C:\Program Files\Microsoft VS Code\bin\code.cmd`" --install-extension $($vsixFile.FullName)"
        Write-Host ""
        Write-Host "Common Issues:"
        Write-Host "  - 'code' command not found -> Use VS Code GUI (Option 1) or full path (Option 3)"
        Write-Host "  - On macOS: Open VS Code -> Cmd+Shift+P -> 'Shell Command: Install code command in PATH'"
        Write-Host ""
        if ($INSTALL_CLI) {
            Write-Host "Note: CLI was already installed successfully"
            Write-Host ""
        }
        Write-Host "To retry with this script:"
        Write-Host "  powershell -ExecutionPolicy Bypass -File $PSCommandPath -InstallVsix"
        Write-Host ""
        exit 1
    }
}

# Function: Verify-PATH (T021)
function Verify-PATH {
    if (-not $INSTALL_CLI) {
        return
    }

    $npmBin = npm bin -g
    if ($env:PATH -like "*$npmBin*") {
        Write-Success "npm bin directory is in PATH"
        return
    }

    Write-WarningMsg "npm bin directory not in PATH: $npmBin"
    Write-Host ""
    Write-Host "To use the vscb command, add the npm bin directory to your PATH:"
    Write-Host ""
    Write-Host "Option 1 - GUI (Permanent):"
    Write-Host "  1. Press Win+R, type 'sysdm.cpl', press Enter"
    Write-Host "  2. Go to Advanced tab -> Environment Variables"
    Write-Host "  3. Under User variables, select PATH -> Edit"
    Write-Host "  4. Click New -> Add: $npmBin"
    Write-Host "  5. Click OK on all dialogs"
    Write-Host "  6. Restart PowerShell/Terminal"
    Write-Host ""
    Write-Host "Option 2 - PowerShell (Current session only):"
    Write-Host "  `$env:PATH += ';$npmBin'"
    Write-Host ""
}

# Function: Post-Install-Verify (T022)
function Post-Install-Verify {
    Write-Host ""
    Write-InfoMsg "Running post-install verification..."
    Write-Host ""

    $checksPassed = 0
    $checksTotal = 0

    # Check 1: vscb --version (if CLI installed)
    if ($INSTALL_CLI) {
        $checksTotal += 3

        if ((Get-Command vscb -ErrorAction SilentlyContinue) -and (vscb --version 2>&1)) {
            Write-Success "vscb --version works"
            $checksPassed++
        }
        else {
            Write-ErrorMsg "vscb --version failed"
        }

        # Check 4: Get-Command vscb
        if (Get-Command vscb -ErrorAction SilentlyContinue) {
            $vscbPath = (Get-Command vscb).Source
            Write-Success "vscb found at: $vscbPath"
            $checksPassed++
        }
        else {
            Write-ErrorMsg "vscb not found in PATH"
        }

        # Check 5: npm list -g vsc-bridge
        $npmList = npm list -g vsc-bridge --depth=0 2>&1 | Out-String
        if ($npmList -match "vsc-bridge") {
            Write-Success "npm global installation verified"
            $checksPassed++
        }
        else {
            Write-ErrorMsg "npm global installation check failed"
        }
    }

    # Check 2: code --list-extensions (if VSIX installed)
    if ($INSTALL_VSIX) {
        $checksTotal++
        $extensions = & $script:CODE_CMD --list-extensions 2>&1 | Out-String
        if ($extensions -match "vsc-bridge") {
            Write-Success "Extension found in VS Code"
            $checksPassed++
        }
        else {
            Write-ErrorMsg "Extension not found in VS Code"
        }
    }

    # Check 3: vscb script list (only if both installed)
    if ($INSTALL_CLI -and $INSTALL_VSIX) {
        $checksTotal++
        if (Get-Command vscb -ErrorAction SilentlyContinue) {
            Write-InfoMsg "Note: vscb script list requires Extension Host to be running"
            Write-InfoMsg "      Start VS Code to test full integration"
        }
    }

    Write-Host ""
    Write-Host "Verification: $checksPassed/$checksTotal checks passed"
    Write-Host ""

    if ($checksPassed -eq $checksTotal) {
        Write-Success "All verification checks passed!"
    }
    else {
        Write-WarningMsg "Some verification checks failed"
        Write-Host "Review the output above for details"
    }
}

# Main installation flow
Write-Host ""
Write-Host "vsc-bridge Offline Installation"
Write-Host "================================"
Write-Host ""

# Step 1: Validate prerequisites
Write-InfoMsg "Step 1: Checking prerequisites..."
Write-Host ""
Validate-Node
Validate-Npm
if ($INSTALL_VSIX) {
    Validate-VSCodeCLI
}
Write-Host ""

# Step 2: Show version/upgrade message
Write-InfoMsg "Step 2: Detecting installation status..."
Show-VersionMessage

# Step 3: Cleanup conflicts
Write-InfoMsg "Step 3: Checking for conflicts..."
Cleanup-NpmLink
Write-Host ""

# Step 4: Install CLI first (fail-fast on risky operation)
if ($INSTALL_CLI) {
    Write-InfoMsg "Step 4: Installing CLI..."
    Install-CLI
    Write-Host ""
}

# Step 5: Install VSIX second (after CLI succeeds)
if ($INSTALL_VSIX) {
    if ($INSTALL_CLI) {
        Write-InfoMsg "Step 5: Installing VS Code extension..."
    }
    else {
        Write-InfoMsg "Step 4: Installing VS Code extension..."
    }
    Install-VSIX
    Write-Host ""
}

# Step 6: Verify PATH configuration
if ($INSTALL_CLI) {
    if ($INSTALL_VSIX) {
        Write-InfoMsg "Step 6: Verifying PATH configuration..."
    }
    else {
        Write-InfoMsg "Step 5: Verifying PATH configuration..."
    }
    Verify-PATH
}

# Step 7: Post-install verification
Write-InfoMsg "Final Step: Post-install verification..."
Post-Install-Verify

Write-Host ""
Write-Success "Installation complete!"
Write-Host ""
Write-Host "Next steps:"
if ($INSTALL_CLI -and $INSTALL_VSIX) {
    Write-Host "  1. Start VS Code"
    Write-Host "  2. Test the vscb command:"
    Write-Host "     vscb status"
    Write-Host "     vscb script list"
}
elseif ($INSTALL_CLI) {
    Write-Host "  1. Install the VS Code extension:"
    Write-Host "     Run: powershell -ExecutionPolicy Bypass -File $PSCommandPath -InstallVsix"
    Write-Host "  2. Test the vscb command:"
    Write-Host "     vscb status"
}
elseif ($INSTALL_VSIX) {
    Write-Host "  1. Install the CLI:"
    Write-Host "     Run: powershell -ExecutionPolicy Bypass -File $PSCommandPath -InstallCli"
    Write-Host "  2. Start VS Code to use the extension"
}
Write-Host ""
