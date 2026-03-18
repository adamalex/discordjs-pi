import { describe, expect, it } from "vitest";
import { deriveConversationKey, deriveInteractionConversationKey } from "../src/discord-routing.js";

describe("deriveConversationKey", () => {
  it("builds a DM-scoped key", () => {
    const message = {
      guildId: null,
      channelId: "dm-1",
      channel: { isThread: () => false },
    };

    expect(deriveConversationKey(message as never)).toBe("dm:dm-1");
  });

  it("builds a guild channel key", () => {
    const message = {
      guildId: "guild-1",
      channelId: "channel-1",
      channel: { isThread: () => false },
    };

    expect(deriveConversationKey(message as never)).toBe("channel:guild-1:channel-1");
  });

  it("builds a thread key", () => {
    const message = {
      guildId: "guild-1",
      channelId: "thread-1",
      channel: { isThread: () => true },
    };

    expect(deriveConversationKey(message as never)).toBe("thread:guild-1:thread-1");
  });
});

describe("deriveInteractionConversationKey", () => {
  it("builds a DM key when no guild", () => {
    const interaction = {
      guildId: null,
      channelId: "dm-1",
      channel: null,
    };

    expect(deriveInteractionConversationKey(interaction as never)).toBe("dm:dm-1");
  });

  it("builds a guild channel key", () => {
    const interaction = {
      guildId: "guild-1",
      channelId: "channel-1",
      channel: { isThread: () => false },
    };

    expect(deriveInteractionConversationKey(interaction as never)).toBe("channel:guild-1:channel-1");
  });

  it("builds a thread key", () => {
    const interaction = {
      guildId: "guild-1",
      channelId: "thread-1",
      channel: { isThread: () => true },
    };

    expect(deriveInteractionConversationKey(interaction as never)).toBe("thread:guild-1:thread-1");
  });
});
