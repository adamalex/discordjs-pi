# Provenance
- Upstream title or source name: official `Updating to v14` guide
- Upstream URL: https://discordjs.guide/additional-info/changes-in-v14.html
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide page; no page-level tag exposed
- Reason this file was included: older Discord bot snippets often still use v13 naming and patterns; future agents need a short checklist before reusing them

This file is an internally authored summary of official upstream sources.

# Highest-Risk V14 Changes

## Included Packages

The official guide says several packages are included in v14 and should usually not be installed separately just to support normal `discord.js` usage:
- `@discordjs/builders`
- `@discordjs/formatters`
- `@discordjs/rest`
- `discord-api-types`

If this repository later pins mixed package versions, check compatibility deliberately instead of assuming the older split-package setup is correct.

## API Version And Enums

The guide says v14 uses Discord API v10.

Common breakage patterns:
- enum names changed
- enum members are `PascalCase`
- old stringly typed or magic-number patterns should be replaced with official enums

## Renames And Event Changes

The guide calls out several high-frequency migrations:
- `message` -> `messageCreate`
- `interaction` -> `interactionCreate`
- `MessageEmbed` -> `EmbedBuilder`
- `MessageAttachment` -> `AttachmentBuilder`
- modal and message component builders now use builder-style names consistently

## Type Guard Changes

Several older type-guard helpers were removed.

The guide recommends comparing `channel.type` against `ChannelType` enum values instead of relying on removed single-channel-type guards.

## Builders vs Received Structures

The guide notes that builders are no longer returned back from the API the same way older code may expect.

Practical rule:
- send builders
- expect received API-backed objects and structures, not the exact builder instances you constructed

## Collector And Component Changes

The guide notes that component collector options use `ComponentType` enum values.
If older code still uses legacy constants or string values, verify it against current typings before copying it.

# Migration Rule For This Repo

Before copying any Discord.js snippet from old memory or old code:
- check for pre-v14 event names
- check for renamed builder classes
- check for old constant names
- check for old channel type guards
- check whether the code is manually installing packages already bundled by v14
