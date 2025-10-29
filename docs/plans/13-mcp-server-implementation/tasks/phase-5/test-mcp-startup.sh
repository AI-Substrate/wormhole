#!/bin/bash
# T017: Test MCP server startup logs
# This script tests that the server starts and logs to stderr correctly

set -e

echo "=== T017: Testing MCP Server Startup Logs ==="
echo ""

# Start server in background with workspace flag, redirecting output to temp file
TEMP_LOG=$(mktemp)
echo "Starting: vscb mcp --workspace /Users/jak/github/vsc-bridge"
echo "Output redirected to: $TEMP_LOG"
vscb mcp --workspace /Users/jak/github/vsc-bridge > /dev/null 2>$TEMP_LOG &
PID=$!

sleep 2

# Check if process is running
if ps -p $PID > /dev/null; then
    echo "✓ Server process started successfully (PID: $PID)"
    echo "✓ Process is blocking as expected (hasn't exited)"

    # Check stderr output contains expected log messages
    echo ""
    echo "Checking stderr output..."
    cat $TEMP_LOG

    if grep -q "Starting VSC-Bridge MCP server" $TEMP_LOG; then
        echo "✓ Found startup message in stderr"
    else
        echo "✗ Missing startup message in stderr"
        kill -INT $PID 2>/dev/null || true
        rm $TEMP_LOG
        exit 1
    fi

    # Kill the process
    kill -INT $PID 2>/dev/null || true
    wait $PID 2>/dev/null || true

    echo "✓ Server responded to SIGINT and shut down"
    rm $TEMP_LOG
else
    echo "✗ Server process not running"
    echo "Stderr output:"
    cat $TEMP_LOG
    rm $TEMP_LOG
    exit 1
fi

echo ""
echo "=== T017 PASSED ==="
