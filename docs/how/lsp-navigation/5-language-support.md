# Language Support Matrix

VSC-Bridge LSP navigation tools work across multiple languages via VS Code's Language Server Protocol integration. Support varies by language and LSP provider capabilities.

## Feature Support by Language

| Language | References | Implementations | Rename | Replace Method | Call Hierarchy |
|----------|-----------|----------------|--------|----------------|----------------|
| **TypeScript** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **JavaScript** | ✅ Full | ✅ Full | ⚠️ Partial | ✅ Full | ⚠️ Limited |
| **Python** | ✅ Full | ⚠️ Limited | ✅ Full | ✅ Full | ✅ Full |
| **Java** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **C#** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ❌ None |
| **Dart** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Go** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |
| **Rust** | ✅ Full | ✅ Full | ✅ Full | ✅ Full | ✅ Full |

**Legend**:
- ✅ **Full** - Feature works as expected across all scenarios
- ⚠️ **Partial/Limited** - Feature works with limitations (see notes)
- ❌ **None** - Feature not supported by language server

---

## TypeScript

**LSP Provider**: Built-in TypeScript Language Server (tsserver)

### Support Level: ✅ Full

All features work comprehensively with TypeScript:

- **References**: ✅ Finds all imports, usages, type references
- **Implementations**: ✅ Finds classes implementing interfaces, method overrides
- **Rename**: ✅ Updates imports, type annotations, JSDoc references
- **Replace Method**: ✅ Whole declaration replacement including async/signature changes
- **Call Hierarchy**: ✅ Complete incoming/outgoing call tracking

### Example Usage

```bash
# Find interface implementations
vscb script run symbol.navigate \
  --param path="src/ILogger.ts" \
  --param symbol="ILogger" \
  --param action="implementations"

# Rename interface workspace-wide
vscb script run symbol.rename \
  --param path="src/ILogger.ts" \
  --param symbol="ILogger" \
  --param newName="ILoggingService"
```

### Known Limitations

- None - TypeScript has the most mature LSP support

---

## JavaScript

**LSP Provider**: Built-in TypeScript Language Server (supports JS via tsserver)

### Support Level: ✅ Full / ⚠️ Partial (see notes)

- **References**: ✅ Works well for ES6 modules
- **Implementations**: ✅ Finds class extensions
- **Rename**: ⚠️ **Partial** - CommonJS `require()` may not update correctly
- **Replace Method**: ✅ Full support
- **Call Hierarchy**: ⚠️ **Limited** - May not work with dynamic calls (`obj[methodName]()`)

### Example Usage

```bash
# Find references (works great with ES6)
vscb script run symbol.navigate \
  --param path="src/utils.js" \
  --param symbol="formatDate" \
  --param action="references"
```

### Known Limitations

**Rename limitations**:
```javascript
// ✅ Works - ES6 import
import { formatDate } from './utils';

// ❌ May not rename - CommonJS require
const { formatDate } = require('./utils');
```

**Workaround**: Convert to ES6 modules or manually verify CommonJS updates.

**Call hierarchy limitations**:
```javascript
// ✅ Works - Direct call
result = formatDate(new Date());

// ❌ May not detect - Dynamic call
const methodName = 'formatDate';
result = obj[methodName](new Date());
```

---

## Python

**LSP Provider**: Pylance (Microsoft) or pyright

**Installation**: `ms-python.python` extension

### Support Level: ✅ Full / ⚠️ Limited (implementations)

- **References**: ✅ Full support via Pylance
- **Implementations**: ⚠️ **Limited** - Python has no interfaces (use references instead)
- **Rename**: ✅ Full support, updates imports
- **Replace Method**: ✅ Full support, handles decorators/docstrings
- **Call Hierarchy**: ✅ Full support via Pylance

### Example Usage

```bash
# Find references to Python function
vscb script run symbol.navigate \
  --param path="src/utils.py" \
  --param symbol="validate_email" \
  --param action="references"

# Find who calls a Python method
vscb script run symbol.calls \
  --param path="src/models/user.py" \
  --param symbol="User.authenticate" \
  --param direction="incoming"
```

### Known Limitations

**No interface implementations**:
```python
# Python has no interfaces - use references instead
vscb script run symbol.navigate \
  --param path="src/base.py" \
  --param symbol="BaseService" \
  --param action="implementations"

# Error response:
{
  "ok": false,
  "error": {
    "message": "Python has no interfaces. Use action='references' to find subclasses."
  }
}
```

**Workaround**: Use `action="references"` to find class usages and subclasses.

---

## Java

**LSP Provider**: Eclipse JDT Language Server

**Installation**: `redhat.java` extension

### Support Level: ✅ Full

All features work comprehensively with Java:

- **References**: ✅ Finds all usages including package imports
- **Implementations**: ✅ Finds interface implementations, abstract method overrides
- **Rename**: ✅ Updates package imports, class references
- **Replace Method**: ✅ Full support including annotations
- **Call Hierarchy**: ✅ Complete support

### Example Usage

```bash
# Find interface implementations
vscb script run symbol.navigate \
  --param path="src/main/java/com/example/IService.java" \
  --param symbol="IService" \
  --param action="implementations"

# Replace method with annotations
vscb script run code.replace-method \
  --param path="src/main/java/com/example/User.java" \
  --param symbol="User.authenticate" \
  --param replacement="@Override
public boolean authenticate(String password) {
    return BCrypt.checkpw(password, this.hashedPassword);
}"
```

### Known Limitations

- None - Java has excellent LSP support via JDT LS

---

## C#

**LSP Provider**: OmniSharp or C# Dev Kit

**Installation**: `ms-dotnettools.csharp` or `ms-dotnettools.csdevkit`

### Support Level: ✅ Full / ❌ None (call hierarchy)

- **References**: ✅ Full support
- **Implementations**: ✅ Finds interface implementations
- **Rename**: ✅ Updates using directives, namespace references
- **Replace Method**: ✅ Full support including attributes
- **Call Hierarchy**: ❌ **Not supported** by OmniSharp

### Example Usage

```bash
# Find interface implementations
vscb script run symbol.navigate \
  --param path="src/Services/IAuthService.cs" \
  --param symbol="IAuthService" \
  --param action="implementations"

# Rename class
vscb script run symbol.rename \
  --param path="src/Models/User.cs" \
  --param symbol="User" \
  --param newName="UserAccount"
```

### Known Limitations

**Call hierarchy not supported**:
```bash
vscb script run symbol.calls \
  --param path="src/Services/AuthService.cs" \
  --param symbol="AuthService.Login" \
  --param direction="incoming"

# Error response:
{
  "ok": false,
  "error": {
    "code": "E_NO_LANGUAGE_SERVER",
    "message": "prepareCallHierarchy returned no items. LSP may not support call hierarchy for this language. Not supported: C# (OmniSharp)."
  }
}
```

**Workaround**: Use `symbol.navigate` with `action="references"` to find call sites.

---

## Dart

**LSP Provider**: Dart Analysis Server

**Installation**: `Dart-Code.dart-code` extension

### Support Level: ✅ Full

All features work comprehensively with Dart:

- **References**: ✅ Full support
- **Implementations**: ✅ Finds class implementations
- **Rename**: ✅ Updates imports and references
- **Replace Method**: ✅ Full support including async methods
- **Call Hierarchy**: ✅ Full support

### Example Usage

```bash
# Find references in Flutter app
vscb script run symbol.navigate \
  --param path="lib/services/auth_service.dart" \
  --param symbol="AuthService.login" \
  --param action="references"

# Find call hierarchy
vscb script run symbol.calls \
  --param path="lib/utils/validators.dart" \
  --param symbol="validateEmail" \
  --param direction="incoming"
```

### Known Limitations

- None - Dart has excellent LSP support

---

## Go

**LSP Provider**: gopls (Go Language Server)

**Installation**: `golang.go` extension

### Support Level: ✅ Full

All features work comprehensively with Go:

- **References**: ✅ Full support
- **Implementations**: ✅ Finds interface implementations
- **Rename**: ✅ Updates package imports
- **Replace Method**: ✅ Full support
- **Call Hierarchy**: ✅ Full support

### Example Usage

```bash
# Find interface implementations
vscb script run symbol.navigate \
  --param path="internal/service/interface.go" \
  --param symbol="Service" \
  --param action="implementations"
```

### Known Limitations

- None - Go has excellent LSP support via gopls

---

## Rust

**LSP Provider**: rust-analyzer

**Installation**: `rust-lang.rust-analyzer` extension

### Support Level: ✅ Full

All features work comprehensively with Rust:

- **References**: ✅ Full support
- **Implementations**: ✅ Finds trait implementations
- **Rename**: ✅ Updates use statements
- **Replace Method**: ✅ Full support
- **Call Hierarchy**: ✅ Full support

### Example Usage

```bash
# Find trait implementations
vscb script run symbol.navigate \
  --param path="src/traits.rs" \
  --param symbol="Serialize" \
  --param action="implementations"
```

### Known Limitations

- None - Rust has excellent LSP support via rust-analyzer

---

## Extension Requirements

To use LSP navigation with a language, install the appropriate VS Code extension:

| Language | Extension ID | Extension Name |
|----------|-------------|----------------|
| TypeScript/JavaScript | Built-in | TypeScript and JavaScript Language Features |
| Python | `ms-python.python` | Python (includes Pylance) |
| Java | `redhat.java` | Language Support for Java |
| C# | `ms-dotnettools.csdevkit` | C# Dev Kit |
| Dart | `Dart-Code.dart-code` | Dart |
| Go | `golang.go` | Go |
| Rust | `rust-lang.rust-analyzer` | rust-analyzer |

**Installation**: Open VS Code Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`) and search for the extension ID.

---

## Language Server Indexing

When you first open a workspace, language servers need time to index symbols:

| Language | Typical Indexing Time | Notes |
|----------|----------------------|-------|
| TypeScript | 1-5 seconds | Fast for small/medium projects |
| Python | 2-8 seconds | Depends on installed packages |
| Java | 5-15 seconds | Maven/Gradle dependencies slow initial load |
| C# | 3-10 seconds | Solution size dependent |
| Dart | 2-5 seconds | Fast indexing |
| Go | 1-3 seconds | Very fast with gopls |
| Rust | 5-20 seconds | Cargo dependencies impact speed |

**First operation may timeout** during indexing. Retry after a few seconds.

---

## Testing LSP Features

Quick test to verify LSP works in your language:

```bash
# 1. Check language server is active
# Open a file in VS Code - you should see IntelliSense working

# 2. Test symbol navigation
vscb script run symbol.navigate \
  --param path="path/to/your/file.ext" \
  --param symbol="SomeSymbol" \
  --param action="references"

# Success: Language server working
{ "ok": true, "data": { "locations": [...] } }

# Error: Install language extension
{
  "ok": false,
  "error": {
    "code": "E_NO_LANGUAGE_SERVER",
    "message": "No references provider available for this file type. [Language]: Ensure [Extension] is installed and activated."
  }
}
```

---

## Next Steps

- [API Reference](./4-api-reference.md) - Complete API documentation
- [Troubleshooting](./6-troubleshooting.md) - Debug language server issues
- [Quickstart Guide](./2-quickstart.md) - Try examples in your language
