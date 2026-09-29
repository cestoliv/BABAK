---
name: backup-test-service
description: Test an existing backup by restoring a service end-to-end and verifying it works, then review the README against the actual restore steps.
disable-model-invocation: true
---

# Test a backup restore

You are testing an existing backup by performing a full restore of a service and verifying it works. You will then review the service's restore README against the commands you actually ran.

## Step 0: Create task list

Create tasks for each step below using TaskCreate before starting any work:
1. Gather information (config file, service to test)
2. Clear backup folder
3. Run backup for the target service only
4. Restore the service following the README
5. Verify the service works
6. User verification
7. Cleanup
8. Review README against actual restore steps

## Step 1: Gather information

### 1a. Config file

Use AskUserQuestion to ask which config file to use. List existing `config-*.yml` files in the project root as options using Glob.

### 1b. Service to test

After reading the selected config file, use AskUserQuestion to ask which service to test. List all services from the config as options (show name, type, and enabled status for each).

### 1c. Locate the README

Determine the service group from the config file name (e.g., `config-chevro.yml` -> `services/chevro/`). Find the service's README by looking for a matching directory under `services/<group>/`. Use the service name to locate it (e.g., lowercase, hyphenated). Read the README and confirm it exists — if it doesn't, stop and tell the user they need to create one first (suggest using the `backup-new-service` skill).

## Step 2: Clear backup folder

1. Clear the Duplicity backup folder for this service to force a full backup:
   - The backup path is `<system.backup_dir>/<service-name>/`
   - Use AskUserQuestion to confirm before deleting: show the path and explain this will force a fresh full backup
   - Only delete after user confirms

## Step 3: Run backup for the target service only

**CRITICAL**: NEVER run the backup without explicit user confirmation. Use AskUserQuestion first:
- Show the user a summary of what will happen: which config file, which service, what the pre_command/post_command will do on the remote server
- Options: "Run backup now" / "Cancel"
- If the user cancels, stop and let them review/adjust the config manually

Only after the user confirms, run the backup for only the target service by passing its name as a positional argument:
```bash
bun index.ts -c <config-file> "<service-name>"
```

Wait for completion. Verify the output shows:
- Only the target service is backed up
- The backup completes successfully
- No errors in the output

If it fails, diagnose the issue, fix, and retry.

## Step 4: Restore the service following the README

This is the core of the test. You MUST follow the README step by step — the goal is to verify the README is accurate and complete.

### 4a. Preparation

Find an open port on the local machine:
```bash
PORT=$(python3 -c "import socket; s=socket.socket(); s.bind(('',0)); print(s.getsockname()[1]); s.close()")
```

Use this `$PORT` for all port mappings during the restore.

### 4b. Follow the README

Read the service's README at `services/<group>/<service>/README.md`.

Execute each restore step **exactly as documented in the README**. For each step:
1. Read the command from the README
2. Adapt only the variables that need adapting (e.g., replace `${PORT}` with the actual port, adjust paths if the restore directory differs)
3. Run the command
4. Check the output for errors

**Important**: Record every command you actually run and any deviations from the README. You will need this for Step 8.

If a step fails:
- Try to diagnose and fix the issue
- Note the deviation — the README may need updating
- Continue with the restore

### 4c. Working directory

Create the restore directory: `mkdir -p ./restore/<service-name>`

Use `./restore/<service-name>` as the working directory for restore operations. Make sure the duplicity restore target matches what the README expects.

## Step 5: Verify the service works

After all restore steps are complete:

1. Check container logs for errors:
   ```bash
   docker logs <container-name> 2>&1 | tail -50
   ```

2. HTTP health check:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:${PORT}/
   ```

3. Grab the page title:
   ```bash
   curl -s http://localhost:${PORT}/ | grep -o '<title>[^<]*</title>'
   ```

If any check fails, investigate the logs and try to fix the issue before asking the user.

## Step 6: User verification

Use AskUserQuestion to ask the user:
- Tell them the service is running locally at `http://localhost:<port>`
- Ask them to verify the restore looks correct (check data, UI, etc.)
- Remind them what to check based on the README's verify section
- Options: "Looks good" / "Something is wrong"

If "Something is wrong": ask what's wrong and attempt to fix it. Loop back to verification.

## Step 7: Cleanup

Once the user confirms everything is OK:

1. Stop and remove the test containers. Use the appropriate docker compose command with the network overrides that were used during restore (look at the README's restore commands to match the override syntax):
   ```bash
   cd ./restore/<service-name>
   docker compose -f docker-compose.yml -f /dev/stdin down <<'EOF'
   networks:
     default:
       name: <service>-restore
       external: false
   EOF
   ```
   Adapt the network override to match what was used during the restore (some services use multiple networks — check the README).

2. Remove the restore directory:
   ```bash
   rm -rf ./restore/<service-name>
   ```

## Step 8: Review README against actual restore steps

This is the most important step. Compare the README against what you **actually did** during the restore.

1. Read back the README at `services/<group>/<service>/README.md`
2. For each section of the README, compare against what you actually ran:

### Check these specifically:

- **Duplicity restore command**: Is the source path correct (`file://backups/<group>/<service-name>`)? Is the target path consistent with the rest of the restore steps?
- **Prepare directories**: Are the `mkdir -p` commands listing all the directories that were actually needed? Were any extra directories needed that aren't documented?
- **Database startup**: Is the docker compose override correct? Is the container/service name correct? Is the network name consistent?
- **Database readiness check**: Does the wait command work? Is the container name and credentials correct?
- **Database import**: Is the import command correct (container name, credentials syntax, dump file path)?
- **Application startup**: Are the environment overrides correct? Are the port mappings correct? Are all network overrides present and consistent?
- **Verify section**: Does it list the right things to check? Is there anything you had to check that isn't mentioned?

### Fix any discrepancies:

3. If any command in the README differs from what you actually ran to successfully restore, **update the README** to match the working commands
4. Pay special attention to:
   - Commands you had to fix or retry during the test — the README should reflect the working version
   - Any extra steps you had to perform that aren't documented
   - Any documented steps that turned out to be unnecessary
5. Show the user a summary of what changed in the README (if anything)
