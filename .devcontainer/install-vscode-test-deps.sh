#!/bin/bash
# Install system libraries required for VS Code extension testing in headless environment
# VS Code uses Electron which requires GTK, X11, and D-Bus libraries even when running headless

set -e

echo "Installing VS Code test dependencies for headless Electron..."

sudo apt-get update
sudo apt-get install -y \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libatspi2.0-0 \
  libdbus-1-3 \
  libgbm1 \
  libgtk-3-0 \
  libxcomposite1 \
  libxdamage1 \
  libxfixes3 \
  libxrandr2 \
  libxkbcommon0 \
  xvfb

echo "✅ VS Code test dependencies installed"
echo "   You can now run: npm run test:extension"
echo "   Or with xvfb: xvfb-run -a npm run test:extension"
