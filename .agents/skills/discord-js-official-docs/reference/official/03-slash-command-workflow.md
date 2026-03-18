# Provenance
- Upstream title or source name: official guide pages for creating commands, command handling, command deployment, and response methods
- Upstream URL: https://discordjs.guide/legacy/app-creation/creating-commands ; https://discordjs.guide/legacy/app-creation/handling-commands ; https://discordjs.guide/legacy/app-creation/deploying-commands ; https://discordjs.guide/slash-commands/response-methods.html
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide pages; no page-level tag exposed
- Reason this file was included: this is the highest-signal official workflow for the most likely bot architecture in this repository

This file is an internally authored summary of official upstream sources.

# Official Workflow

The official guide treats slash-command bots as three separate pieces:
- command files
- command handling
- command deployment

All three are required before commands are actually usable in Discord.

## 1. Command Files

Each command file should export:
- `data`: usually a `SlashCommandBuilder`
- `execute(interaction)`: the runtime behavior

The official guide's baseline command shape is a `ping` command whose `execute()` replies to the interaction.

## 2. Command Loading

The guide recommends:
- a `commands/` directory
- reading command files from disk at startup
- storing them in `client.commands = new Collection()`
- validating that every loaded module exports both `data` and `execute`

That pattern matters because it keeps feature growth out of one giant `if/else` chain.

## 3. Interaction Handling

The guide's runtime flow is:
- listen to `Events.InteractionCreate`
- return early unless `interaction.isChatInputCommand()`
- resolve the command with `interaction.client.commands.get(interaction.commandName)`
- call `await command.execute(interaction)`
- on errors, reply or follow up ephemerally depending on whether the interaction was already replied to or deferred

## 4. Deployment

The guide explicitly recommends a standalone deployment script instead of doing command registration on every bot startup.

Why:
- slash commands only need redeployment when the command definition changes
- command creation has rate limits
- a lightweight REST script is preferred over bringing up a full gateway client just to register commands

Recommended deployment rhythm:
- deploy to a single guild while iterating
- deploy globally after the definitions stabilize

## 5. Reply Lifecycle

The official response guide calls out a few rules future agents should not violate:
- the initial response must happen within 3 seconds
- use `deferReply()` early if work may exceed that window
- after the initial response or deferral, you generally have 15 minutes to edit or follow up
- set ephemeral state on the first response or defer call; do not assume you can change that later
- `reply`, `editReply`, `followUp`, and `fetchReply` are distinct steps in the lifecycle, not interchangeable aliases

# Practical Rule For This Repo

If this repository later grows into a normal Discord bot:
- keep command definition, loading, deployment, and execution as separate concerns
- use `REST`/`Routes` for deployment
- use `InteractionCreate` for runtime handling
- default to guild deployment while features are still changing
