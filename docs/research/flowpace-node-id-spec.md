# Flowspace Node ID Specification

## Overview

Flowspace Node IDs are a hierarchical identifier system for uniquely referencing code elements across programming languages. These IDs enable cross-file relationships, semantic queries, and code graph construction in language-agnostic tooling.

Each Node ID encodes three key pieces of information:
1. The **type** of code element (file, class, method, function, etc.)
2. The **file path** where it's defined
3. The **qualified name** with hierarchical context

## Format Specification

### General Pattern

Node IDs follow a colon-separated format:

```
<type>:<file_path>:<qualified_name>
```

### Components

| Component | Description | Example |
|-----------|-------------|---------|
| `type` | Node type identifier | `file`, `class`, `method`, `function`, `content`, `import` |
| `file_path` | Relative path to source file | `src/calculator.py` |
| `qualified_name` | Hierarchical name with context | `Calculator.add` |

### Separators

| Separator | Purpose | Example |
|-----------|---------|---------|
| `:` (colon) | Primary delimiter between components | `class:src/calc.py:Calculator` |
| `.` (dot) | Separates class hierarchy and methods | `Calculator.add`, `Outer.Inner` |
| `/` (slash) | File path separator | `src/core/query.py` |

## Node Types

### File Node

Represents a source code file in a programming language.

**Format**: `file:<file_path>`

**Examples**:
```
file:src/calculator.py
file:src/core/query/models.py
file:tests/test_calculator.py
```

### Content Node

Represents a non-programming file (documentation, configuration, etc.).

**Format**: `content:<file_path>`

**Examples**:
```
content:docs/README.md
content:config.yaml
content:.gitignore
```

### Class Node

Represents a class definition (or equivalent type construct).

**Format**: `class:<file_path>:<class_name>`

**Examples**:
```
class:src/calculator.py:Calculator
class:src/core/query/models.py:QuerySpec
class:src/utils/helpers.py:ValidationError
```

**Nested Classes**:
```
class:src/geometry.py:Shape.Circle
class:src/ui/components.py:Layout.Grid.Cell
```

### Method Node

Represents a method within a class.

**Format**: `method:<file_path>:<class_name>.<method_name>`

**Examples**:
```
method:src/calculator.py:Calculator.add
method:src/calculator.py:Calculator.subtract
method:src/calculator.py:Calculator.__init__
```

**Nested Class Methods**:
```
method:src/geometry.py:Shape.Circle.calculate_area
```

### Function Node

Represents a standalone function (not within a class).

**Format**: `function:<file_path>:<function_name>`

**Examples**:
```
function:src/utils.py:validate_input
function:src/helpers.py:process_data
function:tests/test_utils.py:setup_test_env
```

### Import Node

Represents an import statement.

**Format**: `import:<file_path>:<module>`

**Examples**:
```
import:src/main.py:os
import:src/calculator.py:math
import:src/core/query.py:networkx
```

## Parsing Rules

### Component Extraction

**File/Content Nodes** (single colon):
- Split at first colon
- Everything after colon is the file path

**Other Nodes** (two colons):
- Split at **last** colon to handle paths with colons (Windows)
- First part: type
- Middle part: file path
- Last part: qualified name

### Nested Class Handling

For qualified names containing dots (e.g., `Shape.Circle.calculate_area`):
- Split at **last** dot to separate the final identifier
- Everything before last dot: class hierarchy
- Everything after last dot: method/attribute name

**Examples**:
```
method:src/geo.py:Shape.Circle.area
                  └─────┬─────┘ └─┬─┘
                   class hierarchy  method name
```

### Special Method Names

Language-specific special methods (constructors, operators, etc.) are preserved as-is:

```
method:src/calculator.py:Calculator.__init__
method:src/operators.py:Matrix.__add__
method:src/items.py:List.__getitem__
```

## Simplified Patterns for Querying

For convenience, queries may use simplified patterns that omit the file path component.

### Format

```
<type>:<name>
```

### Examples

```
class:Calculator       → matches any Calculator class in any file
method:add             → matches any add method in any class
function:validate      → matches any validate function in any file
```

### Pattern Transformation

Simplified patterns are conceptually expanded to match full Node IDs:

| Simplified Pattern | Matches Full Node IDs Like |
|-------------------|---------------------------|
| `class:Calculator` | `class:*/path:Calculator` |
| `method:add` | `method:*/path:*.add` |
| `function:validate` | `function:*/path:validate` |

Note: The actual matching mechanism (regex, glob, etc.) is implementation-specific.

## Special Cases

### Nested Classes

Nested classes use dot notation in the class name:

```
class:src/geometry.py:Shape.Circle
class:src/geometry.py:Shape.Circle.Point
```

Methods of nested classes maintain the full hierarchy:

```
method:src/geometry.py:Shape.Circle.calculate_area
method:src/geometry.py:Shape.Circle.Point.distance
```

### Constructor Methods

Language-specific constructor naming is preserved:

```
method:src/calculator.py:Calculator.__init__     (Python)
method:src/Calculator.cs:Calculator.Calculator   (C#)
method:src/Calculator.java:Calculator.Calculator (Java)
```

### Windows Paths

Windows paths must be distinguished from Node IDs when parsing:

```
C:\Users\file.py         → Windows path (not a Node ID)
file:C:/Users/file.py    → Valid Node ID with Windows path
```

Detection: Check if string matches pattern `^[A-Za-z]:[\\\/]` before treating as Node ID.

### Generic Types

Generic type parameters are not included in Node IDs. They should be stored as metadata.

```
class:src/Container.cs:Container     (not Container<T>)
class:src/List.java:List             (not List<E>)
```

### Anonymous Functions

Functions without proper names should generate a unique identifier (UUID or hash-based):

```
function:src/callbacks.py:<uuid>
function:src/handlers.js:lambda_a3f9c2
```

## Usage Patterns

### Exact Lookup

Use the complete Node ID for precise element lookup:

```
method:src/calculator.py:Calculator.add
```

### Simplified Query

Use simplified pattern to find elements by name across files:

```
class:Calculator
method:add
function:validate
```

### Pattern Matching

Use wildcards or regex patterns for broader searches:

```
class:*Calculator*        → matches Calculator, CalculatorImpl, etc.
method:*.calculate*       → matches calculate, calculate_total, etc.
function:test_*           → matches all test functions
```

### Hierarchical Queries

Query by file to find all elements in that file:

```
*:src/calculator.py:*     → all elements in calculator.py
class:src/utils/*:*       → all classes in utils directory
```

## Examples

### Simple Python Module

```
file:src/calculator.py
class:src/calculator.py:Calculator
method:src/calculator.py:Calculator.__init__
method:src/calculator.py:Calculator.add
method:src/calculator.py:Calculator.subtract
function:src/calculator.py:main
```

### Nested TypeScript Classes

```
file:src/geometry.ts
class:src/geometry.ts:Shape
class:src/geometry.ts:Shape.Circle
class:src/geometry.ts:Shape.Rectangle
method:src/geometry.ts:Shape.Circle.area
method:src/geometry.ts:Shape.Rectangle.area
```

### Go Package

```
file:src/calculator.go
function:src/calculator.go:Add
function:src/calculator.go:Subtract
method:src/calculator.go:Calculator.Calculate
```

### Documentation File

```
content:docs/README.md
content:docs/api.md
content:config/settings.yaml
```

## Validation

A valid Node ID must satisfy:

1. **File/Content nodes**: `^(file|content):[\\w\\-./]+$`
2. **Other nodes**: `^(class|method|function|import):[\\w\\-./]+:[\\w\\-.]+$`

Additional constraints:
- Type must be a known node type
- File path must not be empty
- Qualified name must not be empty (except for file/content nodes)
- Separators must be used consistently

## Design Rationale

### Why Colons?

Colons are:
- Rare in file paths (except Windows drives, which can be detected)
- Visually distinct from dot notation
- Commonly used in URI schemes and namespaces

### Why Qualified Names?

Qualified names (e.g., `Calculator.add`) provide:
- Context for disambiguation (which `add` method?)
- Natural hierarchical structure
- Language-agnostic representation

### Why File Paths?

Including file paths enables:
- Unambiguous identification across large codebases
- Direct source location lookup
- Multi-file refactoring and analysis
