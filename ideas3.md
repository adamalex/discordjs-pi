# Discord–Pi Bot: Consolidated Ideas

## Current State

The bot is a message-based Discord↔Pi bridge: it receives Discord messages, forwards them as prompts to persistent Pi agent sessions (one per conversation key), streams text deltas back, and splits long responses across multiple Discord messages. It supports DMs, guild channels, threads, and image uploads from Discord attachments.

Discord slash commands (`/status`, `/reset`, `/reset-all`, `/help`) provide discoverable interaction UX. Per-conversation reset is supported, and `/reset-all` is admin-only. The bot includes basic streaming polish already: a `_Thinking..._` placeholder is shown before text arrives, and temporary code fences are closed so partial code blocks render correctly while streaming.

The largest remaining capability gaps are: Pi resource customization (system prompt overrides, extensions, custom tools), advanced Discord UX (thread automation, buttons, file/embedded responses), and advanced Pi session controls (compaction visibility, branching, model/thinking controls). Tool execution display exists in the runtime codepath but is currently disabled.

---

## Ideas

### 1. Image Input Follow-Ups ✅ Core support implemented

The bot already accepts image attachments and forwards them to Pi for multimodal prompts.

**Useful follow-ups:**
- Support more image sources beyond direct attachments
- Improve validation, error reporting, and size-limit UX
- Better handling for mixed text + multiple-image prompts
- Surface clearer feedback when an attachment is skipped

---

### 2. Custom System Prompt / Context Injection

Use `DefaultResourceLoader` with `systemPromptOverride` or `appendSystemPromptOverride` to inject Discord-specific behavior. The default Pi system prompt is still more CLI/coding-agent oriented than Discord-chat oriented.

**Useful injections:**
- "You are responding in Discord. Keep messages concise. Use Discord-friendly markdown."
- "The user's display name, username, and ID are provided at the top of each message."
- "In multi-user channels, address users by name when relevant."
- "Prefer concise summaries of tool activity in chat contexts."

---

### 3. Thread-per-Conversation Mode

The bot already works inside threads, but it does not automatically create them. When the bot receives a message in a regular guild channel, it could create a thread for the conversation instead of replying inline.

**Why:** long agent conversations clutter channels; threads keep them contained.

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

Let users or admins switch models or thinking levels per conversation.

**UX options:**
- Slash command with autocomplete from `modelRegistry.getAvailable()`
- Slash command `/thinking low|medium|high|off`
- Buttons on responses to cycle thinking level

**Surfaces:** `session.setModel()`, `session.cycleModel()`, `session.cycleThinkingLevel()`

---

### 6. Streaming Preview Improvements ⚠️ Partially implemented

The bot already shows a thinking placeholder and closes unbalanced code fences during streaming, but preview quality can still be improved. It currently clips from the tail when content exceeds Discord's limit, which can break context mid-word or mid-thought.

**Remaining ideas:**
- Distinguish "waiting for first token" from "model is using extended thinking"
- Split previews at cleaner boundaries (paragraph, line, sentence)
- Preserve more useful context than simple tail clipping
- Consider a better preview strategy for long code outputs

---

### 7. File Attachment Responses

When Pi produces very large outputs, attach them as files rather than splitting across many Discord messages. A long answer split into many chunks is noisy.

**Implementation:** detect when `splitDiscordMessage()` would produce more than N chunks; attach the full text as a `.md` or `.txt` file via `channel.send({ files: [...] })`.

---

### 8. Compaction & Session Lifecycle

Improve session lifecycle management for long-running conversations.

**Ideas:**
- Listen for `auto_compaction_start/end` events and notify the user
- Set compaction thresholds via `SettingsManager`
- Session TTL — auto-reset stale conversations after N hours
- Surface session resumption status to users on startup

---

### 9. Permissions and Access Control ⚠️ Partially implemented

Some permission handling already exists (`/reset-all` is admin-only), but broader access control is still missing.

**Possible additions:**
- Config for allowed role IDs and admin user IDs
- Check `message.member.roles` before processing normal prompts
- More granular slash command permissions
- Rate limiting per user to prevent abuse or runaway cost

---

### 10. Rich Embeds for Structured Output

Detect structured output patterns and render them using Discord embeds where appropriate.

**Ideas:**
- Wrap concise status/error summaries in embeds
- Use embed color for success vs. error
- Show tool execution summaries in embed footers if tool visibility is re-enabled
- Use embed author/footer fields for model or session metadata

**Note:** full assistant replies should probably remain plain text unless there is a clear formatting win.

---

### 11. Session Branching / Fork

Let users fork a conversation at a previous point, creating a branch without losing the original thread.

**UX:** reply to an older bot message with `/fork` or a 🔀 button. The bot creates a new thread branched from that point.

**Surfaces:** `session.fork()`, `session.navigateTree()`, `SessionManager` tree API

---

### 12. Discord-Aware Pi Extensions & Custom Tools

Write a Pi extension that gives the agent awareness of Discord-specific capabilities, and register custom tools the agent can invoke proactively.

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
| 🔴 High | 7. File attachment responses | Small | Big UX improvement for long outputs |
| 🟡 Medium | 3. Thread-per-conversation | Medium | Much better multi-user channel experience |
| 🟡 Medium | 8. Compaction & session lifecycle | Small | Robustness for long conversations |
| 🟡 Medium | 6. Streaming preview follow-ups | Small | Noticeable polish on every response |
| 🟡 Medium | 9. Permissions and rate limiting | Medium | Important for shared guilds and cost control |
| 🟠 Lower | 4. Button interactions | Medium | Nice UX but not essential |
| 🟠 Lower | 1. Image input follow-ups | Small | Multimodal polish rather than a missing feature |
| 🟠 Lower | 5. Model/thinking controls | Medium | Power-user feature |
| 🟠 Lower | 10. Rich embeds | Medium | Visual polish / selective structure |
| 🔵 Ambitious | 11. Session branching/fork | Large | Unique capability, complex UX |
| 🔵 Ambitious | 12. Discord extensions & custom tools | Large | Gives the agent agency over Discord itself |
