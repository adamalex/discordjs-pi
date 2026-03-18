# Provenance
- Upstream title or source name: `discordjs/discord.js` README, `discordjs/discord.js` LICENSE, and official releases page
- Upstream URL: https://raw.githubusercontent.com/discordjs/discord.js/main/README.md ; https://raw.githubusercontent.com/discordjs/discord.js/main/LICENSE ; https://github.com/discordjs/discord.js/releases
- Retrieval date: 2026-03-17
- Upstream commit/tag/release: monorepo `main`; latest visible `discord.js` release `14.25.1` (`fdac8c5`)
- Reason this file was included: establish the official repo/docs/guide/package relationship, verify licensing, and record the latest visible package release for drift checks

This file is an internally authored summary of official upstream sources.

# Upstream Surface

The official upstream project is the `discordjs/discord.js` monorepo.

From the official README:
- the assembled Discord API wrapper is `discord.js`
- the documentation lives at `https://discord.js.org/docs`
- the guide lives at `https://discordjs.guide`
- the docs source is in `apps/website`
- the guide source is in `apps/guide`
- the main package source is in `packages/discord.js`

That matters for this skill because the target URL points at the main package docs, not at lower-level packages such as `@discordjs/core`, `@discordjs/rest`, or `@discordjs/ws`.

# License

The monorepo LICENSE is Apache License 2.0.

Because the licensing is clear, short official excerpts are included in `reference/examples/`.
The larger reference files are stored as compact internal summaries instead of full-page copies so the skill stays navigable and avoids turning into a noisy mirror.

# Latest Visible Release

The official releases page shows:
- latest visible `discord.js` release: `14.25.1`
- release date shown on the page: 2025-11-21
- visible release commit: `fdac8c5`

The docs landing page used in this skill is the current `main` docs surface, not a repo-local pinned version.

# Repository Inference For This Skill

This repository currently contains:
- no `package.json`
- no lockfile
- no Discord integration code
- no Git metadata in the current working directory

So the skill scope is inferred primarily from:
- the target URL: `https://discord.js.org/docs/packages/discord.js/14.25.1`
- the repo name: `discordjs-pi`

The practical interpretation is:
- future work here is most likely to use the main `discord.js` package
- the highest-signal official material is client setup, events, slash commands, interaction replies, buttons/components, REST command deployment, intents, and v14 migration cautions

