# Rclone Cloud Sync

This directory contains the rclone Docker container for syncing Babak backups to cloud storage.

## Quick Start

### 1. Create Rclone Configuration

Run `rclone config` somewhere (on your host, another machine, or in a temporary container) to configure your cloud provider. Then copy the resulting `rclone.conf` file to this directory:

```bash
# Copy your rclone.conf to this directory
cp ~/.config/rclone/rclone.conf ./rclone.conf
```

The `rclone.conf` file is gitignored for security.

### 2. Test Your Remote

List buckets/folders in your remote:

```bash
docker compose run --rm --entrypoint rclone rclone-sync lsd mybackup:
```

List all configured remotes:

```bash
docker compose run --rm --entrypoint rclone rclone-sync listremotes
```

### 3. Enable in Babak Config

Edit `../config.yml` and uncomment/add the rclone section:

```yaml
system:
  rclone:
    enabled: true
    remote: "mybackup:babak-backups"  # Format: remote-name:path
    sync_command: "sync"
    flags:
      - "--progress"
      - "--transfers=4"
    dry_run: false
```

### 4. Run Sync

```bash
docker compose run --rm rclone-sync
```

## Common Rclone Commands

All commands run from the project root directory.

### Configuration Management

```bash
# List configured remotes
docker compose run --rm --entrypoint rclone rclone-sync listremotes

# Show config file
docker compose run --rm --entrypoint rclone rclone-sync config show
```

### Testing & Browsing

```bash
# List directories in remote
docker compose run --rm --entrypoint rclone rclone-sync lsd mybackup:

# List all files in remote path
docker compose run --rm --entrypoint rclone rclone-sync ls mybackup:babak-backups

# Check remote size
docker compose run --rm --entrypoint rclone rclone-sync size mybackup:babak-backups

# Tree view of remote
docker compose run --rm --entrypoint rclone rclone-sync tree mybackup:babak-backups
```

### Manual Sync Operations

```bash
# Dry run (see what would be transferred)
docker compose run --rm --entrypoint rclone rclone-sync \
  sync /workspace/backups mybackup:babak-backups --dry-run -v

# Sync with progress
docker compose run --rm --entrypoint rclone rclone-sync \
  sync /workspace/backups mybackup:babak-backups --progress

# Copy only (never deletes)
docker compose run --rm --entrypoint rclone rclone-sync \
  copy /workspace/backups mybackup:babak-backups --progress

# Check differences
docker compose run --rm --entrypoint rclone rclone-sync \
  check /workspace/backups mybackup:babak-backups
```

### Advanced Usage

```bash
# Get an interactive shell
docker compose run --rm -it --entrypoint /bin/bash rclone-sync

# Inside the shell, you can run multiple commands:
rclone listremotes
rclone lsd mybackup:
rclone ls mybackup:babak-backups
exit

# Use custom config file location
docker compose run --rm \
  -e RCLONE_CONFIG=/workspace/custom-rclone.conf \
  rclone-sync

# Use custom backups directory
docker compose run --rm \
  -e BACKUPS_DIR=/workspace/custom-backups \
  rclone-sync
```

## Sync Commands Explained

- **sync**: Make destination identical to source (deletes remote files not in source)
  - Use when you want an exact mirror
  - ⚠️ Deletes files on remote that don't exist locally

- **copy**: Copy new/changed files only (never deletes)
  - Use when you want to keep all versions
  - Safe option, never removes data

- **move**: Move files to destination and delete from source
  - Use with extreme caution!
  - Will delete local backups after upload

## Remote Format Examples

- **AWS S3**: `s3:bucket-name/path`
- **Google Drive**: `gdrive:folder-name`
- **Backblaze B2**: `b2:bucket-name/path`
- **Dropbox**: `dropbox:folder-name`
- **SFTP/SSH**: `sftp:path/to/folder`

See [Rclone documentation](https://rclone.org/) for configuration instructions for your specific provider.

## Files

- `Dockerfile` - Container definition (based on rclone/rclone:latest)
- `sync.sh` - Sync orchestration script (reads Babak config.yml)
- `rclone.conf` - Your rclone configuration (gitignored, contains credentials)
- `.gitignore` - Excludes rclone.conf from version control

## Environment Variables

The sync script supports runtime configuration via environment variables:

- `CONFIG_FILE` - Path to Babak config (default: `/workspace/config.yml`)
- `BACKUPS_DIR` - Path to backups directory (default: `/workspace/backups`)
- `RCLONE_CONFIG` - Path to rclone config (default: `/workspace/rclone/rclone.conf`)

Example:
```bash
docker compose run --rm \
  -e CONFIG_FILE=/workspace/prod-config.yml \
  -e BACKUPS_DIR=/workspace/prod-backups \
  rclone-sync
```

## Troubleshooting

### "rclone.conf not found"

Make sure you've copied your `rclone.conf` file to `./rclone/rclone.conf`.

### "no remotes found"

List your remotes to verify configuration:

```bash
docker compose run --rm --entrypoint rclone rclone-sync listremotes
```

If empty, check that your `rclone.conf` file contains valid remote configurations.

### Test connection to remote

```bash
docker compose run --rm --entrypoint rclone rclone-sync lsd myremote:
```

### View sync script debug output

The sync script shows all commands before executing. Check the output for:
- Config file path
- Backups directory path
- Rclone config path
- Final rclone command being executed

### Permissions errors

Ensure the container can read:
- `../config.yml`
- `./rclone.conf`
- `../backups/` directory

All are mounted read-only, which is intentional for security.

## Security Notes

- `rclone.conf` contains cloud credentials and is **gitignored**
- Never commit `rclone.conf` to version control
- Backups and config are mounted **read-only** in the container
- Use environment-specific configs for different environments

## Further Reading

- [Rclone Documentation](https://rclone.org/docs/)
- [Rclone Commands](https://rclone.org/commands/)
- [Supported Storage Providers](https://rclone.org/#providers)
