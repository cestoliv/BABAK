---
name: backup-new-service
description: Add a new Docker service to Babak backup, configure it, create restore docs, and test the restore end-to-end.
disable-model-invocation: true
---

# Add a new service to Babak backup

You are adding a new Docker-based service to the Babak backup system. Follow each step carefully and use the task list to track progress.

## Step 0: Create task list

Create tasks for each step below using TaskCreate before starting any work:
1. Gather information (config file, host, path, docker-compose)
2. Analyze docker-compose and plan backup strategy
3. Add new service config
4. Validate config
5. Run backup for the new service only
6. Create restore documentation
7. Test restore
8. User verification
9. Cleanup
10. Verify README matches actual restore commands

## Step 1: Gather information

Use AskUserQuestion to collect the following information. You can ask multiple questions at once:

**Question 1 — Config file**: Which Babak config file to use? List existing `config-*.yml` files in the project root as options using Glob.

**Question 2 — SSH host and path**: Ask for the SSH host name (from `~/.ssh/config`) and the remote path to the service directory. For the host, list hosts already used in the selected config file as options.

**Question 3 — Docker Compose**: Ask the user to paste the `docker-compose.yml` content of the service. Use a free-text "Other" option.

## Step 2: Analyze docker-compose and plan backup strategy

Parse the docker-compose content provided by the user. Identify:

- **Service name**: derive from container names or service names
- **Database type**: look for MySQL/MariaDB/PostgreSQL/MongoDB/SQLite containers
- **Storage volumes**: which host paths are mounted
- **Environment variables**: note any credentials (passwords, tokens) — these MUST use `${VAR}` env var syntax, NEVER hardcoded values
- **Network config**: note external networks for restore overrides

Based on the database type, plan the dump command:
- **MariaDB/MySQL**: `docker exec <container> sh -c 'mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > ./dump.sql`
- **PostgreSQL**: `docker exec <container> sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > ./dump.sql`
- **MongoDB**: `docker exec <container> sh -c 'mongodump --archive' > ./dump.archive`
- **SQLite**: no dump needed — back up the file directly
- **No database**: just back up storage volumes

**Stopping containers**: Only stop containers (`docker compose down`) for **SQLite** databases, where the file must not be written to during backup. For real database engines (MySQL, MariaDB, PostgreSQL, MongoDB), the dump command produces a consistent snapshot while the service stays running — do NOT stop containers.

The pre_command depends on the database type:

**For real DB engines (MySQL/MariaDB/PostgreSQL/MongoDB)**:
```
<dump command>
```
No `docker compose down` needed — the service stays up during backup.

**For SQLite or no database**:
```
docker compose down
```
Stop containers to ensure file consistency.

The post_command depends on the database type:

**For real DB engines**:
```
rm -f ./dump.sql
```
Just clean up the dump file. Service was never stopped.

**For SQLite or no database**:
```
docker compose up -d
```
Restart containers that were stopped.

## Step 3: Add new service config

1. Read the config file
2. Append the new service entry at the end of the services list

The service config MUST follow this pattern. Adapt pre/post commands based on the database type (see Step 2):

```yaml
# For real DB engines (no container stop needed):
  - name: <ServiceName>
    type: ssh
    enabled: true
    host:
      name: <ssh-host>
      path: <remote-path>
    pre_command: |
      <dump command>
    storage:
      - <volumes to back up>
      - ./dump.sql
      - ./docker-compose.yml
      - ./.env
    post_command: |
      rm -f ./dump.sql

# For SQLite / no database (stop containers):
  - name: <ServiceName>
    type: ssh
    enabled: true
    host:
      name: <ssh-host>
      path: <remote-path>
    pre_command: |
      docker compose down
    storage:
      - <volumes to back up>
      - ./docker-compose.yml
      - ./.env
    post_command: |
      docker compose up -d
```

**CRITICAL**: Never put passwords or secrets directly in the config. Always reference environment variables using shell syntax like `$MYSQL_ROOT_PASSWORD` inside `docker exec` commands — these are resolved inside the container where the env vars are set.

## Step 4: Validate config

Run the config validation:
```bash
bun run validate:config ./<config-file>
```

If validation fails, fix the config and retry. Do NOT proceed to backup until validation passes.

## Step 5: Run backup for the new service only

**CRITICAL**: NEVER run the backup without explicit user confirmation. Use AskUserQuestion first:
- Show the user a summary of what will happen: which config file, which service, what the pre_command/post_command will do on the remote server
- Options: "Run backup now" / "Cancel"
- If the user cancels, stop and let them review/adjust the config manually

Only after the user confirms, run the backup for only the new service by passing its name as a positional argument:
```bash
bun index.ts -c <config-file> "<service-name>"
```

Wait for completion. Verify the output shows:
- Only the new service is backed up
- The backup completes successfully
- No errors in the output

If it fails, diagnose the issue, fix, and retry.

## Step 6: Create restore documentation

Create a README.md in the services folder following the existing structure. Look at existing service docs in `services/` for the pattern.

Determine the correct subfolder by looking at the config file name (e.g., `config-chevro.yml` → `services/chevro/`).

The README must include:
1. **Header**: service name, server, path
2. **Stack**: what containers run (with image versions from docker-compose)
3. **Backed up files**: list of what's backed up and why
4. **Backup section**: how babak runs it
5. **Restore section** with numbered steps:
   - Restore files from duplicity
   - Prepare directories (e.g., `mkdir -p` for empty volumes)
   - Start database only (with network override for local testing)
   - Wait for database readiness
   - Import the dump
   - Start the application (with URL override + port mapping for local testing)
   - Verify checklist

For the restore, override:
- External networks → local bridge network
- Production URLs → `http://localhost:<port>`
- Add port mappings so the service is accessible locally

## Step 7: Test restore

First, find an open port on the local machine:
```bash
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
```

Use this `$PORT` for all port mappings during the restore test.

Follow the restore documentation you just wrote, step by step:

1. Create the restore directory: `mkdir -p ./restore/<service-name>`
2. Run duplicity restore into it
3. Prepare directories
4. Start the database container with local network override
5. Wait for it to be ready
6. Import the database dump
7. Start the full stack with local overrides
8. Verify:
   - Check container logs for errors: `docker logs <container>`
   - HTTP health check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/`
   - Grab the page title: `curl -s http://localhost:<port>/ | grep -o '<title>[^<]*</title>'`

## Step 8: User verification

Use AskUserQuestion to ask the user:
- Tell them the service is running locally at `http://localhost:<port>`
- Ask them to verify the restore looks correct (check data, UI, etc.)
- Options: "Looks good" / "Something is wrong"

If "Something is wrong": ask what's wrong and attempt to fix it. Loop back to verification.

## Step 9: Cleanup

Once the user confirms everything is OK:

1. Stop and remove the test containers:
   ```bash
   docker compose -f docker-compose.yml -f /dev/stdin down <<'EOF'
   networks:
     default:
       name: <service>-restore
       external: false
   EOF
   ```
2. Remove the restore directory: `rm -rf ./restore/<service-name>`
3. Show a final summary:
   - Config file updated with new service
   - Restore docs created at `services/<group>/<service>/README.md`
   - Backup tested and verified

## Step 10: Verify README matches actual restore commands

After cleanup, review the README you created in Step 6 against the commands you **actually ran** during the restore test (Steps 7-8).

1. Read back the README at `services/<group>/<service>/README.md`
2. Compare each restore step in the README against what you actually executed:
   - Are the `duplicity restore` commands correct (target path, source URL)?
   - Are the `docker compose` commands accurate (file paths, override syntax)?
   - Are the `docker exec` commands for DB import correct (container name, credentials, dump file path)?
   - Are the `mkdir -p` commands listing the right directories?
   - Are port numbers, network names, and URL overrides consistent?
3. If any command in the README differs from what you actually ran to successfully restore, **update the README** to match the working commands
4. Pay special attention to:
   - Commands you had to fix or retry during the test — the README should reflect the working version
   - Any extra steps you had to perform that aren't documented
   - Any documented steps that turned out to be unnecessary
