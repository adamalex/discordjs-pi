# Provenance
- Upstream title or source name: `Client`, `ChatInputCommandInteraction`, `REST`, `GatewayIntentBits`, and `Routes` docs
- Upstream URL: https://discord.js.org/docs/packages/discord.js/main/Client%3AClass ; https://discord.js.org/docs/packages/discord.js/main/ChatInputCommandInteraction%3AClass ; https://discord.js.org/docs/packages/discord.js/main/REST%3AClass ; https://discord.js.org/docs/packages/discord.js/main/GatewayIntentBits%3AEnum ; https://discord.js.org/docs/packages/discord-api-types/main/Routes%3AVariable
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: docs `main`; no page-level tag exposed
- Reason this file was included: future coding agents need a compact crosswalk for the small set of core APIs most likely to appear in this repository

This file is an internally authored summary of official upstream sources.

# Core Bot APIs

## `Client`

Use `Client` as the main hub for a bot application.

High-signal surfaces from the official docs:
- initialize it with the intents your bot actually needs
- call `client.login(token)` to establish the gateway connection
- use `Events.ClientReady` for startup logging and post-login initialization
- use `Events.InteractionCreate` for slash commands and component interactions
- `client.rest` exists if you need REST event hooks or lower-level request observation

Practical rule for this repo:
- if the code is a normal Discord bot, start from `Client`
- do not reach for lower-level packages unless the repository clearly chooses them

## `ChatInputCommandInteraction`

This is the class for slash command interactions.

High-signal methods and properties:
- `commandName`
- `options`
- `locale`
- `memberPermissions`
- `reply(...)`
- `deferReply(...)`
- `editReply(...)`
- `followUp(...)`
- `fetchReply()`
- `showModal(...)`

Use `interaction.isChatInputCommand()` as the guard before treating a generic interaction as a slash command.

## `REST`

Use `REST` for command deployment and other direct API work that does not require a gateway-connected client.

The official docs emphasize:
- `new REST(...)`
- `setToken(token)`
- `put`, `post`, `patch`, `get`, and `delete`

For command deployment, the common path is:
- build a JSON body of commands
- `await rest.put(route, { body: commands })`

## `GatewayIntentBits`

Use `GatewayIntentBits` to declare the events and data your bot needs.

Important points from the official docs and guide:
- `Guilds` is the minimal starting intent for slash-command bots
- message-reading bots usually need `GuildMessages`
- reading message content also requires privileged `MessageContent`
- membership or presence features may require privileged `GuildMembers` or `GuildPresences`
- some caches and convenience APIs degrade if you omit intents that the client relies on for cache population

## `Routes`

`Routes` is documented under the official `discord-api-types` docs, but the official `discord.js` example imports it from `discord.js`.

For application commands, the key helpers are:
- `Routes.applicationCommands(applicationId)`
- `Routes.applicationGuildCommands(applicationId, guildId)`

Practical rule:
- keep using the import style shown by the installed package version in this repository
- do not invent route strings manually when a route helper already exists

# Safe Defaults

For a new slash-command bot:
- `Client`
- `Events`
- `GatewayIntentBits.Guilds`
- `REST`
- `Routes.applicationGuildCommands(...)` while iterating
- `Routes.applicationCommands(...)` when promoting stable commands globally

