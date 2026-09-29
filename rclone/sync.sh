#!/bin/bash
set -e

# Runtime-configurable paths via environment variables
CONFIG_FILE="${CONFIG_FILE:-/workspace/config.yml}"
BACKUPS_DIR="${BACKUPS_DIR:-/workspace/backups}"
RCLONE_CONFIG="${RCLONE_CONFIG:-/workspace/rclone/rclone.conf}"

echo "Using config: $CONFIG_FILE"
echo "Backups directory: $BACKUPS_DIR"
echo "Rclone config: $RCLONE_CONFIG"

# Validate files exist
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: Config file not found at $CONFIG_FILE"
  exit 1
fi

if [ ! -f "$RCLONE_CONFIG" ]; then
  echo "ERROR: rclone.conf not found at $RCLONE_CONFIG"
  echo "Create it using: rclone config"
  exit 1
fi

if [ ! -d "$BACKUPS_DIR" ]; then
  echo "ERROR: Backups directory not found at $BACKUPS_DIR"
  exit 1
fi

# Check if rclone enabled in config
ENABLED=$(yq eval '.system.rclone.enabled // false' "$CONFIG_FILE")
if [ "$ENABLED" != "true" ]; then
  echo "Rclone sync is disabled in config"
  exit 0
fi

# Parse config values
REMOTE=$(yq eval '.system.rclone.remote' "$CONFIG_FILE")
SYNC_CMD=$(yq eval '.system.rclone.sync_command // "sync"' "$CONFIG_FILE")
DRY_RUN=$(yq eval '.system.rclone.dry_run // false' "$CONFIG_FILE")

# Parse ntfy config
NTFY_URL=$(yq eval '.system.ntfy.url // ""' "$CONFIG_FILE")
NTFY_TOPIC=$(yq eval '.system.ntfy.topic // ""' "$CONFIG_FILE")
NTFY_USER=$(yq eval '.system.ntfy.username // ""' "$CONFIG_FILE")
NTFY_PASS=$(yq eval '.system.ntfy.password // ""' "$CONFIG_FILE")

send_notification() {
  local title="$1"
  local body="$2"
  local priority="${3:-default}"
  local tags="${4:-cloud}"

  if [ -z "$NTFY_URL" ] || [ -z "$NTFY_TOPIC" ]; then
    return
  fi

  local auth_header=""
  if [ -n "$NTFY_USER" ] && [ -n "$NTFY_PASS" ]; then
    auth_header="-u ${NTFY_USER}:${NTFY_PASS}"
  fi

  curl -s --max-time 30 \
    $auth_header \
    -H "Title: $title" \
    -H "Priority: $priority" \
    -H "Tags: $tags" \
    -d "$body" \
    "${NTFY_URL}/${NTFY_TOPIC}" > /dev/null 2>&1 || true
}

# Build base command
RCLONE_CMD="rclone $SYNC_CMD $BACKUPS_DIR $REMOTE --config=$RCLONE_CONFIG --stats-one-line --stats=0"

# Add flags from config
mapfile -t FLAGS < <(yq eval '.system.rclone.flags[]? // ""' "$CONFIG_FILE")
for flag in "${FLAGS[@]}"; do
  [ -n "$flag" ] && RCLONE_CMD="$RCLONE_CMD $flag"
done

# Add excludes from config
mapfile -t EXCLUDES < <(yq eval '.system.rclone.exclude[]? // ""' "$CONFIG_FILE")
for exclude in "${EXCLUDES[@]}"; do
  [ -n "$exclude" ] && RCLONE_CMD="$RCLONE_CMD --exclude '$exclude'"
done

# Add dry-run if enabled
if [ "$DRY_RUN" = "true" ]; then
  RCLONE_CMD="$RCLONE_CMD --dry-run"
  echo "DRY RUN MODE - No files will be transferred"
fi

# Execute sync and capture output
echo "Starting rclone sync..."
echo "Command: $RCLONE_CMD"

START_TIME=$(date +%s)

if OUTPUT=$(eval $RCLONE_CMD 2>&1); then
  END_TIME=$(date +%s)
  DURATION=$(( END_TIME - START_TIME ))
  MINUTES=$(( DURATION / 60 ))
  SECONDS=$(( DURATION % 60 ))

  # Extract stats from rclone output
  TRANSFERRED=$(echo "$OUTPUT" | sed -n 's/.*Transferred:[[:space:]]*//p' | tail -1)
  ERRORS=$(echo "$OUTPUT" | sed -n 's/.*Errors:[[:space:]]*\([0-9]*\).*/\1/p' | tail -1)
  CHECKS=$(echo "$OUTPUT" | sed -n 's/.*Checks:[[:space:]]*\([0-9]*\).*/\1/p' | tail -1)

  # Get remote size
  echo "Getting remote size..."
  REMOTE_SIZE=""
  if SIZE_OUTPUT=$(rclone size "$REMOTE" --config="$RCLONE_CONFIG" 2>&1); then
    REMOTE_SIZE=$(echo "$SIZE_OUTPUT" | grep "Total size:" | sed -n 's/Total size: \([^(]*\).*/\1/p' | xargs)
  fi

  if [ "$DRY_RUN" = "true" ]; then
    TITLE="Rclone Sync (Dry Run)"
  else
    TITLE="Rclone Sync Complete"
  fi

  BODY="📁 ${REMOTE}
⌛ ${MINUTES}m${SECONDS}s"
  [ -n "$REMOTE_SIZE" ] && BODY="${BODY}
💾 Remote size: ${REMOTE_SIZE}"
  [ -n "$TRANSFERRED" ] && BODY="${BODY}
📦 Transferred: ${TRANSFERRED}"
  [ -n "$CHECKS" ] && [ "$CHECKS" != "0" ] && BODY="${BODY}
🔍 Checks: ${CHECKS}"
  [ -n "$ERRORS" ] && [ "$ERRORS" != "0" ] && BODY="${BODY}
⚠️ Errors: ${ERRORS}"
  BODY="${BODY}

😉, Babak"

  echo "$OUTPUT"
  echo "Sync completed in ${MINUTES}m${SECONDS}s"
  send_notification "$TITLE" "$BODY" "default" "cloud,success"
else
  EXIT_CODE=$?
  END_TIME=$(date +%s)
  DURATION=$(( END_TIME - START_TIME ))

  echo "$OUTPUT"
  echo "ERROR: Rclone sync failed with exit code $EXIT_CODE"

  BODY="📁 ${REMOTE}
❌ Exit code: ${EXIT_CODE}

${OUTPUT:0:500}

😉, Babak"

  send_notification "Rclone Sync Failed" "$BODY" "high" "cloud,error"
  exit $EXIT_CODE
fi
