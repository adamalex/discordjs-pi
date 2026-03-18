---
name: discord-js-official-docs
description: Use this skill when building or maintaining this repository's integration with the official discord.js package. It covers the upstream discord.js docs, guide, and examples for Node.js bot/client work, especially client setup, slash command creation and deployment, interaction replies, buttons/components, intents, and v14 migration risks. Use it when touching Discord bot logic, command handlers, REST command registration, or other discord.js API usage.
license: Apache-2.0
---

# Purpose

This skill packages a compact local reference pack for the upstream `discord.js` project.

It covers:
- the main official `discord.js` package docs
- the official guide pages most relevant to a typical bot/client integration
- short official example excerpts for command registration, command handling, replies, and buttons
- migration cautions for code that may still follow older pre-v14 patterns

What was inferred from `TARGET_PROJECT_URL`:
- upstream project: `discord.js`
- primary package: `discord.js`
- official repository: `https://github.com/discordjs/discord.js`
- official docs surface: `https://discord.js.org/docs/packages/discord.js/main`
- official guide surface: `https://discordjs.guide`

What was inferred from this repository:
- this repository currently has no `package.json`, lockfile, or Discord integration code to pin a local version or a narrower upstream surface
- the repo name (`discordjs-pi`) and the target URL both point to the main `discord.js` package rather than lower-level `@discordjs/*` packages
- the most relevant integration mode for future work here is a Node.js Discord bot/client using the main `discord.js` package, especially slash commands, interactions, REST command deployment, buttons/components, and gateway intents

# When to use this skill

Use this skill when:
- adding or changing `discord.js` imports
- wiring up a `Client`, events, or gateway intents
- creating slash commands with `SlashCommandBuilder`
- deploying commands with `REST` and `Routes`
- handling `InteractionCreate` or `ChatInputCommandInteraction`
- building buttons or other interaction-driven components
- reviewing code that may still follow older v13 naming or patterns

Examples:
- "Add a `/ping` slash command and deploy it"
- "Fix a broken interaction reply flow"
- "Add button-based confirmation UI"
- "Check whether this code uses old v13 APIs"
- "Confirm which intents are actually required"

# How to use this skill

Read this file first.

Then:
1. Read the most relevant bundled reference in `reference/official/`.
2. Check the matching official example excerpt in `reference/examples/`.
3. Prefer these bundled official docs and examples over generic web browsing.
4. Use official examples to confirm API shape, event names, route helpers, option names, and reply lifecycles.
5. Do not invent APIs, flags, types, behaviors, lifecycle rules, or configuration keys.
6. If behavior is ambiguous or time-sensitive, verify against the installed dependency version, local type definitions, and the live official upstream docs.

Because this repository does not currently pin `discord.js`, treat version drift as an explicit risk on every change.

# Bundled Resources Map

Read these by scenario:

- Repository surface and license check: `reference/official/00-upstream-surface-and-license.md`
- Package overview, runtime floor, and official entry points: `reference/official/01-package-overview.md`
- Core API crosswalk for `Client`, `ChatInputCommandInteraction`, `REST`, `GatewayIntentBits`, and `Routes`: `reference/official/02-core-api-for-bots.md`
- Slash command creation, loading, deployment, and reply lifecycle: `reference/official/03-slash-command-workflow.md`
- Buttons, component interactions, and intent selection: `reference/official/04-components-and-intents.md`
- Old-to-new API breakages and v14 modernization cautions: `reference/official/05-v14-migration-cautions.md`

Read these example excerpts when you need working shapes fast:

- Global and guild command registration: `reference/examples/01-register-commands.md`
- Command module and `InteractionCreate` handler shape: `reference/examples/02-command-handler.md`
- `reply`, ephemeral replies, and deferred replies: `reference/examples/03-response-patterns.md`
- Buttons and action rows: `reference/examples/04-buttons.md`

# Usage Rules

- Stay aligned with the official `discord.js` docs and guide.
- Prefer newer official docs over older archived material if the same topic appears twice.
- If local code appears to use an older pattern, do not blindly modernize it. First determine whether the repo intentionally lags the latest docs.
- Call out version drift whenever the docs, examples, local types, and installed dependency do not clearly agree.
- `Routes` is documented under `discord-api-types`, but the official `discord.js` examples import it from `discord.js`; follow the installed package surface in this repo.
- If you need lower-level packages such as `@discordjs/core`, `@discordjs/rest`, or `@discordjs/voice`, verify that the codebase actually uses them before expanding scope beyond this skill.

# Refresh Guidance

When the upstream integration changes materially:
- refresh the bundled references from the latest official `discord.js` docs, guide, and repository sources
- update every provenance header with the new retrieval date and any visible release/tag/commit metadata
- update `sources.md`
- re-check whether this repository finally pins `discord.js` in a manifest or lockfile, then add an explicit version drift note if needed
