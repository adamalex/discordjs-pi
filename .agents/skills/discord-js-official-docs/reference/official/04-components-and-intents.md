# Provenance
- Upstream title or source name: official guide pages for buttons, interactive components, and gateway intents
- Upstream URL: https://discordjs.guide/interactive-components/buttons ; https://discordjs.guide/message-components/interactions.html ; https://discordjs.guide/popular-topics/intents.html
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: current guide pages; no page-level tag exposed
- Reason this file was included: buttons/components and intent selection are common failure points in Discord bot integrations

This file is an internally authored summary of official upstream sources.

# Buttons And Components

The official guide's button workflow is:
- build buttons with `ButtonBuilder`
- define at least `customId`, `style`, and `label`
- place buttons in an `ActionRowBuilder`
- send the row in `components` on a message or interaction reply

High-signal rules from the guide:
- `customId` is developer-defined and should uniquely identify the action path
- the custom id limit called out by the guide is 100 characters
- `Link` buttons use `setURL(...)`, do not use `customId`, and do not send an interaction
- destructive actions should use styles such as `ButtonStyle.Danger`

# Handling Component Interactions

The official guide describes three main handling strategies:
- `awaitMessageComponent()` when you want one response
- an `InteractionCollector` when you want a bounded stream of responses
- a permanent `InteractionCreate` handler when components are part of the bot's long-lived UI model

As with slash commands, component interactions must still be acknowledged quickly.

# Intents

The current intents guide emphasizes:
- choose only the intents your bot actually needs
- missing intents can remove events and reduce cache completeness
- privileged intents need explicit enablement or approval where required

Practical shortcuts:
- slash-command-only bot: start with `GatewayIntentBits.Guilds`
- message-triggered bot: add `GuildMessages`
- message content parsing: also add `MessageContent`
- member lifecycle features: likely add `GuildMembers`

If a helper method unexpectedly returns partial or missing data, check intent coverage before assuming the API itself is broken.
