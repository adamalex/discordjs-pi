# Pi SDK Local Reference Pack

**Read this file first** before changing any Pi integration code.

## Version status

| Field | Value |
|---|---|
| Package | `@mariozechner/pi-coding-agent` |
| Archived version | **0.58.4** |
| Pinned in repo? | **No — PROVISIONAL** |
| npm publish date | 2026-03-16 |
| Archive retrieved | 2026-03-17 |

> **PROVISIONAL:** This repo does not yet have a `package.json` pinning the Pi dependency.
> The archive reflects **0.58.4** (latest stable at time of retrieval).
> Once the dependency is pinned, refresh this archive to match and remove the PROVISIONAL label.

## This archive is SDK-first

This repo uses Pi in **SDK mode** (embedded/programmatic via `createAgentSession()`), not as a CLI/TUI.
The archived material is curated for that use case.

## What to read and when

| Topic | Start here |
|---|---|
| **Quick start / embedding** | `official/sdk.md` → Quick Start |
| **`createAgentSession()` options** | `official/sdk.md` → Options Reference |
| **`AgentSession` interface** | `official/sdk.md` → AgentSession |
| **Event streaming / subscriptions** | `official/sdk.md` → Events |
| **`ResourceLoader` / `DefaultResourceLoader`** | `official/sdk.md` → ResourceLoader |
| **`AGENTS.md` / context files** | `official/sdk.md` → Context Files, `examples/07-context-files.ts` |
| **Skills** | `official/sdk.md` → Skills, `examples/04-skills.ts` |
| **Extensions (from SDK)** | `official/sdk.md` → Extensions, `examples/06-extensions.ts` |
| **Prompt templates / slash commands** | `official/sdk.md` → Slash Commands, `examples/08-prompt-templates.ts` |
| **Tools / custom tools** | `official/sdk.md` → Tools / Custom Tools, `examples/05-tools.ts` |
| **Model selection** | `official/sdk.md` → Model, `examples/02-custom-model.ts` |
| **System prompt overrides** | `official/sdk.md` → System Prompt, `examples/03-custom-prompt.ts` |
| **API keys / auth** | `official/sdk.md` → API Keys and OAuth, `examples/09-api-keys-and-oauth.ts` |
| **Session management** | `official/sdk.md` → Session Management, `examples/11-sessions.ts` |
| **Settings** | `official/sdk.md` → Settings Management, `examples/10-settings.ts` |
| **Full control (no discovery)** | `examples/12-full-control.ts` |
| **Minimal example** | `examples/01-minimal.ts` |

## Official sources used

| Source | URL |
|---|---|
| SDK documentation | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md |
| SDK examples | https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/sdk |
| npm registry | https://www.npmjs.com/package/@mariozechner/pi-coding-agent |

Full per-file provenance is in `sources.md`.

## What we intentionally did NOT archive

- **Interactive TUI docs** (`tui.md`, `keybindings.md`, `themes.md`) — not relevant to SDK embedding
- **Terminal/shell setup** (`terminal-setup.md`, `shell-aliases.md`, `tmux.md`, `termux.md`, `windows.md`) — runtime environment, not SDK API
- **RPC mode docs** (`rpc.md`) — this repo uses the SDK directly, not via subprocess RPC
- **Print/JSON mode docs** (`json.md`) — not relevant to programmatic embedding
- **Full extensions docs** (`extensions.md`, 67KB) — the SDK doc covers extension loading from SDK; the full extension authoring guide is available upstream
- **Package browsing/install docs** (`packages.md`) — not relevant to SDK integration
- **Settings file format** (`settings.md`) — covered sufficiently in SDK doc SettingsManager section
- **Development/contributing docs** (`development.md`) — not needed for downstream consumption
- **Provider/model configuration docs** (`providers.md`, `models.md`, `custom-provider.md`) — covered in SDK doc Model section
- **Session file format** (`session.md`) — covered in SDK doc Session Management section
- **Compaction internals** (`compaction.md`) — implementation detail, not SDK API surface

## Refreshing this archive

When upgrading `@mariozechner/pi-coding-agent`:

1. Note the new version number from `package.json` / lockfile.
2. Re-fetch `sdk.md` and all `examples/sdk/*.ts` from the matching tag/commit in https://github.com/badlogic/pi-mono.
3. Update provenance headers in each file.
4. Update the version table above.
5. Remove the PROVISIONAL label if the dependency is now pinned.
6. Review `sources.md` for accuracy.
