#!/bin/bash

echo "Clearing VS Code test cache and rebuilding..."

# Clear VS Code test installations
rm -rf extension/.vscode-test

# Clear compiled output
rm -rf extension/out

# Clear any npm cache
npm cache clean --force 2>/dev/null || true

# Reinstall dependencies
echo "Reinstalling dependencies..."
npm install

# Rebuild everything
echo "Rebuilding extension..."
cd extension
npm run compile-tests
npm run compile

echo ""
echo "✅ Cache cleared and rebuilt!"
echo ""
echo "Next steps:"
echo "1. Close VS Code completely (Cmd+Q on Mac)"
echo "2. Reopen VS Code"
echo "3. Open the Testing sidebar (flask icon)"
echo "4. Click the refresh button in the Testing sidebar"
echo "5. Tests should now discover correctly"