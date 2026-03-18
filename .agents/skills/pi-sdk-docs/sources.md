# Pi SDK Docs Skill — Source Provenance

Archived from official sources for `@mariozechner/pi-coding-agent` **0.58.4**.
Retrieved: 2026-03-17.
Pinned in this repository: `package.json` → `0.58.4`.

## Official documentation

| Local path | Upstream URL | Reason |
|---|---|---|
| `reference/official/sdk.md` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md | Primary SDK reference: createAgentSession, AgentSession, events, ResourceLoader, tools, extensions, skills, context files, sessions, settings, exports |

## SDK examples

| Local path | Upstream URL | Reason |
|---|---|---|
| `reference/examples/01-minimal.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/01-minimal.ts | Minimal quick-start: defaults, event subscription, prompt() |
| `reference/examples/02-custom-model.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/02-custom-model.ts | Model selection: AuthStorage, ModelRegistry, getModel(), thinkingLevel |
| `reference/examples/03-custom-prompt.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/03-custom-prompt.ts | System prompt overrides: systemPromptOverride, appendSystemPromptOverride |
| `reference/examples/04-skills.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/04-skills.ts | Skill discovery, filtering, custom skills via DefaultResourceLoader |
| `reference/examples/05-tools.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/05-tools.ts | Built-in tool sets, individual tools, tool factories for custom cwd |
| `reference/examples/06-extensions.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/06-extensions.ts | Extensions from SDK: additionalExtensionPaths, extensionFactories, inline |
| `reference/examples/07-context-files.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/07-context-files.ts | AGENTS.md context file discovery and override |
| `reference/examples/08-prompt-templates.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/08-prompt-templates.ts | Slash commands / prompt templates |
| `reference/examples/09-api-keys-and-oauth.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/09-api-keys-and-oauth.ts | AuthStorage, runtime API key overrides, custom auth locations |
| `reference/examples/10-settings.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/10-settings.ts | SettingsManager: overrides, persistence, flush, in-memory testing |
| `reference/examples/11-sessions.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts | Session management: in-memory, persistent, continue, list, open |
| `reference/examples/12-full-control.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts | Full SDK control: custom ResourceLoader, no discovery, explicit config |
