---
# TEST FIXTURE: Missing docs_ Prefix
# Purpose: Tests prefix validation - tool_name missing required 'docs_' prefix
# Expected: Parser should reject tool names not matching pattern ^docs_[a-z0-9_]+$
# Addresses: Discovery 07 - docs_ prefix enforcement for documentation tools
# Note: Filename also intentionally missing docs_ prefix to match tool_name (KISS)
tool_name: test_missing_prefix
description: "Test documentation missing required docs_ prefix"
category: testing
---

# Test Content

This fixture tests that the parser enforces the docs_ prefix requirement.
