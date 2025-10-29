#!/usr/bin/env pwsh
# install-vsix.ps1 - Download and install latest vsc-bridge VSIX from GitHub Releases
# Usage: ./scripts/install-vsix.ps1 [-Version <version>]
#   - No args: Install latest release
#   - With -Version: Install specific version (e.g., "v1.0.0" or "v1.0.0-test.1")

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Version
)

$ErrorActionPreference = "Stop"
$Repo = "AI-Substrate/vsc-bridge"
$ExtensionId = "ai-substrate.vsc-bridge"

Write-Host "🔍 vsc-bridge VSIX Installer" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check prerequisites
try {
    $null = Get-Command code -ErrorAction Stop
} catch {
    Write-Host "❌ Error: VS Code 'code' command not found in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install VS Code and ensure 'code' is in your PATH:"
    Write-Host "  - Usually located at: C:\Program Files\Microsoft VS Code\bin\code.cmd"
    Write-Host "  - Add to PATH or run from VS Code installation directory"
    exit 1
}

try {
    $null = Get-Command gh -ErrorAction Stop
} catch {
    Write-Host "❌ Error: GitHub CLI (gh) not found in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install GitHub CLI:"
    Write-Host "  - Download: https://cli.github.com/"
    Write-Host "  - Or via winget: winget install GitHub.cli"
    Write-Host "  - Or via scoop: scoop install gh"
    exit 1
}

# Determine version to install
if ([string]::IsNullOrEmpty($Version)) {
    Write-Host "📦 Fetching latest release..."
    $releaseJson = gh release list --repo $Repo --limit 1 --json tagName | ConvertFrom-Json
    $Version = $releaseJson[0].tagName
    if ([string]::IsNullOrEmpty($Version)) {
        Write-Host "❌ Error: Could not determine latest release" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Latest release: $Version" -ForegroundColor Green
} else {
    # Add 'v' prefix if not present
    if (-not $Version.StartsWith("v")) {
        $Version = "v$Version"
    }
    Write-Host "📦 Using specified version: $Version"
}

# Create temporary directory
$TempDir = Join-Path $env:TEMP "vsc-bridge-install-$(Get-Random)"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    # Download VSIX
    Write-Host ""
    Write-Host "⬇️  Downloading VSIX from GitHub Release..."
    $VsixPattern = "vsc-bridge-*.vsix"

    Push-Location $TempDir
    try {
        gh release download $Version --repo $Repo --pattern $VsixPattern 2>&1 | Out-Null
    } finally {
        Pop-Location
    }

    $VsixFile = Get-ChildItem -Path $TempDir -Filter "vsc-bridge-*.vsix" | Select-Object -First 1
    if ($null -eq $VsixFile) {
        Write-Host "❌ Error: VSIX file not found in release $Version" -ForegroundColor Red
        Write-Host "   Expected pattern: $VsixPattern"
        exit 1
    }

    $VsixSize = "{0:N2} MB" -f ($VsixFile.Length / 1MB)
    Write-Host "✓ Downloaded: $($VsixFile.Name) ($VsixSize)" -ForegroundColor Green

    # Check if extension is already installed
    $installedExtensions = code --list-extensions --show-versions | Out-String
    $installedMatch = $installedExtensions -match "$ExtensionId@([\d\.\-\w]+)"
    if ($installedMatch) {
        $InstalledVersion = $Matches[1]
        Write-Host ""
        Write-Host "ℹ️  Currently installed: $ExtensionId@$InstalledVersion" -ForegroundColor Yellow
        Write-Host "   Will be replaced with version: $($Version.TrimStart('v'))"
    }

    # Install VSIX
    Write-Host ""
    Write-Host "📥 Installing extension in VS Code..."

    $installOutput = code --install-extension $VsixFile.FullName 2>&1

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ Installation complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Extension: vsc-bridge"
        Write-Host "Version: $($Version.TrimStart('v'))"
        Write-Host "ID: $ExtensionId"
        Write-Host ""
        Write-Host "🔄 Reload VS Code windows for changes to take effect" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "❌ Installation failed!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Output:" -ForegroundColor Yellow
        Write-Host $installOutput
        Write-Host ""
        Write-Host "Troubleshooting:" -ForegroundColor Yellow
        Write-Host "  1. Check VS Code is not running (close all windows)"
        Write-Host "  2. Verify you have write permissions to VS Code extensions folder"
        Write-Host "  3. Try installing manually:"
        Write-Host "     code --install-extension $($VsixFile.FullName)"
        exit 1
    }

    # Optional: List extension details
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "Extension details:"
    $extensionList = code --list-extensions --show-versions | Select-String $ExtensionId
    if ($extensionList) {
        Write-Host $extensionList
    } else {
        Write-Host "⚠️  Extension not found in list (may require VS Code restart)" -ForegroundColor Yellow
    }

} finally {
    # Cleanup
    if (Test-Path $TempDir) {
        Remove-Item -Path $TempDir -Recurse -Force
    }
}
