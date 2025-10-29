FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bookworm

# Expose TARGETARCH for multi-architecture builds (buildx sets this automatically)
ARG TARGETARCH

# Install Dart SDK using official Debian repository
# https://dart.dev/get-dart
# Supports: amd64, arm64, armhf, riscv64
RUN apt-get update && apt-get install -y wget apt-transport-https \
    && wget -qO- https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/dart.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/dart.gpg arch=${TARGETARCH}] https://storage.googleapis.com/download.dartlang.org/linux/debian stable main" | tee /etc/apt/sources.list.d/dart_stable.list \
    && apt-get update \
    && apt-get install -y dart \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Add Dart to PATH
ENV PATH="/usr/lib/dart/bin:${PATH}"

# Install and configure SSH server for remote access
# Manual installation replaces unreliable devcontainer sshd feature
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssh-server \
    openssh-client && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Configure SSH server
# Port 22 (standard SSH port inside container, mapped to custom port on host)
# Public key authentication enabled, password authentication disabled
RUN mkdir -p /var/run/sshd && \
    sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && \
    echo "PermitRootLogin no" >> /etc/ssh/sshd_config

# Allow node user to start SSH service without password
# Required because postStartCommand runs as non-root user
RUN echo "node ALL=(ALL) NOPASSWD: /usr/sbin/service ssh start" >> /etc/sudoers.d/node-ssh && \
    chmod 0440 /etc/sudoers.d/node-ssh

# Create SSH auto-start script
RUN echo '#!/bin/bash\n\
# Auto-start SSH server on container startup\n\
# Uses sudo because postStartCommand runs as non-root user\n\
if [ ! -f /var/run/sshd.pid ]; then\n\
    sudo service ssh start\n\
fi' > /usr/local/share/ssh-init.sh && \
    chmod +x /usr/local/share/ssh-init.sh
