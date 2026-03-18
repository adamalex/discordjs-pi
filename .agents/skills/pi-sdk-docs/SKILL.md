---
name: pi-sdk-docs
description: Use this skill when building or maintaining this repository's integration with @mariozechner/pi-coding-agent in SDK mode. It covers createAgentSession(), AgentSession events, ResourceLoader, context files, skills, tools, extensions, prompt templates, auth, settings, sessions, and bundled official SDK examples. Use it when touching src/pi-runtime.ts, session management, tool wiring, model selection, prompt handling, or other Pi SDK integration code.
license: MIT
---

# Purpose

This skill packages a compact local reference pack for the upstream `@mariozechner/pi-coding-agent` package, focused on **SDK embedding** rather than the CLI/TUI.

It covers:
- the main official SDK documentation
- official SDK examples for common embedding and integration tasks
- repository-focused guidance for when to read which example or section
- version-drift cautions for changes that depend on the installed package version

What was inferred from this repository:
- this repo uses Pi in **SDK mode** via `@mariozechner/pi-coding-agent`
- the dependency is currently pinned in `package.json` as `0.58.4`
- the most relevant integration areas here are session management, streaming, tools, prompts, context files, and model/runtime configuration

# Version status

| Field | Value |
|---|---|
| Package | `@mariozechner/pi-coding-agent` |
| Archived version | **0.58.4** |
| Pinned in repo? | **Yes — `package.json`** |
| npm publish date | 2026-03-16 |
| Archive retrieved | 2026-03-17 |

# When to use this skill

Use this skill when:
- changing `@mariozechner/pi-coding-agent` imports
- wiring or reconfiguring `createAgentSession()`
- reviewing or updating `src/pi-runtime.ts`
- working on event streaming, subscriptions, or message flow
- changing tool wiring, custom tools, or working directory behavior
- changing skills, extensions, prompt templates, or context-file behavior
- adjusting auth, model selection, settings, or session persistence

Examples:
- "Add a custom tool to the Pi session"
- "How do we configure a different model in SDK mode?"
- "Show me the Pi SDK session management pattern"
- "How do context files and AGENTS.md work with the SDK?"
- "How should we load skills or extensions from the SDK?"

# How to use this skill

Read this file first.

Then:
1. Read `reference/official/sdk.md` for the authoritative SDK surface.
2. Read the matching example in `reference/examples/` for the concrete usage pattern.
3. Prefer these bundled official docs and examples over generic web browsing.
4. Use the examples to confirm option names, event shapes, loader configuration, and session flow.
5. Do not invent APIs, config keys, events, resource-loader behavior, or lifecycle rules.
6. If behavior is ambiguous or time-sensitive, verify against the installed dependency version, local type definitions, and the live upstream docs.

Because SDK behavior can drift across releases, keep the bundled references aligned with the version pinned in this repository.

# Bundled Resources Map

Read these by scenario:

- Quick start / embedding: `reference/official/sdk.md` → Quick Start
- `createAgentSession()` options: `reference/official/sdk.md` → Options Reference
- `AgentSession` interface: `reference/official/sdk.md` → AgentSession
- Event streaming / subscriptions: `reference/official/sdk.md` → Events
- `ResourceLoader` / `DefaultResourceLoader`: `reference/official/sdk.md` → ResourceLoader
- `AGENTS.md` / context files: `reference/official/sdk.md` → Context Files, `reference/examples/07-context-files.ts`
- Skills: `reference/official/sdk.md` → Skills, `reference/examples/04-skills.ts`
- Extensions from SDK usage: `reference/official/sdk.md` → Extensions, `reference/examples/06-extensions.ts`
- Prompt templates / slash commands: `reference/official/sdk.md` → Slash Commands, `reference/examples/08-prompt-templates.ts`
- Tools / custom tools: `reference/official/sdk.md` → Tools / Custom Tools, `reference/examples/05-tools.ts`
- Model selection: `reference/official/sdk.md` → Model, `reference/examples/02-custom-model.ts`
- System prompt overrides: `reference/official/sdk.md` → System Prompt, `reference/examples/03-custom-prompt.ts`
- API keys / auth: `reference/official/sdk.md` → API Keys and OAuth, `reference/examples/09-api-keys-and-oauth.ts`
- Session management: `reference/official/sdk.md` → Session Management, `reference/examples/11-sessions.ts`
- Settings: `reference/official/sdk.md` → Settings Management, `reference/examples/10-settings.ts`
- Full control / no discovery: `reference/examples/12-full-control.ts`
- Minimal example: `reference/examples/01-minimal.ts`

# Official sources used

| Source | URL |
|---|---|
| SDK documentation | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md |
| SDK examples | https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/examples/sdk |
| npm registry | https://www.npmjs.com/package/@mariozechner/pi-coding-agent |

Full per-file provenance is in `sources.md`.

# What this skill intentionally does NOT bundle

- interactive TUI docs like themes, keybindings, and TUI component APIs
- terminal setup and shell environment docs
- RPC-mode documentation
- JSON / print-mode docs
- the full extension authoring guide beyond what the SDK docs cover
- package browsing / install docs unrelated to embedding
- development and contributing docs for the upstream project
- internal implementation details like compaction internals

Use the broader upstream docs when you need those topics.

# Refresh Guidance

When upgrading `@mariozechner/pi-coding-agent`:
- refresh `reference/official/sdk.md` and the files under `reference/examples/` from the matching upstream tag/commit
- update provenance headers in each archived file
- update `sources.md`
- update the version table above if the pin changes
- re-check that the bundled topics still match this repository's actual Pi usage
