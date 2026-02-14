FROM oven/bun:1-alpine

WORKDIR /workspace

# Install system dependencies
RUN apk add --no-cache \
    openssh-client \
    sshfs \
    duplicity \
    gnupg \
    rsync \
    curl \
    fuse

# Copy package files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --production

# Copy source code
COPY src ./src
COPY index.ts ./
COPY tsconfig.json ./

# Create directories
RUN mkdir -p /backups /tmp/babak

# Entrypoint handles SSH + GPG setup, then runs babak
COPY entrypoint.sh ./
ENTRYPOINT ["/workspace/entrypoint.sh"]
