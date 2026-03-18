#!/usr/bin/env bash
#
# Process manager wrapper for the Discord Pi bot.
#
# Starts the bot, monitors for restart requests, handles rollback on failure.
#
# Usage:  ./scripts/run.sh
#
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

DATA_DIR="$PROJECT_DIR/.data"
RESTART_SENTINEL="$DATA_DIR/restart-requested"
HEALTH_FILE="$DATA_DIR/healthy"
ROLLBACK_TAG_FILE="$DATA_DIR/rollback-tag"
WRAPPER_PID_FILE="$DATA_DIR/wrapper.pid"
BOT_PID=""
NPX_BIN="${NPX_BIN:-npx}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-45}"  # seconds to wait for healthy startup
HEALTH_POLL_INTERVAL="${HEALTH_POLL_INTERVAL:-1}"
SHUTDOWN_GRACE_PERIOD="${SHUTDOWN_GRACE_PERIOD:-15}"
MONITOR_SLEEP_INTERVAL="${MONITOR_SLEEP_INTERVAL:-2}"

log() {
  echo "[wrapper $(date '+%H:%M:%S')] $*"
}

clear_runtime_state() {
  rm -f "$RESTART_SENTINEL" "$HEALTH_FILE" "$WRAPPER_PID_FILE"
}

write_wrapper_pid() {
  printf '%s\n' "$$" > "$WRAPPER_PID_FILE"
}

cleanup() {
  stop_bot
  clear_runtime_state
  exit 0
}

trap cleanup SIGINT SIGTERM
trap clear_runtime_state EXIT

start_bot() {
  rm -f "$HEALTH_FILE"
  log "Starting bot..."
  "$NPX_BIN" tsx src/index.ts &
  BOT_PID=$!
  log "Bot started (PID $BOT_PID)"
}

wait_for_health() {
  local start_time=$SECONDS
  local deadline=$((SECONDS + HEALTH_TIMEOUT))

  while [[ $SECONDS -lt $deadline ]]; do
    # If process already exited, it crashed
    if ! kill -0 "$BOT_PID" 2>/dev/null; then
      log "Bot process exited prematurely!"
      return 1
    fi
    if [[ -f "$HEALTH_FILE" ]]; then
      log "Bot is healthy (took $((SECONDS - start_time))s)"
      return 0
    fi
    sleep "$HEALTH_POLL_INTERVAL"
  done
  log "Bot did not become healthy within ${HEALTH_TIMEOUT}s"
  return 1
}

rollback_and_restart() {
  if [[ ! -f "$ROLLBACK_TAG_FILE" ]]; then
    log "ERROR: No rollback tag found — cannot rollback. Manual intervention required."
    return 1
  fi

  local rollback_tag
  rollback_tag=$(cat "$ROLLBACK_TAG_FILE")
  log "Rolling back to tag: $rollback_tag"

  if ! git reset --hard "$rollback_tag"; then
    log "ERROR: Failed to move HEAD back to $rollback_tag"
    return 1
  fi
  rm -f "$ROLLBACK_TAG_FILE"

  log "Rollback complete. Starting bot on previous stable code..."
  start_bot

  if ! wait_for_health; then
    log "CRITICAL: Bot failed to start even after rollback. Manual intervention required."
    kill -TERM "$BOT_PID" 2>/dev/null || true
    wait "$BOT_PID" 2>/dev/null || true
    exit 1
  fi

  log "Bot recovered on rollback code."
}

stop_bot() {
  if [[ -n "$BOT_PID" ]] && kill -0 "$BOT_PID" 2>/dev/null; then
    log "Sending SIGTERM to bot (PID $BOT_PID)..."
    kill -TERM "$BOT_PID" 2>/dev/null || true

    # Wait up to SHUTDOWN_GRACE_PERIOD seconds for graceful shutdown
    local deadline=$((SECONDS + SHUTDOWN_GRACE_PERIOD))
    while kill -0 "$BOT_PID" 2>/dev/null && [[ $SECONDS -lt $deadline ]]; do
      sleep 1
    done

    if kill -0 "$BOT_PID" 2>/dev/null; then
      log "Bot didn't exit gracefully, sending SIGKILL"
      kill -9 "$BOT_PID" 2>/dev/null || true
    fi
    wait "$BOT_PID" 2>/dev/null || true
    log "Bot stopped."
  fi
  BOT_PID=""
}

# ── Main loop ──────────────────────────────────────────────────

mkdir -p "$DATA_DIR"
clear_runtime_state
write_wrapper_pid

start_bot

if ! wait_for_health; then
  log "Initial startup failed. Exiting."
  stop_bot
  exit 1
fi

log "Entering monitor loop. Watching for restart requests..."

while true; do
  # Check if the bot process died unexpectedly
  if ! kill -0 "$BOT_PID" 2>/dev/null; then
    log "Bot process died unexpectedly. Restarting..."
    start_bot
    if ! wait_for_health; then
      log "Restart after crash failed. Exiting."
      stop_bot
      exit 1
    fi
  fi

  # Check for restart request
  if [[ -f "$RESTART_SENTINEL" ]]; then
    log "Restart requested!"
    rm -f "$RESTART_SENTINEL"

    stop_bot
    start_bot

    if wait_for_health; then
      log "Restart successful."
      # If there's a rollback tag, we no longer need it — new code is good
      rm -f "$ROLLBACK_TAG_FILE"
    else
      log "New code failed to start. Attempting rollback..."
      stop_bot
      rollback_and_restart
    fi
  fi

  sleep "$MONITOR_SLEEP_INTERVAL"
done
