#!/bin/bash
set -e

# LiteLLM Docker Runner
# Starts LiteLLM proxy server in Docker with GitHub Copilot configuration

echo "🚀 Starting LiteLLM proxy server..."

# Check if container already exists
if docker ps -a --format '{{.Names}}' | grep -q '^litellm$'; then
    echo "  Container 'litellm' already exists"

    # Check if it's running
    if docker ps --format '{{.Names}}' | grep -q '^litellm$'; then
        echo "  ✅ LiteLLM is already running"
        echo "  To restart: docker restart litellm"
        echo "  To stop: docker stop litellm"
        echo "  To remove: docker rm -f litellm"
        exit 0
    else
        echo "  Starting existing container..."
        docker start litellm
        echo "  ✅ LiteLLM started successfully"
        exit 0
    fi
fi

# Check if config file exists
if [ ! -f "${HOME}/.config/litellm/config.yaml" ]; then
    echo "  ❌ Config file not found: ${HOME}/.config/litellm/config.yaml"
    echo "  Run the devcontainer post-install script or create the config manually"
    exit 1
fi

# Start new container
echo "  Creating and starting LiteLLM container..."
docker run \
    -d \
    -p '4000:4000' \
    -v "${HOME}/.config/litellm:/root/.config/litellm" \
    --name 'litellm' \
    --restart 'unless-stopped' \
    ghcr.io/berriai/litellm:main-stable \
    --config '/root/.config/litellm/config.yaml'

echo "  ✅ LiteLLM started successfully"
echo ""
echo "📋 Connection Details:"
echo "   Proxy URL: http://localhost:4000"
echo "   Config: ${HOME}/.config/litellm/config.yaml"
echo ""
echo "🔧 Management Commands:"
echo "   View logs: docker logs -f litellm"
echo "   Stop: docker stop litellm"
echo "   Restart: docker restart litellm"
echo "   Remove: docker rm -f litellm"
