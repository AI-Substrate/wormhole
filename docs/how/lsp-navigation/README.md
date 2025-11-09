# LSP Navigation & Code Intelligence Documentation

Comprehensive documentation for VSC-Bridge's semantic code navigation features using Language Server Protocol (LSP).

## Quick Navigation

1. **[Overview](./1-overview.md)** - Introduction to semantic navigation, Flowspace IDs, and architecture
2. **[Quickstart Guide](./2-quickstart.md)** - Get started in 5 minutes with real examples
3. **[Flowspace ID Reference](./3-flowspace-ids.md)** - Complete format specification and parsing rules
4. **[API Reference](./4-api-reference.md)** - Full parameter documentation for all 4 tools
5. **[Language Support](./5-language-support.md)** - Feature matrix and language-specific notes
6. **[Troubleshooting](./6-troubleshooting.md)** - Common errors and solutions

## The Four Tools

| Tool | Purpose | Documentation |
|------|---------|---------------|
| **symbol.navigate** | Find references and implementations | [API Reference](./4-api-reference.md#symbolnavigate) |
| **symbol.rename** | Rename symbols workspace-wide | [API Reference](./4-api-reference.md#symbolrename) |
| **code.replace-method** | Replace method declarations | [API Reference](./4-api-reference.md#codereplace-method) |
| **symbol.calls** | Call hierarchy (incoming/outgoing) | [API Reference](./4-api-reference.md#symbolcalls) |

## Quick Examples

**Find references**:
```bash
vscb script run symbol.navigate \
  --param nodeId="method:src/Calculator.ts:Calculator.add" \
  --param action="references"
```

**Rename class**:
```bash
vscb script run symbol.rename \
  --param path="src/Calculator.ts" \
  --param symbol="Calculator" \
  --param newName="MathCalculator"
```

**Replace method**:
```bash
vscb script run code.replace-method \
  --param path="src/utils.ts" \
  --param symbol="formatDate" \
  --param replacement="export function formatDate(date: Date): string {
  return date.toISOString();
}"
```

**Find callers**:
```bash
vscb script run symbol.calls \
  --param path="src/api.ts" \
  --param symbol="handleRequest" \
  --param direction="incoming"
```

## Key Concepts

### Flowspace Node IDs

Position-independent semantic identifiers:

```
{type}:{file_path}:{qualified_symbol_name}
```

Examples:
- `class:src/auth/service.ts:AuthService`
- `method:src/auth/service.ts:AuthService.authenticate`
- `function:src/utils/validators.ts:validateEmail`

**Why use Flowspace IDs?**
- ✅ Work across file refactorings
- ✅ No line/character position needed
- ✅ AI-friendly semantic navigation
- ✅ Position-independent automation

### Symbol Names

Simple dot-notation for symbols within a file:

```bash
--param symbol="Calculator.add"  # Method in class
--param symbol="validateEmail"   # Top-level function
```

## Language Support

| Language | References | Rename | Call Hierarchy |
|----------|-----------|--------|----------------|
| TypeScript | ✅ | ✅ | ✅ |
| Python | ✅ | ✅ | ✅ |
| Java | ✅ | ✅ | ✅ |
| C# | ✅ | ✅ | ❌ |
| Dart | ✅ | ✅ | ✅ |
| Go | ✅ | ✅ | ✅ |

See [Language Support](./5-language-support.md) for complete matrix and language-specific notes.

## Common Use Cases

### For AI Agents
- Navigate code semantically without cursor positions
- Refactor code using Flowspace IDs
- Understand call relationships programmatically

### For Automation
- Batch rename operations across repos
- Automated code refactoring in CI/CD
- Code generation with accurate reference finding

### For Developers
- Quick CLI-based navigation
- Scriptable code exploration
- Position-independent code analysis

## Prerequisites

1. **VS Code** with VSC-Bridge extension installed
2. **vscb CLI** installed globally
3. **Language extension** for your language (e.g., Python extension for `.py` files)

See [Quickstart Guide](./2-quickstart.md#prerequisites) for detailed setup instructions.

## Getting Started

1. **New to LSP navigation?** Start with [Overview](./1-overview.md)
2. **Want to try it now?** Jump to [Quickstart Guide](./2-quickstart.md)
3. **Building tools?** Read [Flowspace ID Reference](./3-flowspace-ids.md)
4. **Need full API docs?** See [API Reference](./4-api-reference.md)
5. **Having issues?** Check [Troubleshooting](./6-troubleshooting.md)

## Additional Resources

- [VSC-Bridge Main README](../../../README.md) - Project overview and installation
- [How Scripts Work](../how-scripts-work.md) - Understanding VSC-Bridge script architecture
- [GitHub Repository](https://github.com/AI-Substrate/vsc-bridge) - Source code and issues

## Contributing

Found an issue or want to improve the documentation? See our [Contributing Guide](../../../CONTRIBUTING.md).

---

**Need help?** Check [Troubleshooting](./6-troubleshooting.md) or [open an issue](https://github.com/AI-Substrate/vsc-bridge/issues).
