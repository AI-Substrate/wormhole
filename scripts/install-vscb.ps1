#
# install-vscb.ps1 - Install vscb CLI globally on Windows
#
# IMPORTANT: This script does NOT build the CLI. You must build first:
#   - Option A: Build in dev container (recommended)
#   - Option B: Build locally with: just build; just package-extension
#
# This script:
# 1. Validates prerequisites (Node.js, npm)
# 2. Verifies CLI and extension are already built
# 3. Installs CLI globally via npm link
# 4. Verifies installation
# 5. Provides PATH configuration instructions if needed
#
# Usage:
#   .\scripts\install-vscb.ps1
#
# Requires: PowerShell 5.1 or higher, Node.js >=18.0.0
#

$ErrorActionPreference = "Stop"

# Helper functions
function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "=======================================================" -ForegroundColor Blue
    Write-Host $Message -ForegroundColor Blue
    Write-Host "=======================================================" -ForegroundColor Blue
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Write-WarningMsg {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-InfoMsg {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

# Detect project root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Header ">>> vscb CLI Installation (Windows)"

Write-Host "Project root: $ProjectRoot"
Write-Host ""

# ==========================================
# STEP 1: Check Prerequisites
# ==========================================
Write-InfoMsg "Step 1: Checking prerequisites..."
Write-Host ""

# Check Node.js
try {
    $nodeVersion = & node --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Node.js not found"
    }
    $nodeVersion = $nodeVersion -replace 'v', ''
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
catch {
    Write-ErrorMsg "Node.js is not installed or not in PATH"
    Write-Host ""
    Write-Host "Please install Node.js (>=18.0.0) from:"
    Write-Host "  https://nodejs.org/"
    Write-Host ""
    Write-Host "Make sure to select 'Add to PATH' during installation."
    exit 1
}

# Check npm
try {
    $npmVersion = & npm --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "npm not found"
    }
    Write-Success "npm $npmVersion"
}
catch {
    Write-ErrorMsg "npm is not installed or not in PATH"
    Write-Host ""
    Write-Host "npm should be installed with Node.js"
    Write-Host "Please reinstall Node.js from: https://nodejs.org/"
    exit 1
}

# Check git (optional)
try {
    $gitVersion = & git --version 2>$null
    if ($LASTEXITCODE -eq 0) {
        $gitVersion = $gitVersion -replace 'git version ', ''
        Write-Success "git $gitVersion"
    }
}
catch {
    Write-WarningMsg "git not found (optional)"
}

Write-Host ""

# ==========================================
# STEP 2: Validate Project Structure
# ==========================================
Write-InfoMsg "Step 2: Validating project structure..."
Write-Host ""

Set-Location $ProjectRoot

if (-not (Test-Path "package.json")) {
    Write-ErrorMsg "package.json not found in $ProjectRoot"
    Write-Host ""
    Write-Host "This script must be run from the vsc-bridge project root."
    exit 1
}

if (-not (Test-Path "packages\cli")) {
    Write-ErrorMsg "packages\cli directory not found"
    Write-Host ""
    Write-Host "Expected: $ProjectRoot\packages\cli"
    exit 1
}

if (-not (Test-Path "packages\cli\package.json")) {
    Write-ErrorMsg "packages\cli\package.json not found"
    exit 1
}

Write-Success "Project structure validated"
Write-Host ""

# ==========================================
# STEP 3: Verify Build Artifacts
# ==========================================
Write-InfoMsg "Step 3: Verifying build artifacts..."
Write-Host ""

# Check CLI build
if (-not (Test-Path "packages\cli\dist\index.js")) {
    Write-ErrorMsg "CLI not built: packages\cli\dist\index.js not found"
    Write-Host ""
    Write-Host "You must build the project first. Choose one option:"
    Write-Host ""
    Write-Host "Option A (Recommended): Build in dev container"
    Write-Host "  1. Open project in VS Code"
    Write-Host "  2. Reopen in dev container when prompted"
    Write-Host "  3. Wait for automatic build via post-install.sh"
    Write-Host ""
    Write-Host "Option B: Build locally (requires Node.js >=18, just/npm)"
    Write-Host "  npm install"
    Write-Host "  just build"
    Write-Host "  just package-extension"
    Write-Host "  # Or: npm run build; cd packages\extension; npx @vscode/vsce package"
    Write-Host ""
    exit 1
}

if (-not (Test-Path "packages\cli\dist\manifest.json")) {
    Write-ErrorMsg "CLI build incomplete: packages\cli\dist\manifest.json not found"
    Write-Host ""
    Write-Host "The CLI build appears incomplete. Please rebuild:"
    Write-Host "  just build  # or: cd packages\cli; npm run build"
    exit 1
}

$manifestSize = (Get-Item "packages\cli\dist\manifest.json").Length / 1KB
Write-Success "CLI built: packages\cli\dist\ ($([math]::Round($manifestSize, 1)) KB manifest)"

# Check extension VSIX
$vsixFile = Get-ChildItem "$ProjectRoot\packages\extension\*.vsix" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $vsixFile) {
    Write-WarningMsg "Extension VSIX not found (optional for CLI-only usage)"
    Write-Host "  To create it: just package-extension"
    Write-Host "  Or: cd packages\extension; npx @vscode/vsce package"
}
else {
    $vsixSize = $vsixFile.Length / 1MB
    Write-Success "Extension packaged: $($vsixFile.Name) ($([math]::Round($vsixSize, 1)) MB)"
}

Write-Host ""

# ==========================================
# STEP 4: Install Globally
# ==========================================
Write-InfoMsg "Step 4: Installing vscb globally..."
Write-Host ""

Set-Location "$ProjectRoot\packages\cli"

# Check if already linked (suppress workspace errors)
$npmPrefix = & npm config get prefix 2>$null
$globalModulesPath = Join-Path $npmPrefix "node_modules\@vsc-bridge\cli"

if (Test-Path $globalModulesPath) {
    Write-WarningMsg "vscb is already linked globally (reinstalling...)"
    & npm unlink 2>$null | Out-Null
}

# Run npm link (suppress workspace-related warnings)
Write-Host "Running npm link (this creates a global symlink)..."
$linkOutput = & npm link 2>&1 | Where-Object { $_ -notmatch "ENOWORKSPACES" -and $_ -notmatch "does not support workspaces" }
if ($linkOutput) {
    Write-Host $linkOutput
}

# Check if link succeeded (don't rely on exit code due to workspace warnings)
if (-not (Test-Path $globalModulesPath)) {
    Write-ErrorMsg "npm link failed - global package not created"
    Write-Host ""
    Write-Host "This may be a permission issue. Try running PowerShell as Administrator."
    exit 1
}

Write-Success "vscb installed globally"
Write-Host ""

Set-Location $ProjectRoot

# ==========================================
# STEP 5: Verify Installation
# ==========================================
Write-InfoMsg "Step 5: Verifying installation..."
Write-Host ""

# Check if vscb is in PATH
try {
    $vscbPath = & where.exe vscb 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "vscb not found"
    }
    Write-Success "vscb found at: $vscbPath"
}
catch {
    Write-ErrorMsg "vscb command not found in PATH"
    Write-Host ""
    Write-Host "npm link completed, but vscb is not in your PATH."
    Write-Host ""

    # Provide PATH configuration instructions
    $npmBin = & npm bin -g
    Write-Host "npm global bin directory: $npmBin"
    Write-Host ""
    Write-Host "To fix this, add the npm bin directory to your PATH:"
    Write-Host ""
    Write-Host "  1. Open System Properties > Environment Variables"
    Write-Host "  2. Edit the 'Path' variable under User variables"
    Write-Host "  3. Add: $npmBin"
    Write-Host "  4. Restart PowerShell"
    Write-Host ""
    Write-Host "Or run this command (requires restart):"
    Write-Host "  [Environment]::SetEnvironmentVariable('Path', `$env:Path + ';$npmBin', 'User')"
    Write-Host ""
    exit 1
}

# Check version
try {
    $vscbVersion = & vscb --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "vscb --version failed"
    }
    $vscbVersionLine = ($vscbVersion | Select-Object -First 1)
    Write-Success "vscb version: $vscbVersionLine"
}
catch {
    Write-ErrorMsg "vscb --version failed"
    Write-Host ""
    Write-Host "Output: $vscbVersion"
    exit 1
}

# Check commands available
try {
    & vscb --help 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Success "vscb commands available"
    }
}
catch {
    Write-WarningMsg "vscb --help failed (may be ok)"
}

Write-Host ""

# ==========================================
# SUCCESS!
# ==========================================
Write-Header "[OK] Installation Complete!"

Write-Host "vscb CLI is now installed and ready to use!" -ForegroundColor Green
Write-Host ""
Write-Host "Installation Details:"
Write-Host "  Command:  vscb"
Write-Host "  Location: $vscbPath"
Write-Host "  Version:  $vscbVersionLine"
Write-Host ""
Write-Host "======================================================="
Write-Host ""
Write-Host ">>> Next Steps:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Start VS Code with your project open"
Write-Host "   (The Extension Host must be running for vscb to work)"
Write-Host ""
Write-Host "2. Install the VS Code extension:"
Write-Host "   - Open Command Palette (Ctrl+Shift+P)"
Write-Host "   - Select 'Extensions: Install from VSIX'"
Write-Host "   - Choose: $ProjectRoot\packages\extension\*.vsix"
Write-Host ""
Write-Host "3. Verify vscb can connect:"
Write-Host "   vscb status"
Write-Host ""
Write-Host "4. List available scripts:"
Write-Host "   vscb script list"
Write-Host ""
Write-Host "5. (Optional) Configure auth token:"
Write-Host "   vscb config set authToken <your-token>"
Write-Host ""
Write-Host "======================================================="
Write-Host ""
Write-Host "Documentation:"
Write-Host "  CLI Usage:     $ProjectRoot\packages\cli\README.md"
Write-Host "  Project Docs:  $ProjectRoot\README.md"
Write-Host ""
Write-Host "For help, run:   vscb --help"
Write-Host ""
