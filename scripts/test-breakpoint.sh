#!/bin/bash

# Test script for debugging breakpoint detection
# Usage: ./test-breakpoint.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Testing breakpoint detection (built-in script)...${NC}"
echo "File: /Users/jordanknight/github/vsc-bridge/test/python/test_example.py"
echo "Line: 38"
echo ""

# Navigate to test directory
cd /Users/jordanknight/github/vsc-bridge/test

# Run the built-in test debug script
echo -e "${GREEN}Running tests.debug-single...${NC}"
vscb script run tests.debug-single \
  -p path=/Users/jordanknight/github/vsc-bridge/test/python/test_example.py \
  -p line=38

# Check exit code
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Script completed successfully${NC}"
else
    echo -e "${RED}✗ Script failed${NC}"
fi