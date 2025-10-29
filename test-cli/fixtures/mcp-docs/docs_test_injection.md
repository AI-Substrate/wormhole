---
# TEST FIXTURE: YAML Injection Attack
# Purpose: Tests security - YAML injection with malicious payload
# Expected: Parser should safely handle or reject malicious YAML constructs
# Addresses: Critical Discovery 03 - YAML security (use safe schema, no arbitrary code)
tool_name: docs_test_injection
description: "Test YAML injection payload"
category: testing
malicious_field: !!python/object/apply:os.system ["echo 'EXPLOITED'"]
tags: ["security", "injection"]
---

# Test Content

This fixture contains a YAML injection attempt using !!python/object tag.
The parser MUST use safe YAML loading that rejects such payloads.
