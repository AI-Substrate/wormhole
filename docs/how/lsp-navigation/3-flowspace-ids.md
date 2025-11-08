# Flowspace ID Complete Reference

Flowspace IDs are structured identifiers that enable position-independent code navigation. This guide covers the complete format specification, parsing rules, and edge cases.

## Format Specification

### Basic Structure

```
{type}:{file_path}:{qualified_symbol_name}
```

**Components**:
1. **type** - Symbol type (`class`, `method`, `function`, `file`, etc.)
2. **file_path** - Absolute or workspace-relative path (forward slashes)
3. **qualified_symbol_name** - Dot-separated symbol path

### Examples by Language

#### TypeScript/JavaScript

```bash
# Class
class:src/auth/AuthService.ts:AuthService

# Method (static)
method:src/auth/AuthService.ts:AuthService.login

# Method (instance)
method:src/auth/AuthService.ts:AuthService.authenticate

# Function
function:src/utils/validators.ts:validateEmail

# Nested class
class:src/models/User.ts:User.Profile

# Arrow function variable
function:src/handlers/index.ts:handleRequest
```

#### Python

```bash
# Class
class:src/models/user.py:User

# Method
method:src/models/user.py:User.authenticate

# Function
function:src/utils/validators.py:validate_email

# Nested function
function:src/handlers/auth.py:handle_login.validate_token
```

#### Java

```bash
# Class
class:src/main/java/com/example/User.java:User

# Method
method:src/main/java/com/example/User.java:User.authenticate

# Nested class
class:src/main/java/com/example/User.java:User.Builder

# Static method
method:src/main/java/com/example/Utils.java:Utils.formatDate
```

#### C#

```bash
# Class
class:src/Models/User.cs:User

# Method
method:src/Models/User.cs:User.Authenticate

# Property
property:src/Models/User.cs:User.Name

# Nested class
class:src/Models/User.cs:User.Builder
```

#### Dart

```bash
# Class
class:lib/models/user.dart:User

# Method
method:lib/models/user.dart:User.authenticate

# Function
function:lib/utils/validators.dart:validateEmail
```

## Parsing Rules

### Delimiter Handling

Flowspace IDs use `:` as delimiter. Parsing algorithm:

1. **Split at first `:`** → Extract `type`
2. **Split remainder at last `:`** → Extract `file_path` and `qualified_symbol_name`

**Example**:
```javascript
// Input
"method:C:/Users/dev/project/src/Calculator.ts:Calculator.add"

// Step 1: Split at first ':'
type = "method"
remainder = "C:/Users/dev/project/src/Calculator.ts:Calculator.add"

// Step 2: Split remainder at last ':'
file_path = "C:/Users/dev/project/src/Calculator.ts"
qualified_symbol_name = "Calculator.add"
```

### Windows Path Handling

**CRITICAL**: Always use forward slashes (`/`) in Flowspace IDs, even on Windows.

```bash
# ✅ CORRECT - Forward slashes
method:C:/Users/dev/project/src/Calculator.ts:Calculator.add

# ❌ WRONG - Backslashes (ambiguous parsing)
method:C:\Users\dev\project\src\Calculator.ts:Calculator.add
```

**Why**: Backslashes create ambiguous parsing:
- `C:\Users` has `:` in drive letter
- Parser can't determine if `C` is part of type or path

**Solution**: VSC-Bridge normalizes paths internally using `path.posix.normalize()`.

### Qualified Symbol Names

Symbol names use dot-notation for nesting:

```bash
# Class
Calculator

# Method in class
Calculator.add

# Nested class
User.Profile

# Nested method
User.Profile.toString

# Nested function (Python)
module.outer_function.inner_function
```

## Validation

### Valid Characters

**Type**: `[a-zA-Z_][a-zA-Z0-9_]*`
**File Path**: Any valid filesystem path (forward slashes)
**Symbol Name**: `[a-zA-Z_][a-zA-Z0-9_.]*`

### Invalid Examples

```bash
# ❌ Missing components
method:src/Calculator.ts

# ❌ Empty symbol name
method:src/Calculator.ts:

# ❌ Backslashes in path
method:src\Calculator.ts:Calculator.add

# ❌ Invalid type
123invalid:src/file.ts:Symbol
```

## Resolution Process

When you provide a Flowspace ID, VSC-Bridge:

1. **Parse ID** into components (type, path, symbol)
2. **Resolve file** to VS Code URI
3. **Search workspace symbols** for matching symbol in file
4. **Validate match** using type and qualified name
5. **Extract position** from DocumentSymbol
6. **Execute LSP operation** at resolved position

### Ambiguity Handling

If multiple symbols match the qualified name:

```bash
# Multiple overloaded methods
method:src/Calculator.ts:Calculator.add
```

**Resolution**:
- Returns first match (typically the first declaration)
- Future enhancement: Add type signature to disambiguate

**Workaround**: Use symbol name with line proximity if needed

## Symbol Types

Supported symbol types (from VS Code SymbolKind):

| Type | VS Code SymbolKind | Languages |
|------|-------------------|-----------|
| `file` | File | All |
| `module` | Module | TypeScript, Python |
| `namespace` | Namespace | TypeScript, C# |
| `package` | Package | Java |
| `class` | Class | All OOP languages |
| `method` | Method | All OOP languages |
| `property` | Property | TypeScript, C# |
| `field` | Field | Java, C# |
| `constructor` | Constructor | TypeScript, Java, C# |
| `enum` | Enum | TypeScript, Java, C# |
| `interface` | Interface | TypeScript, Java, C# |
| `function` | Function | All |
| `variable` | Variable | All |
| `constant` | Constant | All |

## Edge Cases

### Case Sensitivity

Flowspace IDs are **case-sensitive** (matches LSP behavior):

```bash
# Different symbols
class:src/User.ts:User
class:src/User.ts:user  # Different if language allows
```

### Special Characters

Symbol names with special characters (rare but possible):

```bash
# Python dunder methods
method:src/model.py:User.__init__

# Operators (Python)
method:src/model.py:User.__add__
```

### Workspace-Relative vs Absolute Paths

Both supported, but workspace-relative preferred:

```bash
# ✅ Workspace-relative (portable)
method:src/Calculator.ts:Calculator.add

# ✅ Absolute (works but not portable)
method:/home/user/project/src/Calculator.ts:Calculator.add
```

**Recommendation**: Use workspace-relative paths when possible.

## Building Flowspace IDs Programmatically

If you're generating Flowspace IDs:

```javascript
// Pseudo-code
function buildFlowspaceId(type, filePath, symbolName) {
  // Normalize path to forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  // Validate components
  if (!type || !normalized || !symbolName) {
    throw new Error('Missing required components');
  }

  // Construct ID
  return `${type}:${normalized}:${symbolName}`;
}

// Usage
buildFlowspaceId('method', 'src/Calculator.ts', 'Calculator.add')
// → "method:src/Calculator.ts:Calculator.add"
```

## Best Practices

1. **Always use forward slashes** - Even on Windows
2. **Prefer workspace-relative paths** - More portable across environments
3. **Use full qualified names** - `Calculator.add` not just `add`
4. **Validate IDs before use** - Check for `:` count (should be 2)
5. **Handle ambiguity** - Prepare for multiple matches in complex codebases

## Testing Flowspace IDs

Quick validation:

```bash
# Test symbol resolution
vscb script run symbol.navigate \
  --param nodeId="YOUR_FLOWSPACE_ID" \
  --param action="references"

# Success: Symbol found
{ "ok": true, "data": { "locations": [...] } }

# Error: Symbol not found
{ "ok": false, "error": { "code": "E_SYMBOL_NOT_FOUND" } }
```

## Next Steps

- [API Reference](./4-api-reference.md) - Use Flowspace IDs in API calls
- [Language Support](./5-language-support.md) - Symbol support per language
- [Troubleshooting](./6-troubleshooting.md) - Debug resolution issues
