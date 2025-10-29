#!/bin/bash

# Test script for debugging JavaScript breakpoint detection
# Usage: ./test-breakpoint-js.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing JavaScript breakpoint detection (built-in script)...${NC}"
echo "File: /Users/jordanknight/github/vsc-bridge/test/javascript/example.test.js"
echo "Line: 86 (sum calculation in Array Operations test)"
echo ""

# Navigate to test directory
cd /Users/jordanknight/github/vsc-bridge/test

# Run the built-in test debug script
echo -e "${GREEN}Running tests.debug-single for JavaScript...${NC}"
vscb script run tests.debug-single \
  -p path=/Users/jordanknight/github/vsc-bridge/test/javascript/example.test.js \
  -p line=86

# Check exit code
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Script completed successfully${NC}"
else
    echo -e "${RED}✗ Script failed${NC}"
fi