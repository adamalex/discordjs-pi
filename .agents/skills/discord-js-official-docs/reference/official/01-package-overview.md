# Provenance
- Upstream title or source name: `discord.js (main)` docs landing page and official monorepo README
- Upstream URL: https://discord.js.org/docs/packages/discord.js/main ; https://raw.githubusercontent.com/discordjs/discord.js/main/README.md
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: latest visible `discord.js` release `14.25.1` (`fdac8c5`); docs page is the current `main` surface
- Reason this file was included: capture the official package entry point, runtime floor, optional packages, and the default example shape future coding agents are most likely to need

This file is an internally authored summary of official upstream sources.

# What `discord.js` Is

The official docs describe `discord.js` as the main Node.js module for interacting with the Discord API.

The docs landing page emphasizes:
- object-oriented API surface
- predictable abstractions
- performance
- broad Discord API coverage

# Runtime And Install Notes

The current docs landing page says:
- Node.js `22.12.0` or newer is required

Official install commands:
- `npm install discord.js`
- `yarn add discord.js`
- `pnpm add discord.js`
- `bun add discord.js`

Optional packages called out by the docs:
- `zlib-sync` for WebSocket compression/inflation
- `bufferutil` for faster WebSocket handling
- `@discordjs/voice` for voice API usage

For this repository, only `@discordjs/voice` is likely to justify expanding beyond the main package docs, and only if voice features are actually added.

# Official Entry Points To Prefer

For common bot work, the landing page and guide point you toward:
- `Client` for the gateway-connected bot client
- `Events` for event names
- `GatewayIntentBits` for client intent selection
- `REST` and `Routes` for command deployment
- the official guide for command workflow, reply lifecycle, components, and migration notes

# What The Official Top-Level Examples Imply

The top-level docs examples use:
- ES module imports from `discord.js`
- `new REST({ version: '10' }).setToken(TOKEN)` for command registration
- `Routes.applicationCommands(CLIENT_ID)` for command deployment
- `new Client({ intents: [GatewayIntentBits.Guilds] })` as the minimum slash-command client
- `Events.ClientReady` and `Events.InteractionCreate`
- `interaction.isChatInputCommand()` as the guard before replying

That is the baseline shape this skill assumes unless the repository later proves it uses another pattern intentionally.

# Version Drift Note

This repository does not currently pin `discord.js`, so there is no local installed version to compare against the latest official docs.

The target URL was versioned to `14.25.1`, and the latest visible `discord.js` release on the official releases page is also `14.25.1`.
Even so, this skill archives the current official docs surface and treats future local dependency pinning as a required follow-up check.

