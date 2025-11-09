# LSP Navigation Troubleshooting Guide

Common issues and solutions when using VSC-Bridge LSP navigation tools.

## Error Codes Reference

### E_SYMBOL_NOT_FOUND

**Error Message**: `Symbol 'SymbolName' not found in /path/to/file`

**Common Causes**:
1. Typo in symbol name
2. Symbol doesn't exist in specified file
3. Wrong file path
4. Flowspace ID format error

**Solutions**:

```bash
# 1. Verify symbol exists in file
# Open file in VS Code and use Go to Symbol (Cmd+Shift+O / Ctrl+Shift+O)

# 2. Check symbol name case sensitivity
# WRONG: symbol="calculator.add"
# RIGHT: symbol="Calculator.add"

# 3. Use workspace symbol search to find symbol
vscb script run search.symbol-search --param query="YourSymbol"

# 4. Verify Flowspace ID format (must have exactly 2 colons)
# WRONG: method:src/file.ts
# RIGHT: method:src/file.ts:Class.method
```

**Example Debug Session**:
```bash
# Step 1: Search for symbol in workspace
vscb script run search.symbol-search --param query="authenticate"

# Response shows where symbol exists:
{
  "symbols": [
    {
      "name": "authenticate",
      "containerName": "AuthService",
      "location": {
        "uri": "file:///workspace/src/auth/service.ts",
        "range": { "start": { "line": 42, "character": 2 } }
      }
    }
  ]
}

# Step 2: Use correct path and qualified name
vscb script run symbol.navigate \
  --param path="src/auth/service.ts" \
  --param symbol="AuthService.authenticate" \
  --param action="references"
```

---

### E_AMBIGUOUS_SYMBOL

**Error Message**: `Multiple symbols named 'SymbolName' found`

**Common Causes**:
1. Overloaded methods with same name
2. Multiple symbols with same name in different scopes
3. Symbol name too generic (e.g., just "add" instead of "Calculator.add")

**Solutions**:

```bash
# Option 1: Use fully qualified name
# WRONG: symbol="add"
# RIGHT: symbol="Calculator.add"

# Option 2: Use Flowspace ID with full path
vscb script run symbol.navigate \
  --param nodeId="method:src/math/Calculator.ts:Calculator.add" \
  --param action="references"

# Option 3: Check error details for candidate matches
# Error response includes:
{
  "error": {
    "code": "E_AMBIGUOUS_SYMBOL",
    "details": {
      "candidates": [
        "function:src/math.ts:add",
        "method:src/Calculator.ts:Calculator.add"
      ]
    }
  }
}

# Use one of the Flowspace IDs from candidates
```

---

### E_NO_LANGUAGE_SERVER

**Error Message**: `No [operation] provider available for this file type`

**Common Causes**:
1. Language extension not installed
2. Language server not activated
3. File type not associated with language extension
4. Language server crashed or needs restart

**Solutions by Language**:

**Python**:
```bash
# Install Python extension
code --install-extension ms-python.python

# Verify Pylance is active (check VS Code Output panel)
# Select "Python Language Server" from dropdown
# Should see: "Pylance language server ... started"

# Restart language server
# Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
# Run: "Python: Restart Language Server"
```

**Java**:
```bash
# Install Java extension
code --install-extension redhat.java

# Check Java extension status in VS Code
# Bottom right should show "Java: Ready" when active

# Clean and rebuild Java project
# Command Palette → "Java: Clean Java Language Server Workspace"
```

**C#**:
```bash
# Install C# Dev Kit (includes OmniSharp)
code --install-extension ms-dotnettools.csdevkit

# Check OmniSharp logs
# VS Code Output panel → Select "OmniSharp Log"
# Look for "OmniSharp server started" message

# Restart OmniSharp
# Command Palette → "OmniSharp: Restart OmniSharp"
```

**TypeScript/JavaScript**:
```bash
# TypeScript server is built-in, but may need restart
# Command Palette → "TypeScript: Restart TS Server"

# Check TS Server status
# Open any .ts/.js file
# Bottom right should show TypeScript version (e.g., "TypeScript 5.3.3")
```

**General debugging**:
```bash
# 1. Reload VS Code window
# Command Palette → "Developer: Reload Window"

# 2. Check extension is enabled
# Extensions panel → Search for language extension
# Should show "Enabled" not "Disabled"

# 3. Check file association
# Open file → Bottom right shows language mode
# Click to change if incorrect (e.g., should be "Python" not "Plain Text")
```

---

### E_TIMEOUT

**Error Message**: `LSP [operation] timeout (10s)`

**Common Causes**:
1. Language server still indexing workspace (first run)
2. Large workspace with many files
3. Language server performance issue
4. Network file system (slow I/O)

**Solutions**:

```bash
# 1. Wait for indexing to complete
# Check VS Code status bar for indexing progress:
# - Python: "Indexing: [N/M files]"
# - Java: "Building workspace... [N%]"
# - TypeScript: "Initializing JS/TS language features"

# 2. Retry operation after 10-30 seconds
vscb script run symbol.navigate \
  --param nodeId="method:src/file.ts:Class.method" \
  --param action="references"

# 3. Check language server status
# VS Code Output panel → Select language server log
# Look for "Indexing completed" or similar message

# 4. For Java/C# large projects, increase heap size
# .vscode/settings.json:
{
  "java.jdt.ls.vmargs": "-Xmx4G"  // Increase from default 1-2G
}
```

**Indexing time expectations**:
- Small project (< 100 files): 1-5 seconds
- Medium project (100-1000 files): 5-15 seconds
- Large project (1000+ files): 15-60 seconds

**If timeout persists after indexing**:
```bash
# 1. Restart language server (see E_NO_LANGUAGE_SERVER section)

# 2. Check VS Code performance
# Command Palette → "Developer: Open Process Explorer"
# Look for high CPU/memory usage by language server

# 3. Exclude large directories from indexing
# .vscode/settings.json:
{
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true
  }
}
```

---

### E_FILE_READ_ONLY

**Error Message**: `Cannot apply edit: /path/to/file is read-only`

**Common Causes**:
1. File permissions set to read-only
2. File checked out in version control as read-only
3. File in protected system directory
4. Virtual file system restrictions

**Solutions**:

```bash
# 1. Check file permissions
ls -la /path/to/file

# 2. Make file writable (Unix/Mac)
chmod u+w /path/to/file

# 3. Make file writable (Windows PowerShell)
Set-ItemProperty -Path "C:\path\to\file" -Name IsReadOnly -Value $false

# 4. Check version control status
# Perforce: p4 edit file
# TFS: tf checkout file

# 5. Verify user has write permissions to directory
# Unix/Mac:
ls -la /path/to/directory

# Windows:
icacls "C:\path\to\directory"
```

---

### E_OPERATION_FAILED

**Error Message**: `Cannot apply [operation]. File locked or modified concurrently.`

**Common Causes**:
1. File open in another application
2. File modified during operation
3. File system lock
4. Concurrent VS Code edit

**Solutions**:

```bash
# 1. Close file in other applications
# Check if file is open in:
# - Other editors
# - Build tools
# - IDE instances

# 2. Ensure file is saved in VS Code
# Command Palette → "File: Save All"

# 3. Close and reopen file in VS Code
# Command Palette → "View: Close Editor"
# Then reopen file

# 4. Retry operation
vscb script run symbol.rename \
  --param path="src/file.ts" \
  --param symbol="OldName" \
  --param newName="NewName"

# 5. Check for file system issues (Unix/Mac)
lsof /path/to/file  # Shows processes with file open

# 6. Check for file system issues (Windows)
handle /path/to/file  # Sysinternals Handle utility
```

---

### E_NOT_FOUND

**Error Message**: `Cannot apply edit: /path/to/file does not exist`

**Common Causes**:
1. File path incorrect (typo)
2. File deleted after resolution
3. Workspace-relative path used incorrectly
4. Path separator issues (backslash vs forward slash)

**Solutions**:

```bash
# 1. Verify file exists
ls /path/to/file

# 2. Use absolute paths
# WRONG: path="src/file.ts"  (may fail if cwd wrong)
# RIGHT: path="/workspace/src/file.ts"

# 3. Check workspace root
# Ensure VS Code workspace is open (creates .vsc-bridge/)
ls -la .vsc-bridge/  # Should exist in workspace root

# 4. Use forward slashes (even on Windows)
# WRONG: path="C:\Users\dev\project\src\file.ts"
# RIGHT: path="C:/Users/dev/project/src/file.ts"

# 5. Get correct path from symbol search
vscb script run search.symbol-search --param query="SymbolName"
# Use the "location.uri" value from response
```

---

## General Debugging Workflow

### Step 1: Verify VSC-Bridge Connection

```bash
# Check bridge status
vscb status

# Expected output:
{
  "status": "connected",
  "bridge": {
    "running": true,
    "port": 3001
  }
}

# If bridge not running:
# 1. Open VS Code with VSC-Bridge extension
# 2. Check VS Code Output panel → "VSC-Bridge"
# 3. Should see "VSC-Bridge server listening on http://127.0.0.1:3001"
```

### Step 2: Verify Language Server Active

```bash
# 1. Open file in VS Code of target language

# 2. Check VS Code status bar (bottom right)
# Should show language mode (e.g., "Python", "TypeScript")

# 3. Test IntelliSense (Ctrl+Space / Cmd+Space)
# Should show autocomplete suggestions

# 4. Check language server logs
# VS Code Output panel → Select language server from dropdown
```

### Step 3: Test with Simple Operation

```bash
# Start with simplest operation: symbol search
vscb script run search.symbol-search --param query="test"

# If this works, language server is active
# If this fails, language server issue (see E_NO_LANGUAGE_SERVER)
```

### Step 4: Validate Input Parameters

```bash
# Use JSON output for easier debugging
vscb script run symbol.navigate \
  --param path="/absolute/path/to/file.ts" \
  --param symbol="ClassName.methodName" \
  --param action="references" \
  --json

# Check "input" field in error response for what was received
```

### Step 5: Check Logs

```bash
# VS Code Output panel logs:
# - "VSC-Bridge" → API requests/responses
# - "[Language] Language Server" → LSP operations
# - "Extension Host" → Extension errors

# CLI verbose mode (future enhancement):
# vscb script run symbol.navigate --verbose
```

---

## Common Pitfalls

### Pitfall 1: Using Backslashes in Paths (Windows)

```bash
# ❌ WRONG - Backslashes
vscb script run symbol.navigate \
  --param path="C:\Users\dev\project\src\file.ts" \
  --param symbol="Class.method"

# ✅ RIGHT - Forward slashes
vscb script run symbol.navigate \
  --param path="C:/Users/dev/project/src/file.ts" \
  --param symbol="Class.method"
```

### Pitfall 2: Missing Qualified Symbol Name

```bash
# ❌ WRONG - Ambiguous
vscb script run symbol.navigate \
  --param path="src/file.ts" \
  --param symbol="method"

# ✅ RIGHT - Fully qualified
vscb script run symbol.navigate \
  --param path="src/file.ts" \
  --param symbol="ClassName.method"
```

### Pitfall 3: Mixing nodeId and path/symbol

```bash
# ❌ WRONG - Both provided
vscb script run symbol.navigate \
  --param nodeId="method:src/file.ts:Class.method" \
  --param path="src/file.ts" \
  --param symbol="Class.method"

# Error: "Provide either nodeId OR path+symbol, not both"

# ✅ RIGHT - Use one or the other
vscb script run symbol.navigate \
  --param nodeId="method:src/file.ts:Class.method"
```

### Pitfall 4: Expecting Immediate Results During Indexing

```bash
# First run after opening large workspace:
vscb script run symbol.navigate \
  --param path="src/file.ts" \
  --param symbol="Class.method"

# Response: E_TIMEOUT (language server indexing)

# ✅ Wait 10-30 seconds, then retry
sleep 30
vscb script run symbol.navigate \
  --param path="src/file.ts" \
  --param symbol="Class.method"

# Response: Success (indexing complete)
```

---

## Getting Help

If you've tried all troubleshooting steps and still have issues:

1. **Check VSC-Bridge GitHub Issues**: https://github.com/AI-Substrate/vsc-bridge/issues
2. **Gather diagnostic information**:
   ```bash
   # Run diagnostic collection
   vscb script run diag.collect

   # Provides:
   # - VS Code version
   # - Extension versions
   # - Language server status
   # - Recent errors
   ```
3. **Include in bug report**:
   - Full command used
   - Complete error response (JSON)
   - Language and extension versions
   - OS and VS Code version

---

## Next Steps

- [API Reference](./4-api-reference.md) - Complete parameter documentation
- [Language Support](./5-language-support.md) - Feature matrix per language
- [Quickstart Guide](./2-quickstart.md) - Try working examples
