# Discord–Pi Bot: Consolidated Ideas

## Current State

The bot is a message-based Discord↔Pi bridge: it receives Discord messages, forwards them as prompts to persistent Pi agent sessions (one per conversation key), streams text deltas back, and splits long responses across multiple Discord messages. It supports DMs, guild channels, threads, and image uploads from Discord attachments.

Discord slash commands (`/status`, `/reset`, `/reset-all`, `/help`) provide discoverable interaction UX. Per-conversation reset is supported, `/reset-all` is admin-only, and conversations are persisted on disk. The bot also includes a Discord-specific system prompt appendix via Pi's `DefaultResourceLoader`, so responses are already nudged toward concise, Discord-friendly behavior.

Streaming polish is partly in place: a `_Thinking..._` placeholder is shown before text arrives, temporary code fences are closed so partial code blocks render correctly while streaming, and follow-up prompts are queued per conversation. The bot can also resume a conversation after self-deploy and announce that it has restarted.

The largest remaining capability gaps are: better long-output UX, richer Discord-native interactions, more session/admin controls, and optional Discord-aware Pi extensions or tools. Tool execution display infrastructure exists in the runtime codepath but is currently disabled.

---

## Ideas

### 1. File Attachment Responses

When Pi produces very large outputs, attach them as files rather than splitting across many Discord messages. A long answer split into many chunks is noisy.

**Implementation:** detect when `splitDiscordMessage()` would produce more than N chunks; attach the full text as a `.md` or `.txt` file via `channel.send({ files: [...] })`.

---

### 2. Thread-per-Conversation Mode

The bot already works inside threads, but it does not automatically create them. When the bot receives a message in a regular guild channel, it could create a thread for the conversation instead of replying inline.

**Why:** long agent conversations clutter channels; threads keep them contained.

**Surfaces:** `message.startThread()`, `ThreadChannel`

---

### 3. Button-Based Interactions

Add interactive buttons for common actions on bot responses to reduce friction.

**Possible buttons:**
- 🔄 **Retry** — re-prompt the same input
- 🗑️ **Reset** — reset this conversation
- 📋 **Compact** — trigger compaction when context is long
- ⏹️ **Stop** — abort a long-running response mid-stream

**Surfaces:** `ButtonBuilder`, `ActionRowBuilder`, `session.abort()`, `session.compact()`

---

### 4. Multi-Model / Thinking Level Controls

Let users or admins switch models or thinking levels per conversation.

**UX options:**
- Slash command with autocomplete from `modelRegistry.getAvailable()`
- Slash command `/thinking low|medium|high|off`
- Buttons on responses to cycle thinking level

**Surfaces:** `session.setModel()`, `session.cycleModel()`, `session.cycleThinkingLevel()`

---

### 5. Streaming Preview Improvements ⚠️ Partially implemented

The bot already shows a thinking placeholder and closes unbalanced code fences during streaming, but preview quality can still be improved. It currently clips from the tail when content exceeds Discord's limit, which can break context mid-word or mid-thought.

**Remaining ideas:**
- Distinguish "waiting for first token" from "model is using extended thinking"
- Split previews at cleaner boundaries (paragraph, line, sentence)
- Preserve more useful context than simple tail clipping
- Consider a better preview strategy for long code outputs

---

### 6. Tool Execution Visibility ⚠️ Infrastructure exists, display disabled

The runtime already has helper code for compact tool summaries, but `tool_execution_start` / `tool_execution_end` handling is currently disabled.

**Ideas:**
- Re-enable concise tool activity lines during streaming
- Show only high-signal summaries (tool name + short path/command)
- Hide noisy or repetitive tool chatter by default
- Optionally move tool summaries into embeds or a collapsible-style footer pattern

---

### 7. Compaction & Session Lifecycle

Improve session lifecycle management for long-running conversations.

**Ideas:**
- Listen for `auto_compaction_start/end` events and notify the user
- Set compaction thresholds via `SettingsManager`
- Session TTL — auto-reset stale conversations after N hours
- Better user-facing messaging when a persisted session is resumed

---

### 8. Permissions and Access Control ⚠️ Partially implemented

Some permission handling already exists (`/reset-all` is admin-only), but broader access control is still missing.

**Possible additions:**
- Config for allowed role IDs and admin user IDs
- Check `message.member.roles` before processing normal prompts
- More granular slash command permissions
- Rate limiting per user to prevent abuse or runaway cost

---

### 9. Rich Embeds for Structured Output

Detect structured output patterns and render them using Discord embeds where appropriate.

**Ideas:**
- Wrap concise status/error summaries in embeds
- Use embed color for success vs. error
- Show tool execution summaries in embed footers if tool visibility is re-enabled
- Use embed author/footer fields for model or session metadata

**Note:** full assistant replies should probably remain plain text unless there is a clear formatting win.

---

### 10. Session Branching / Fork

Let users fork a conversation at a previous point, creating a branch without losing the original thread.

**UX:** reply to an older bot message with `/fork` or a 🔀 button. The bot creates a new thread branched from that point.

**Surfaces:** `session.fork()`, `session.navigateTree()`, `SessionManager` tree API

---

### 11. Discord-Aware Pi Extensions & Custom Tools

Write a Pi extension that gives the agent awareness of Discord-specific capabilities, and register custom tools the agent can invoke proactively.

**Possible tools:**
- `discord_react` — add a reaction to a message
- `discord_reply` — reply to a specific earlier message
- `discord_pin` — pin an important message
- `discord_create_thread` — start a new thread
- `discord_summarize_channel` — summarize recent channel history

**Surfaces:** `extensionFactories` on `DefaultResourceLoader`, `pi.registerTool()`, `pi.on()` event hooks

---

### 12. Image Input Follow-Ups ✅ Core support implemented

The bot already accepts image attachments and forwards them to Pi for multimodal prompts.

**Useful follow-ups:**
- Support more image sources beyond direct attachments
- Improve validation, error reporting, and size-limit UX
- Better handling for mixed text + multiple-image prompts
- Surface clearer feedback when an attachment is skipped

---

## Priority

| Priority | Idea | Effort | Impact |
|----------|------|--------|--------|
| 🔴 High | 1. File attachment responses | Small | Big UX improvement for long outputs |
| 🔴 High | 8. Permissions and rate limiting | Medium | Important for shared guilds and cost control |
| 🟡 Medium | 2. Thread-per-conversation | Medium | Much better multi-user channel experience |
| 🟡 Medium | 7. Compaction & session lifecycle | Small | Robustness for long conversations |
| 🟡 Medium | 5. Streaming preview follow-ups | Small | Noticeable polish on every response |
| 🟡 Medium | 6. Tool execution visibility | Small | Helpful transparency with relatively low implementation cost |
| 🟠 Lower | 3. Button interactions | Medium | Nice UX but not essential |
| 🟠 Lower | 4. Model/thinking controls | Medium | Power-user feature |
| 🟠 Lower | 9. Rich embeds | Medium | Visual polish / selective structure |
| 🟠 Lower | 12. Image input follow-ups | Small | Multimodal polish rather than a missing feature |
| 🔵 Ambitious | 10. Session branching/fork | Large | Unique capability, complex UX |
| 🔵 Ambitious | 11. Discord extensions & custom tools | Large | Gives the agent agency over Discord itself |
