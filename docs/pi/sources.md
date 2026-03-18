# Pi Reference Pack — Source Provenance

All files archived from official sources for `@mariozechner/pi-coding-agent` **0.58.4** (PROVISIONAL).
Retrieved: 2026-03-17.

## Official documentation

| Local path | Upstream URL | Reason |
|---|---|---|
| `official/sdk.md` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md | Primary SDK reference: createAgentSession, AgentSession, events, ResourceLoader, tools, extensions, skills, context files, sessions, settings, exports |

## SDK examples

| Local path | Upstream URL | Reason |
|---|---|---|
| `examples/01-minimal.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/01-minimal.ts | Minimal quick-start: defaults, event subscription, prompt() |
| `examples/02-custom-model.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/02-custom-model.ts | Model selection: AuthStorage, ModelRegistry, getModel(), thinkingLevel |
| `examples/03-custom-prompt.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/03-custom-prompt.ts | System prompt overrides: systemPromptOverride, appendSystemPromptOverride |
| `examples/04-skills.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/04-skills.ts | Skill discovery, filtering, custom skills via DefaultResourceLoader |
| `examples/05-tools.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/05-tools.ts | Built-in tool sets, individual tools, tool factories for custom cwd |
| `examples/06-extensions.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/06-extensions.ts | Extensions from SDK: additionalExtensionPaths, extensionFactories, inline |
| `examples/07-context-files.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/07-context-files.ts | AGENTS.md context file discovery and override |
| `examples/08-prompt-templates.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/08-prompt-templates.ts | Slash commands / prompt templates |
| `examples/09-api-keys-and-oauth.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/09-api-keys-and-oauth.ts | AuthStorage, runtime API key overrides, custom auth locations |
| `examples/10-settings.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/10-settings.ts | SettingsManager: overrides, persistence, flush, in-memory testing |
| `examples/11-sessions.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/11-sessions.ts | Session management: in-memory, persistent, continue, list, open |
| `examples/12-full-control.ts` | https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/sdk/12-full-control.ts | Full SDK control: custom ResourceLoader, no discovery, explicit config |
