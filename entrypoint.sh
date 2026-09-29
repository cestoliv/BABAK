#!/bin/sh
set -e

# --- GPG key import ---
# Mount GPG key files at /run/secrets/ to enable encrypted backups with duplicity.
#
# Export on the host with:
#   gpg --export --armor <KEY_ID> > gpg-pubkey.asc
#   gpg --export-secret-keys --armor <KEY_ID> > gpg-secret.asc
#
# The public key is used for encryption, the secret key for decryption
# (needed by retention commands to read backup metadata).
for keyfile in /run/secrets/gpg-pubkey.asc /run/secrets/gpg-secret.asc; do
  if [ -f "$keyfile" ]; then
    gpg --batch --import "$keyfile" 2>/dev/null
    echo "GPG key imported: $keyfile"
  fi
done

# Trust imported keys so duplicity can use them without prompts
GPG_FPR=$(gpg --batch --with-colons --fingerprint 2>/dev/null | grep '^fpr' | head -1 | cut -d: -f10)
if [ -n "$GPG_FPR" ]; then
  echo "${GPG_FPR}:6:" | gpg --batch --import-ownertrust 2>/dev/null
  echo "GPG key trusted: ${GPG_FPR}"
fi

CONFIG_ARGS=""
if [ -n "$CONFIG_FILE" ]; then
  CONFIG_ARGS="--config $CONFIG_FILE"
fi

exec bun run index.ts $CONFIG_ARGS "$@"
