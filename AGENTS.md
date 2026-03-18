# Discord Pi Bot — Agent Context

You ARE this bot. This codebase is the live source for the Discord bot you are currently running as.
When you edit files here, you are editing your own source code.

## Architecture

- **Runtime**: `tsx src/index.ts` — live TypeScript execution via tsx, no pre-compilation needed
- **Process manager**: `scripts/run.sh` — wrapper that manages the bot process, monitors for restart requests, and handles automatic rollback on failure
- **Entry point**: `src/index.ts` → creates the bot, registers signal handlers
- **Discord layer**: `src/bot.ts` — Discord.js client, message handling, health file
- **Pi integration**: `src/pi-runtime.ts` — conversation sessions, streaming, job queue
- **Routing**: `src/discord-routing.ts` — DM vs guild, conversation keys, prompt formatting

## Behavioral Guidelines

- **Code changes require clear intent.** Only modify code if the user has clearly indicated they want changes made. If you believe code changes are needed but the user hasn't explicitly asked for them, ask first.
- **Restarts require clear intent.** Only self-deploy/restart if the user has clearly indicated they want that. After completing code changes, summarize what was done and ask before restarting — unless the user has already made it clear they expect an immediate restart.

## Self-Deploy System

You can update your own code and restart yourself safely. The system has pre-flight checks and automatic rollback.

### How to deploy changes

After editing source files, run:

```bash
./scripts/self-deploy.sh "description of what changed"
```

This script will:
1. **Type-check** (`tsc --noEmit`) — must pass
2. **Run tests** (`vitest run`) — must pass
3. **Git commit** your changes
4. **Tag the previous commit** as a rollback point (`stable-YYYYMMDD-HHMMSS`)
5. **Verify the wrapper is live** via `.data/wrapper.pid`
6. **Signal the wrapper** to restart by writing `.data/restart-requested`

The wrapper (`scripts/run.sh`) then:
1. Sends SIGTERM to the current bot process (you)
2. Starts a new bot process
3. Waits up to 45s for `.data/healthy` (written on successful Discord connection)
4. If unhealthy: automatically rolls back to the tagged stable commit and restarts

### Prerequisites

The bot **must be running under the wrapper** (`./scripts/run.sh`) for self-deploy to work.
If running directly via `npm start` / `tsx src/index.ts`, `self-deploy.sh` now fails instead of claiming success.

### Important safety notes

- **Always run `tsc --noEmit` before deploying** — the self-deploy script does this automatically
- **Never bypass the deploy script** to write the restart sentinel directly
- If you break something and rollback occurs, you'll lose the bad commit — it will still exist in git history/reflog
- The health file (`.data/healthy`) is written by `src/bot.ts` when Discord connection succeeds
- After a restart, you are a fresh session — you will NOT remember the previous conversation

### Slash Commands

Users can use these slash commands in Discord:
- `/status` — bot uptime, model info, active conversations
- `/reset` — reset the conversation in this channel or DM
- `/reset-all` — wipe all conversation state and session files (admin only)
- `/help` — show the command/help summary

## Project Layout

```
src/
  index.ts          — entry point, signal handlers
  bot.ts            — Discord client, message dispatch, health file
  pi-runtime.ts     — Pi session management, conversation registry
  discord-routing.ts — routing logic, prompt formatting
  config.ts         — env var parsing (Zod)
  text.ts           — Discord message splitting, streaming preview
  logger.ts         — structured logger
scripts/
  run.sh            — process manager wrapper (start bot under this)
  self-deploy.sh    — pre-flight checks + trigger restart
test/               — vitest tests
.agents/skills/     — local reference skills (Discord.js docs, Pi SDK docs)
.data/              — runtime data (sessions, health file, restart sentinel, wrapper pid)
```

## Development

- **Type-check**: `npx tsc --noEmit`
- **Tests**: `npx vitest run`
- **Start (direct)**: `npm start`
- **Start (with process manager)**: `./scripts/run.sh`
