#!/usr/bin/env python3
"""
Update Claude Code settings to auto-allow all VSC-Bridge MCP tools.

This script adds all mcp__vsc-bridge__* tools to the permissions.allow array
in .claude/settings.local.json, preserving existing permissions.
"""

import json
import sys
from pathlib import Path
from typing import Dict, List, Any

# All VSC-Bridge MCP tools available in Claude Code
VSC_BRIDGE_MCP_TOOLS = [
    "mcp__vsc-bridge__breakpoint_clear_file",
    "mcp__vsc-bridge__breakpoint_clear_project",
    "mcp__vsc-bridge__breakpoint_list",
    "mcp__vsc-bridge__breakpoint_remove",
    "mcp__vsc-bridge__breakpoint_set",
    "mcp__vsc-bridge__dap_compare",
    "mcp__vsc-bridge__dap_exceptions",
    "mcp__vsc-bridge__dap_filter",
    "mcp__vsc-bridge__dap_logs",
    "mcp__vsc-bridge__dap_search",
    "mcp__vsc-bridge__dap_stats",
    "mcp__vsc-bridge__dap_summary",
    "mcp__vsc-bridge__dap_timeline",
    "mcp__vsc-bridge__debug_continue",
    "mcp__vsc-bridge__debug_evaluate",
    "mcp__vsc-bridge__debug_get_variable",
    "mcp__vsc-bridge__debug_list_variables",
    "mcp__vsc-bridge__debug_restart",
    "mcp__vsc-bridge__debug_save_variable",
    "mcp__vsc-bridge__debug_scopes",
    "mcp__vsc-bridge__debug_set_variable",
    "mcp__vsc-bridge__debug_stack",
    "mcp__vsc-bridge__debug_start",
    "mcp__vsc-bridge__debug_status",
    "mcp__vsc-bridge__debug_step_into",
    "mcp__vsc-bridge__debug_step_out",
    "mcp__vsc-bridge__debug_step_over",
    "mcp__vsc-bridge__debug_stop",
    "mcp__vsc-bridge__debug_threads",
    "mcp__vsc-bridge__debug_tracker",
    "mcp__vsc-bridge__debug_wait_for_hit",
    "mcp__vsc-bridge__diagnostic_collect",
    "mcp__vsc-bridge__test_debug_single",
    "mcp__vsc-bridge__test_show_testing_ui",
    "mcp__vsc-bridge__util_restart_vscode",
    "mcp__vsc-bridge__bridge_status",
]


def load_settings(settings_path: Path) -> Dict[str, Any]:
    """Load settings from JSON file, or return default structure."""
    if settings_path.exists():
        try:
            with open(settings_path, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            print(f"Warning: Invalid JSON in {settings_path}: {e}", file=sys.stderr)
            print("Creating new settings structure...", file=sys.stderr)

    # Default structure
    return {
        "permissions": {
            "allow": [],
            "deny": [],
            "ask": []
        },
        "spinnerTipsEnabled": True
    }


def update_permissions(settings: Dict[str, Any]) -> Dict[str, Any]:
    """Add VSC-Bridge MCP tools to permissions.allow, preserving existing entries."""
    # Ensure permissions structure exists
    if "permissions" not in settings:
        settings["permissions"] = {"allow": [], "deny": [], "ask": []}

    if "allow" not in settings["permissions"]:
        settings["permissions"]["allow"] = []

    # Get existing allow list
    allow_list = settings["permissions"]["allow"]

    # Remove existing vsc-bridge tools (we'll re-add them all)
    allow_list = [
        item for item in allow_list
        if not (isinstance(item, str) and item.startswith("mcp__vsc-bridge__"))
    ]

    # Add all VSC-Bridge tools
    allow_list.extend(VSC_BRIDGE_MCP_TOOLS)

    # Update settings
    settings["permissions"]["allow"] = allow_list

    return settings


def save_settings(settings: Dict[str, Any], settings_path: Path) -> None:
    """Save settings to JSON file with pretty formatting."""
    settings_path.parent.mkdir(parents=True, exist_ok=True)

    with open(settings_path, 'w') as f:
        json.dump(settings, f, indent=2)
        f.write('\n')  # Add trailing newline


def main():
    """Main entry point."""
    # Determine settings path (default to .claude/settings.local.json in current directory)
    if len(sys.argv) > 1:
        settings_path = Path(sys.argv[1])
    else:
        settings_path = Path.cwd() / '.claude' / 'settings.local.json'

    print(f"Updating Claude Code settings: {settings_path}")

    # Load, update, and save
    settings = load_settings(settings_path)
    settings = update_permissions(settings)
    save_settings(settings, settings_path)

    print(f"✓ Added {len(VSC_BRIDGE_MCP_TOOLS)} VSC-Bridge MCP tools to permissions.allow")
    print(f"✓ Settings saved to {settings_path}")


if __name__ == "__main__":
    main()

# Usage:
#   ./scripts/update-claude-mcp-permissions.py                    # Updates .claude/settings.local.json in current directory
#   ./scripts/update-claude-mcp-permissions.py /path/to/file.json # Updates specific file
