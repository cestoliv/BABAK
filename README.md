# Babak - TypeScript Backup System

Modern backup solution built with TypeScript and Bun, supporting SSH, Local, and WordPress FTP backups with GPG encryption and retention policies.

## Features

- **3 Backup Types**: SSH (via SSHFS), Local files, WordPress FTP
- **Unified Duplicity Engine**: All backup types use Duplicity for consistent incremental backups
- **GPG Encryption**: Secure backups with GPG encryption
- **Smart Retention**: Keeps today, yesterday, day before, and last 3 Sundays
- **Notifications**: Send backup reports via ntfy.sh
- **Docker Support**: Ready for containerized deployment

## Quick Start

**Install dependencies:**

```bash
bun install
```

**Configure backups:**
Edit `config.yml` to configure your backup services (see Configuration section below).

**Run backup:**

```bash
bun run index.ts
```

**Run with Docker:**

```bash
docker-compose up --build
```

## Configuration

The `config.yml` file supports three backup types:

### SSH Backup

```yaml
- name: My Server
  type: ssh
  enabled: true
  host:
    name: myserver # From ~/.ssh/config
    path: /path/to/backup
  pre_command: |
    # Commands to run before backup (e.g., database dump)
    pg_dump mydb > dump.sql
  storage:
    - ./dump.sql
    - ./important-files
  exclude:
    - ./node_modules
  post_command: |
    # Cleanup after backup
    rm dump.sql
```

### Local Backup

```yaml
- name: Local Files
  type: local
  enabled: true
  paths:
    - /home/user/documents
    - /etc/config
  exclude:
    - "**/node_modules"
    - "**/.git"
```

### WordPress FTP Backup

```yaml
- name: WordPress Site
  type: wordpress_ftp
  enabled: true
  host_url: https://example.com
  ftp:
    host: ftp.example.com
    user: wpuser
    password: ${FTP_PASSWORD}
    dir: /public_html
    secure: false
  database:
    host: localhost
    user: wpuser
    password: ${DB_PASSWORD}
    name: wordpress_db
```

## GPG Encryption

**Generate a GPG key:**
Use this command or a similat to generate a **passwordless** GPG key for encryption:

```bash
gpg --batch --passphrase '' --quick-gen-key olivier@overload.coach default default
```

**List your keys to find the key ID:**

```bash
gpg --list-keys
```

**Add the key ID to `config.yml`:**

```yaml
system:
  gpg_key: "YOUR_KEY_ID_HERE"
```

**Export and backup your keys:**

```bash
# Export public key
gpg --output public.pgp --armor --export your@email.com

# Export private key (keep this secure!)
gpg --output private.pgp --armor --export-secret-key your@email.com
```

## Backup Management with Duplicity

All backups are stored using Duplicity's incremental backup format. Here are common operations:

### Restore Backups

**Restore full backup to a directory:**

```bash
duplicity restore file:///path/to/backups/service-name /restore/destination
```

**Restore specific files:**

```bash
duplicity restore --file-to-restore path/to/file file:///path/to/backups/service-name /restore/destination
```

**Restore from a specific date:**

```bash
duplicity restore --time 2024-03-15 file:///path/to/backups/service-name /restore/destination
```

**Restore from 3 days ago:**

```bash
duplicity restore --time 3D file:///path/to/backups/service-name /restore/destination
```

### List Backup Contents

**List all files in the latest backup:**

```bash
duplicity list-current-files file:///path/to/backups/service-name
```

**List files from a specific date:**

```bash
duplicity list-current-files --time 2024-03-15 file:///path/to/backups/service-name
```

### View Backup Increments

**Show all backup sets (full and incremental):**

```bash
duplicity collection-status file:///path/to/backups/service-name
```

This shows:

- Full backup dates
- Incremental backup chains
- Total storage used
- Number of backup sets

### Verify Backups

**Verify backup integrity against source:**

```bash
duplicity verify file:///path/to/backups/service-name /source/path
```

**Verify specific files:**

```bash
duplicity verify --file-to-restore path/to/file file:///path/to/backups/service-name /source/path
```

### Manual Cleanup

**Remove backups older than 30 days:**

```bash
duplicity remove-older-than 30D file:///path/to/backups/service-name --force
```

**Remove all but the last N full backups:**

```bash
duplicity remove-all-but-n-full 2 file:///path/to/backups/service-name --force
```

**Clean up failed/incomplete backups:**

```bash
duplicity cleanup file:///path/to/backups/service-name --force
```

### Encrypted Backups

If you're using GPG encryption, add `--encrypt-key YOUR_KEY_ID` to restore commands:

```bash
duplicity restore --encrypt-key YOUR_KEY_ID file:///path/to/backups/service-name /restore/destination
```

Or set the GPG key as default:

```bash
export PASSPHRASE="your_gpg_passphrase"
duplicity restore file:///path/to/backups/service-name /restore/destination
```

## Backup Storage Structure

Backups are organized by service name:

```
backups/
├── service-name-1/
│   ├── duplicity-full.20240315T120000Z.manifest
│   ├── duplicity-full.20240315T120000Z.vol1.difftar.gpg
│   ├── duplicity-inc.20240316T120000Z.to.20240317T120000Z.manifest
│   └── ...
├── service-name-2/
│   └── ...
```

Each service has its own Duplicity backup chain with:

- **Full backups**: Created monthly (configurable)
- **Incremental backups**: Daily incremental backups
- **GPG encryption**: All data encrypted if GPG key configured

## Notifications

Configure ntfy.sh notifications in `config.yml`:

```yaml
system:
  ntfy:
    url: https://ntfy.sh
    topic: babak-backups
    username: optional # For authenticated topics
    password: optional
```

Babak will send a summary after each backup run with:

- Success/failure status for each service
- Backup sizes
- Total time taken

## Cloud Sync with Rclone

Babak supports syncing backups to cloud storage (S3, Google Drive, Dropbox, etc.) using rclone.

### Setup

1. **Configure rclone remote:**

Run `rclone config` on your host or any machine, then copy the config:

```bash
cp ~/.config/rclone/rclone.conf ./rclone/rclone.conf
```

2. **Enable rclone in config.yml:**

```yaml
system:
  rclone:
    enabled: true
    remote: "myremote:babak-backups"  # Use remote name from rclone config
    sync_command: "sync"  # "sync", "copy", or "move"
    flags:
      - "--progress"
      - "--transfers=4"
    exclude:
      - "*.tmp"
    dry_run: false  # Test without uploading
```

3. **Run sync:**

```bash
docker compose run --rm rclone-sync
```

### Sync Commands

- **copy** (recommended): Copy new/changed files only, never deletes anything on the remote. Safe against accidental local deletions.
- **sync**: Make destination identical to source. If files are deleted locally, they are deleted remotely too.
- **move**: Move files to destination and delete source (use with caution!)

### Cleaning Up Remote Storage

When using `copy`, old backups accumulate on the remote. To free up space:

```bash
# Check current space usage
rclone size "myremote:babak-backups" --config=rclone/rclone.conf

# See what would be deleted (dry run)
rclone delete --min-age 6M --dry-run "myremote:babak-backups" --config=rclone/rclone.conf

# Delete backups older than 6 months
rclone delete --min-age 6M "myremote:babak-backups" --config=rclone/rclone.conf

# Delete only a specific service's old backups
rclone delete --min-age 6M "myremote:babak-backups/service-name" --config=rclone/rclone.conf
```

Time format: `1D` (day), `1W` (week), `1M` (month), `6M` (6 months), `1Y` (year).

### Custom Configurations

All paths can be customized at runtime using environment variables:

```bash
# Use custom config file
docker compose run --rm -e CONFIG_FILE=/workspace/prod-config.yml rclone-sync

# Use custom backups directory
docker compose run --rm -e BACKUPS_DIR=/workspace/prod-backups rclone-sync

# Use custom rclone.conf
docker compose run --rm -e RCLONE_CONFIG=/workspace/prod-rclone.conf rclone-sync

# Combine multiple customizations
docker compose run --rm \
  -e CONFIG_FILE=/workspace/prod-config.yml \
  -e BACKUPS_DIR=/workspace/prod-backups \
  rclone-sync
```

### Automated Workflow

Create `backup-and-sync.sh`:

```bash
#!/bin/bash
docker compose up babak
if [ $? -eq 0 ]; then
  docker compose run --rm rclone-sync
fi
```

For production with custom config:
```bash
#!/bin/bash
docker compose up babak
if [ $? -eq 0 ]; then
  docker compose run --rm -e CONFIG_FILE=/workspace/prod-config.yml rclone-sync
fi
```

Schedule with cron:
```bash
0 2 * * * /path/to/backup-and-sync.sh
```

## Docker Deployment

### Development

**Build and run:**

```bash
docker compose up --build babak
```

**Run with a custom config:**

```bash
docker compose run --rm -e CONFIG_FILE=/workspace/config-overload.yml babak
```

### Production

Use `docker-compose.prod.yml` for deployments with pre-built images from the registry. Set up a directory with all config and secrets:

```bash
mkdir -p storage/{backups,ssh,rclone,tmp,duplicity-cache}
```

Then populate it:

```
storage/
  config.yml              # Babak config
  gpg-pubkey.asc          # GPG public key (for encryption)
  gpg-secret.asc          # GPG secret key (for retention metadata decryption)
  ssh/                    # SSH private keys + config
  backups/                # Persistent backup data
  tmp/                    # Babak temp directory
  duplicity-cache/        # Duplicity metadata cache
  rclone/
    rclone.conf           # Rclone remote config
```

Run:

```bash
docker compose -f docker-compose.prod.yml up -d babak
```

### GPG Keys in Docker

Babak needs both GPG keys mounted into the container:

- **Public key**: used by duplicity to encrypt backup data
- **Secret key**: used by duplicity to decrypt backup metadata during retention operations

Export them on the host:

```bash
gpg --export --armor <KEY_ID> > gpg-pubkey.asc
gpg --export-secret-keys --armor <KEY_ID> > gpg-secret.asc
```

The entrypoint imports both keys and sets trust automatically at startup.

**Important:** Duplicity requires the `PASSPHRASE` environment variable to be set, even for keys without a passphrase. If `PASSPHRASE` is not set, duplicity will prompt interactively (which hangs in Docker). Set it to an empty string for passwordless keys:

```yaml
environment:
  - PASSPHRASE=
```

### Required Volumes

| Volume | Description |
|---|---|
| `config.yml` | Backup configuration |
| `ssh/` | SSH keys for remote access (mounted read-only) |
| `gpg-pubkey.asc` | GPG public key for encryption |
| `gpg-secret.asc` | GPG secret key for retention |
| `backups/` | Backup storage |
| `tmp/` | Temp directory for SSHFS mounts and downloads |

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `CONFIG_FILE` | Path to config file inside container | `/workspace/config.yml` |
| `PASSPHRASE` | GPG key passphrase (empty for passwordless keys) | *(prompts if unset)* |
| `DEBUG` | Enable debug logging | `false` |

## Retention Policy

Babak uses the "Lazy Man's Backup Strategy" for efficient, long-term backup retention:

**Default Strategy:**
- **Daily backups**: Incremental backups every day
- **Monthly full backups**: Complete backup created every month
- **1 month of daily history**: Keep all incremental backups for the past month (daily restore points)
- **6 months of monthly history**: Keep full backups for 6 months (monthly restore points)

**What this means:**
- **Recent data**: Restore from any day in the past month
- **Older data**: Restore from monthly snapshots up to 6 months
- **Storage efficient**: Only keeps what you need, automatically cleans up old incrementals

**Customize retention** (optional) in `config.yml`:
```yaml
system:
  retention:
    full_backup_lifetime: "6M"    # How long to keep full backups (default: 6 months)
    incremental_lifetime: "1M"    # How long to keep incremental backups (default: 1 month)
    keep_full_chains: 1           # Number of full backup chains to preserve (default: 1)
```

**Time format examples:**
- `1D` = 1 day
- `1W` = 1 week
- `1M` = 1 month
- `6M` = 6 months
- `1Y` = 1 year

**Reference:** [Lazy Man's Backup Strategy with Duplicity](https://blog.yadutaf.fr/2012/09/08/lazy-man-backup-strategy-with-duplicity-part-1/)

## Duplicity Options

Fine-tune Duplicity behavior in `config.yml`:

```yaml
system:
  duplicity:
    allow_source_mismatch: true  # Allow hostname changes between runs (default: true)
    full_if_older_than: "1M"     # Create a new full backup after this interval (default: 1 month)
```

- **allow_source_mismatch**: Enabled by default. Required when running in Docker where the container hostname changes between runs. Disable only if you want Duplicity to reject backups from a different host.
- **full_if_older_than**: Controls when a new full backup is created instead of an incremental one. Uses Duplicity time format (`1D`, `1W`, `1M`, `6M`, `1Y`).

## Troubleshooting

**SSH connection issues:**

- Ensure SSH keys are in `./ssh` directory
- Check SSH config in `~/.ssh/config` or `./ssh/config`
- Test SSH connection: `ssh hostname`

**Duplicity errors:**

- Check GPG key is valid: `gpg --list-keys`
- Verify passphrase is correct
- Clean up failed backups: `duplicity cleanup file:///backups/service-name`

**Permission issues with SSHFS:**

- Docker container needs `privileged: true` and `/dev/fuse` device
- Ensure FUSE is available: `modprobe fuse`

**View debug logs:**

```bash
DEBUG=true bun run index.ts
```

## License

MIT
