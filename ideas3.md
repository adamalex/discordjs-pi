# Discord–Pi Bot: Consolidated Ideas

## Current State

The bot is a message-based Discord↔Pi bridge: it receives Discord messages, forwards them as prompts to persistent Pi agent sessions (one per conversation key), streams text deltas back, and splits long responses across multiple Discord messages. It supports DMs, guild channels, and threads. Discord slash commands (`/status`, `/reset`, `/reset-all`, `/help`) provide discoverable interaction UX. Per-conversation reset is supported. Tool execution is surfaced inline during streaming.

The largest unused capability areas are: Pi resource customization (extensions, custom tools, system prompt overrides), multimodal input handling, advanced Discord UX (buttons, modals, threads), and advanced Pi session controls (branching, compaction, model switching).

---

## Ideas

### 1. Image Input Support

Accept image attachments and URL embeds from Discord messages and forward them to Pi as base64-encoded images. Pi's `prompt()` already accepts an `images` option. The bot currently rejects non-text input.

**Implementation:** Inspect `message.attachments` and `message.embeds`, download images, convert to base64, pass via `session.prompt(text, { images: [...] })`.

---

### 2. Custom System Prompt / Context Injection

Use `DefaultResourceLoader` with `systemPromptOverride` or `appendSystemPromptOverride` to inject Discord-specific context. The default Pi system prompt is designed for a CLI coding assistant, not a Discord bot.

**Useful injections:**
- "You are responding in Discord. Keep messages concise. Use Discord-friendly markdown."
- "The user's display name, username, and ID are provided at the top of each message."
- "In multi-user channels, address users by name when relevant."
- Suppress overly verbose tool outputs for chat context

---

### 3. Thread-per-Conversation Mode

When the bot receives a message in a regular guild channel, automatically create a thread for the conversation instead of replying inline. Long agent conversations clutter a channel; threads keep them contained.

**Surfaces:** `message.startThread()`, `ThreadChannel`

---

### 4. Button-Based Interactions

Add interactive buttons for common actions on bot responses to reduce friction.

**Possible buttons:**
- 🔄 **Retry** — re-prompt the same input
- 🗑️ **Reset** — reset this conversation
- 📋 **Compact** — trigger compaction when context is long
- ⏹️ **Stop** — abort a long-running response mid-stream

**Surfaces:** `ButtonBuilder`, `ActionRowBuilder`, `session.abort()`, `session.compact()`

---

### 5. Multi-Model / Thinking Level Controls

Let users or admins switch models or thinking levels per conversation. Different tasks benefit from different models.

**UX options:**
- Slash command with autocomplete from `modelRegistry.getAvailable()`
- Slash command `/thinking low|medium|high|off`
- Buttons on responses to cycle thinking level

**Surfaces:** `session.setModel()`, `session.cycleModel()`, `session.cycleThinkingLevel()`

---

### 6. Streaming Preview Improvements

Improve visual quality of streaming responses. The current preview clips from the tail which can break mid-word or mid-code-block.

**Ideas:**
- Distinguish "waiting for first token" from "model is using extended thinking" (`thinking_delta` event → `_Reasoning..._`)
- Split preview at clean boundaries (paragraph, line, sentence) rather than hard character cut

---

### 7. File Attachment Responses

When Pi produces large outputs, attach them as files rather than splitting across many messages. A 10,000-character output split into 5+ messages is noisy.

**Implementation:** Detect when `splitDiscordMessage` would produce more than N chunks; attach full text as a `.md` or `.txt` file via `channel.send({ files: [...] })`.

---

### 8. Compaction & Session Lifecycle

Improve session lifecycle management for long-running conversations.

**Ideas:**
- Listen for `auto_compaction_start/end` events and notify the user
- Set compaction thresholds via `SettingsManager`
- Session TTL — auto-reset stale conversations after N hours
- Surface session resumption status to users on startup

---

### 9. Permissions and Access Control

Add role-based or user-based access control for bot interactions.

**Implementation:**
- Config: allowed role IDs, admin user IDs
- Check `message.member.roles` before processing
- Slash command permissions via `setDefaultMemberPermissions()`
- Rate limiting per user to prevent API cost runaway

---

### 10. Rich Embeds for Structured Output

Detect structured output patterns (code blocks, errors, tool results) and render them using Discord embeds. Embeds support up to 6000 characters with colored sidebars, titles, and footers.

**Ideas:**
- Wrap code blocks in embed code fields
- Use embed color for success (green) vs. error (red)
- Show tool execution summaries in embed footers
- Use embed author field for model/thinking level info

---

### 11. Session Branching / Fork

Let users fork a conversation at a previous point, creating a branch without losing the original thread. Pi SDK has rich session tree support.

**UX:** Reply to an older bot message with `/fork` or a 🔀 button. Bot creates a new thread branched from that point.

**Surfaces:** `session.fork()`, `session.navigateTree()`, `SessionManager` tree API

---

### 12. Discord-Aware Pi Extensions & Custom Tools

Write a Pi extension giving the agent awareness of Discord-specific capabilities. Register custom tools the agent can invoke proactively.

**Possible tools:**
- `discord_react` — add a reaction to a message
- `discord_reply` — reply to a specific earlier message
- `discord_pin` — pin an important message
- `discord_create_thread` — start a new thread
- `discord_summarize_channel` — summarize recent channel history

**Surfaces:** `extensionFactories` on `DefaultResourceLoader`, `pi.registerTool()`, `pi.on()` event hooks

---

## Priority

| Priority | Idea | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | 2. Custom system prompt | Small | Big quality-of-life improvement for all responses |
| 🔴 High | 1. Image input | Small | Unlocks a whole input modality already supported by Pi |
| 🟡 Medium | 6. Streaming preview improvements | Small | Polish |
| 🟡 Medium | 3. Thread-per-conversation | Medium | Much better multi-user channel experience |
| 🟡 Medium | 7. File attachments for long output | Small | Cleaner output for verbose responses |
| 🟡 Medium | 8. Compaction awareness | Small | Robustness for long conversations |
| 🟠 Lower | 4. Button interactions | Medium | Nice UX but not essential |
| 🟠 Lower | 5. Model/thinking controls | Medium | Power-user feature |
| 🟠 Lower | 9. Permissions | Medium | Important for shared guilds |
| 🟠 Lower | 10. Rich embeds | Medium | Visual polish |
| 🔵 Ambitious | 11. Session branching/fork | Large | Unique capability, complex UX |
| 🔵 Ambitious | 12. Discord extensions & custom tools | Large | Gives the agent agency over Discord itself |
