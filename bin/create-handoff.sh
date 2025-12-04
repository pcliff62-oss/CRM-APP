#!/usr/bin/env bash
set -euo pipefail

# create-handoff.sh
# Builds a transfer bundle of env files, data, uploads, optional bucket backup.
# Safe to run multiple times; outputs into .handoff/<timestamp> then tars it.

STAMP="$(date +%Y%m%d-%H%M%S)"
ROOT_DIR="$(pwd)"
OUT_DIR=".handoff/${STAMP}"
SECRETS_DIR="${OUT_DIR}/secrets"
EXAMPLES_DIR="${OUT_DIR}/examples"
DATA_DIR="${OUT_DIR}/data"

mkdir -p "${SECRETS_DIR}" "${EXAMPLES_DIR}" "${DATA_DIR}"

log(){ printf "\e[32m[handoff]\e[0m %s\n" "$*"; }
warn(){ printf "\e[33m[warn]\e[0m %s\n" "$*"; }
err(){ printf "\e[31m[error]\e[0m %s\n" "$*"; }

copy_if_exists(){
  local src="$1"; local dest="$2"
  if [ -f "$src" ]; then
    cp "$src" "$dest"
    log "Copied $src -> $dest"
  else
    warn "Missing $src (skipped)"
  fi
}

log "Collecting env files"
copy_if_exists ".env.local" "${SECRETS_DIR}/root.env.local"
copy_if_exists "hytech-crm-iphone/.env.local" "${SECRETS_DIR}/iphone.env.local"
copy_if_exists "packages/proposal-app-launched/server/.env" "${SECRETS_DIR}/proposal-server.env"

redact_env(){
  local in="$1"; local out="$2"
  [ -f "$in" ] || return 0
  sed -E \
    -e 's/(ACCESS_TOKEN_SECRET)=.*/\1=YOUR_ACCESS_TOKEN_SECRET/' \
    -e 's/(SMTP_PASS)=.*/\1=YOUR_SMTP_PASSWORD/' \
    -e 's/(SMTP_USER)=.*/\1=YOUR_SMTP_USER/' \
    -e 's/(DEV_ADMIN_PASS)=.*/\1=CHANGE_ME/' \
    -e 's/(PORT)=.*/\1=3001/' \
    -e 's/(SQLITE_FILE)=.*/\1=.\/data.sqlite/' \
    "$in" > "$out"
  log "Redacted example created $out"
}

redact_env "${SECRETS_DIR}/proposal-server.env" "${EXAMPLES_DIR}/proposal-server.env.example"
redact_env "${SECRETS_DIR}/root.env.local" "${EXAMPLES_DIR}/root.env.local.example"
redact_env "${SECRETS_DIR}/iphone.env.local" "${EXAMPLES_DIR}/iphone.env.local.example"

log "Collecting data files"
if [ -f "packages/proposal-app-launched/server/data.json" ]; then
  cp "packages/proposal-app-launched/server/data.json" "${DATA_DIR}/proposal-data.json"
  log "Copied proposal data.json"
fi

# SQLite DB referenced in proposal-server.env
if [ -f "${SECRETS_DIR}/proposal-server.env" ]; then
  SQLITE_FILE=$(grep -E "^SQLITE_FILE=" "${SECRETS_DIR}/proposal-server.env" | cut -d'=' -f2 || true)
  if [ -n "${SQLITE_FILE}" ] && [ -f "packages/proposal-app-launched/server/${SQLITE_FILE}" ]; then
    cp "packages/proposal-app-launched/server/${SQLITE_FILE}" "${DATA_DIR}/$(basename "${SQLITE_FILE}")"
    log "Copied SQLite DB ${SQLITE_FILE}"
  fi
fi

# uploads directory (root)
if [ -d "uploads" ]; then
  rsync -a --exclude='*.tmp' "uploads/" "${DATA_DIR}/uploads/"
  log "Copied uploads directory"
fi

# Optional service account keys
for keyname in service-account.json gcp-key.json; do
  if [ -f "${keyname}" ]; then
    cp "${keyname}" "${SECRETS_DIR}/${keyname}"; log "Copied ${keyname}"; fi
done

# Optional bucket sync (GCS)
if command -v gsutil >/dev/null 2>&1 && [ -n "${GCS_BUCKET:-}" ]; then
  BK_DIR="${DATA_DIR}/bucket_backup"
  mkdir -p "${BK_DIR}"
  log "Syncing gs://${GCS_BUCKET} -> ${BK_DIR}" || true
  if ! gsutil -m rsync -r "gs://${GCS_BUCKET}" "${BK_DIR}"; then
    warn "Bucket sync failed (permissions or missing bucket)."
  fi
else
  warn "Skipping bucket sync (gsutil not found or GCS_BUCKET unset)."
fi

cat > "${OUT_DIR}/README_IMPORT.md" <<'EOF'
Handoff Bundle Summary
======================

Contents:
  secrets/  -> Original env & key files (DO NOT COMMIT)
  examples/ -> Redacted sample envs for onboarding
  data/     -> App persistent data (proposals, sqlite DB, uploads, optional bucket backup)

Restore Steps:
1. Copy env files back:
     root.env.local -> project root .env.local
     iphone.env.local -> hytech-crm-iphone/.env.local
     proposal-server.env -> packages/proposal-app-launched/server/.env
2. If using SQLite, place data.sqlite into packages/proposal-app-launched/server/.
   If using Postgres instead, set DATABASE_URL and ignore data.sqlite.
3. Restore uploads/: copy data/uploads to project root.
4. If bucket_backup/ exists, sync to target bucket:
     gsutil -m rsync -r data/bucket_backup gs://YOUR_BUCKET
5. Rotate secrets after transfer (ACCESS_TOKEN_SECRET, SMTP_PASS, DEV_ADMIN_PASS).
6. Run install & start:
     npm install
     npm run dev

Security:
Share the tarball via secure channel only. NEVER commit .handoff/ or tarballs.
EOF

TAR_NAME="handoff-${STAMP}.tar.gz"
tar -czf "${TAR_NAME}" -C .handoff "${STAMP}"
log "Created ${TAR_NAME}"
log "Completed. Provide this tarball securely; then rotate secrets." 
