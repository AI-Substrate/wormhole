---
# TEST FIXTURE: Wrong Field Types
# Purpose: Tests type validation - tool_name as number instead of string
# Expected: Parser should reject with type error (tool_name must be string)
# Addresses: Phase 2 validation requirements for YAML schema enforcement
tool_name: 12345
description: "Test documentation with wrong type for tool_name"
category: testing
---

# Test Content

This fixture tests that the parser validates field types correctly.
