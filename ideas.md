# Ideas for Enriching the Discord–Pi Bot Integration

## Current State

The bot is a functional message-based Discord↔Pi bridge: it receives Discord messages, forwards them as prompts to persistent Pi agent sessions (one per conversation key), streams text deltas back, and splits long responses across multiple Discord messages. It supports DMs, guild channels, and threads, with two admin commands (`!status`, `!reset-all`).

---

## 1. Slash Commands

**What:** Replace or supplement the `!status` / `!reset-all` bang-commands with proper Discord slash commands, and add new ones.

**Why:** Slash commands are discoverable (autocomplete), self-documenting (descriptions, options), and the officially recommended interaction model for Discord bots. The current bang-command approach is invisible to users who don't already know about it.

**Possible commands:**
- `/status` — bot uptime, model, active sessions
- `/reset` — reset the current conversation (scoped to channel/DM, not global)
- `/reset-all` — admin-only global reset
- `/model` — show or switch the active model/thinking level
- `/compact` — trigger manual session compaction via `session.compact()`
- `/help` — explain what the bot can do

**Pi SDK surfaces used:** `session.compact()`, `session.setModel()`, `session.cycleModel()`, `session.cycleThinkingLevel()`

**Discord.js surfaces used:** `SlashCommandBuilder`, `REST`/`Routes` deployment script, `InteractionCreate` handler, `ChatInputCommandInteraction`

---

## 2. Image Input Support

**What:** Accept image attachments and URL embeds from Discord messages and forward them to Pi as base64-encoded images.

**Why:** Pi's `prompt()` method already accepts an `images` option with base64 image content blocks. Discord messages frequently include screenshots, diagrams, and photos. Ignoring them loses context. The bot currently tells the user it's "text-only."

**Implementation sketch:**
- In `handleMessage`, inspect `message.attachments` and `message.embeds`
- Download image attachments, convert to base64
- Pass via `session.prompt(text, { images: [...] })`

---

## 3. Per-Conversation Reset (Not Just Global)

**What:** Allow resetting a single conversation without nuking all state.

**Why:** `!reset-all` is a sledgehammer. Users in one channel shouldn't lose context because someone in another channel wants a fresh start. The Pi SDK supports `session.newSession()` which creates a new session for the same agent.

**Implementation sketch:**
- Add a `reset(conversationKey)` method to `ConversationRegistry`
- Abort and dispose the single runtime, remove it from the map
- Delete or archive that conversation's session directory
- Next message in that channel creates a fresh runtime

---

## 4. Streaming Preview Improvements

**What:** Improve the visual quality of streaming responses.

**Why:** The current preview clips from the tail (`...{last N chars}`) which can land mid-word or mid-code-block, producing broken markdown in Discord. The `_Thinking..._` placeholder also doesn't distinguish between "waiting for first token" and "model is using extended thinking."

**Ideas:**
- Track whether the model is in thinking mode vs. text output mode (the `thinking_delta` event) and show a distinct indicator like `_Reasoning..._`
- Attempt to split the preview at a clean boundary (paragraph, line, sentence) rather than a hard character cut
- Show a brief tool-use indicator when tools are running (e.g., `_Reading files..._`, `_Running command..._`) using `tool_execution_start` events

---

## 5. Thread-per-Conversation Mode

**What:** When the bot receives a message in a regular guild channel, automatically create a thread for the conversation instead of replying inline.

**Why:** Long agent conversations clutter a channel. Threads keep them contained and let multiple concurrent conversations coexist in the same channel without interleaving. The conversation key would naturally become the thread ID.

**Discord.js surfaces used:** `message.startThread()`, `ThreadChannel`

---

## 6. Button-Based Interactions

**What:** Add interactive buttons for common actions on bot responses.

**Why:** Reduces friction for actions that users would otherwise need to type out.

**Possible buttons:**
- **🔄 Retry** — abort and re-prompt the same input
- **🗑️ Reset** — reset this conversation
- **📋 Compact** — trigger compaction when context is getting long
- **⏹️ Stop** — abort a long-running response mid-stream

**Discord.js surfaces used:** `ButtonBuilder`, `ActionRowBuilder`, `ButtonStyle`, component interaction collectors or `InteractionCreate` handler
**Pi SDK surfaces used:** `session.abort()`, `session.compact()`, `session.newSession()`

---

## 7. Expose Tool Activity to Users

**What:** Surface tool execution events (file reads, bash commands, edits) as visible feedback in Discord.

**Why:** When Pi is running tools, the user sees only `_Thinking..._` with no indication of progress. Showing tool activity builds trust and helps debug unexpected behavior.

**Implementation ideas:**
- Subscribe to `tool_execution_start` / `tool_execution_end` events
- Show a collapsible or inline summary: `🔧 read src/index.ts`, `⚙️ bash: npm test`
- Could be appended as a footer to the streaming preview, or sent as a separate ephemeral-style message
- Could use Discord embeds for richer formatting

---

## 8. Multi-Model / Thinking Level Controls

**What:** Let users (or admins) switch models or thinking levels per conversation.

**Why:** Different tasks benefit from different models. A quick question doesn't need `claude-opus-4-5` with `high` thinking. The Pi SDK already supports `session.setModel()`, `session.cycleModel()`, and `session.cycleThinkingLevel()`.

**Possible UX:**
- Slash command `/model set anthropic claude-sonnet-4-20250514` with autocomplete from `modelRegistry.getAvailable()`
- Slash command `/thinking low|medium|high|off`
- Buttons on each response to cycle thinking level

---

## 9. Custom System Prompt / Context Injection

**What:** Use `DefaultResourceLoader` with `systemPromptOverride` or `appendSystemPromptOverride` to inject Discord-specific context into the agent's system prompt.

**Why:** The bot currently uses Pi's default system prompt, which is designed for a CLI coding assistant. A Discord bot benefits from additional instructions like:
- "You are responding in Discord. Keep messages concise. Use markdown formatting that renders well in Discord."
- "The user's display name, username, and ID are provided at the top of each message."
- "You may be in a multi-user channel; address users by name when relevant."
- Suppress tool outputs that would be too verbose for chat (e.g., full file contents)

**Pi SDK surfaces used:** `DefaultResourceLoader({ systemPromptOverride, appendSystemPromptOverride })`

---

## 10. Session Branching / Fork

**What:** Let users fork a conversation at a previous point, creating a branch without losing the original thread.

**Why:** The Pi SDK has rich session tree support (`session.fork()`, `session.navigateTree()`, `SessionManager` tree API with `branch()`, `createBranchedSession()`). This is a unique capability that most chat bots don't offer.

**Possible UX:**
- Reply to an older bot message with a `/fork` command or a 🔀 button
- The bot creates a new thread (or DM context) branched from that point in the session tree
- The original conversation continues unaffected

---

## 11. Permissions and Access Control

**What:** Add role-based or user-based access control for bot interactions.

**Why:** Currently any user can talk to the bot and run admin commands. In a guild setting, you'd want:
- Only certain roles can use the bot at all
- Only admins can reset conversations or change models
- Rate limiting per user to prevent API cost runaway

**Implementation sketch:**
- Config: allowed role IDs, admin user IDs
- Check `message.member.roles` before processing
- Slash command permissions via `setDefaultMemberPermissions()`

---

## 12. Rich Embeds for Structured Output

**What:** Detect structured output patterns (code blocks, lists, errors, tool results) and render them using Discord embeds.

**Why:** Plain text responses hit Discord's 2000-char limit awkwardly. Embeds support up to 6000 characters total across fields and allow colored sidebars, titles, and footers for better visual hierarchy.

**Ideas:**
- Wrap code blocks in embed code fields
- Use embed color to signal success (green) vs. error (red)
- Show tool execution summaries in embed footers
- Use embed author field for model/thinking level info

---

## 13. File Attachment Responses

**What:** When Pi produces large outputs (full file contents, long command output), attach them as files rather than splitting across many messages.

**Why:** A 10,000-character bash output split into 5+ messages is noisy and hard to read. A `.txt` or `.md` attachment is more ergonomic.

**Implementation sketch:**
- Detect when `splitDiscordMessage` would produce more than N chunks
- Instead, attach the full text as a `Buffer` via `channel.send({ files: [{ attachment: buffer, name: 'output.md' }] })`

---

## 14. Conversation Persistence Improvements

**What:** Improve session lifecycle management — auto-compaction awareness, session age limits, and graceful session recovery.

**Why:** Long-running conversations will eventually hit context limits. The Pi SDK supports auto-compaction events (`auto_compaction_start/end`) and manual `session.compact()`. The bot should handle these gracefully rather than letting the session silently degrade.

**Ideas:**
- Listen for `auto_compaction_start/end` events and notify the user
- Set compaction thresholds via `SettingsManager`
- Implement session TTL — auto-reset stale conversations after N hours
- On startup, resume existing sessions from disk (the bot already does `continueRecent`, but could surface this to users)

---

## 15. Extension-Based Discord Integration

**What:** Write a Pi extension that gives the agent awareness of Discord-specific capabilities.

**Why:** A Pi extension can register custom tools that the agent can invoke proactively. For example:

- `discord_react` — add a reaction to a message
- `discord_reply` — reply to a specific earlier message in the thread
- `discord_pin` — pin an important message
- `discord_create_thread` — start a new thread

This would let the agent take Discord actions beyond just sending text responses.

**Pi SDK surfaces used:** `extensionFactories` on `DefaultResourceLoader`, `pi.registerTool()`, `pi.on()` event hooks

---

## Priority Suggestions

| Priority | Idea | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | 9. Custom system prompt | Small | Big quality-of-life improvement for all responses |
| 🔴 High | 2. Image input | Small | Unlocks a whole input modality that's already supported by Pi |
| 🔴 High | 3. Per-conversation reset | Small | Basic missing functionality |
| 🟡 Medium | 1. Slash commands | Medium | Proper Discord UX, discoverable features |
| 🟡 Medium | 4. Streaming preview improvements | Small | Polish |
| 🟡 Medium | 7. Tool activity feedback | Small | Transparency during long operations |
| 🟡 Medium | 5. Thread-per-conversation | Medium | Much better multi-user channel experience |
| 🟡 Medium | 13. File attachments for long output | Small | Cleaner output for verbose responses |
| 🟡 Medium | 14. Compaction awareness | Small | Robustness for long conversations |
| 🟠 Lower | 6. Button interactions | Medium | Nice UX but not essential |
| 🟠 Lower | 8. Model/thinking controls | Medium | Power-user feature |
| 🟠 Lower | 11. Permissions | Medium | Important for shared guilds |
| 🟠 Lower | 12. Rich embeds | Medium | Visual polish |
| 🔵 Ambitious | 10. Session branching/fork | Large | Unique capability, complex UX |
| 🔵 Ambitious | 15. Discord-aware extensions | Large | Gives the agent agency over Discord itself |
