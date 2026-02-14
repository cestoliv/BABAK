FROM rclone/rclone:latest

WORKDIR /sync

# Install dependencies for config parsing
RUN apk add --no-cache bash yq curl

# Copy and prepare sync script
COPY sync.sh /sync/sync.sh
RUN chmod +x /sync/sync.sh

ENTRYPOINT ["/sync/sync.sh"]
