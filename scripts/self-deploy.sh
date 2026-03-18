#!/usr/bin/env bash
#
# Pre-flight checks + trigger a safe restart.
#
# Called by the bot (via pi's bash tool) to deploy code changes.
# This script does NOT restart the bot itself — it signals the
# wrapper (run.sh) to do so after all checks pass.
#
# Usage:  ./scripts/self-deploy.sh [commit message]
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DATA_DIR="$PROJECT_DIR/.data"
RESTART_SENTINEL="$DATA_DIR/restart-requested"
ROLLBACK_TAG_FILE="$DATA_DIR/rollback-tag"
WRAPPER_PID_FILE="$DATA_DIR/wrapper.pid"
NPX_BIN="${NPX_BIN:-npx}"

COMMIT_MSG="${1:-self-deploy: update}"

log() {
  echo "[deploy $(date '+%H:%M:%S')] $*"
}

fail() {
  echo "[deploy $(date '+%H:%M:%S')] FAILED: $*" >&2
  exit 1
}

wrapper_is_running() {
  if [[ ! -f "$WRAPPER_PID_FILE" ]]; then
    return 1
  fi

  local wrapper_pid
  wrapper_pid="$(tr -d '[:space:]' < "$WRAPPER_PID_FILE")"
  if [[ ! "$wrapper_pid" =~ ^[0-9]+$ ]]; then
    return 1
  fi

  if ! kill -0 "$wrapper_pid" 2>/dev/null; then
    return 1
  fi

  return 0
}

# ── Step 1: Check that the wrapper is running ──────────────────

if [[ -f "$RESTART_SENTINEL" ]]; then
  fail "A restart is already pending. Wait for it to complete."
fi

if ! wrapper_is_running; then
  fail "run.sh is not supervising this repo. Start the bot with ./scripts/run.sh before self-deploying."
fi

# ── Step 2: Type-check ─────────────────────────────────────────

log "Running type-check (tsc --noEmit)..."
if ! "$NPX_BIN" tsc --noEmit 2>&1; then
  fail "Type-check failed. Fix errors before deploying."
fi
log "Type-check passed ✓"

# ── Step 3: Tests ──────────────────────────────────────────────

log "Running tests..."
if ! "$NPX_BIN" vitest run 2>&1; then
  fail "Tests failed. Fix failures before deploying."
fi
log "Tests passed ✓"

# ── Step 4: Tag current stable state ──────────────────────────

STABLE_TAG="stable-$(date -u '+%Y%m%d-%H%M%S')"
log "Preparing rollback state: $STABLE_TAG"

git add -A

if ! git diff --cached --quiet --exit-code; then
  PREVIOUS_HEAD="$(git rev-parse --verify HEAD 2>/dev/null || echo "")"
  git commit -m "$COMMIT_MSG"
  log "Committed changes: $COMMIT_MSG"

  if [[ -n "$PREVIOUS_HEAD" ]]; then
    git tag -f "$STABLE_TAG" "$PREVIOUS_HEAD"
    echo "$STABLE_TAG" > "$ROLLBACK_TAG_FILE"
    log "Rollback tag '$STABLE_TAG' points to previous commit: $PREVIOUS_HEAD"
  else
    log "Warning: No parent commit for rollback (first commit?). Proceeding without rollback safety."
    rm -f "$ROLLBACK_TAG_FILE"
  fi
else
  log "No tracked or untracked changes detected. Deploying current HEAD as-is."
  # Tag current HEAD as stable since there's nothing to roll back
  rm -f "$ROLLBACK_TAG_FILE"
fi

# ── Step 5: Signal restart ─────────────────────────────────────

log "All checks passed. Signaling restart..."
mkdir -p "$DATA_DIR"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$RESTART_SENTINEL"

log "Restart signaled. The wrapper will handle the rest."
log "Expected sequence:"
log "  1. Wrapper sends SIGTERM to current bot process"
log "  2. Bot shuts down gracefully"
log "  3. Wrapper starts new bot process"
log "  4. Wrapper verifies healthy startup"
if [[ -f "$ROLLBACK_TAG_FILE" ]]; then
  log "  5. If unhealthy: automatic rollback to $(cat "$ROLLBACK_TAG_FILE")"
else
  log "  5. If unhealthy: wrapper reports failure because no rollback commit was recorded"
fi
echo ""
echo "Deploy initiated successfully."
