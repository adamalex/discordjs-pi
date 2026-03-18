import { describe, expect, it } from "vitest";
import { deriveConversationKey, parseDmCommand } from "../src/discord-routing.js";

describe("parseDmCommand", () => {
  it("matches the supported DM commands exactly", () => {
    expect(parseDmCommand("!status")).toBe("status");
    expect(parseDmCommand(" !reset-all ")).toBe("reset-all");
  });

  it("ignores non-command messages", () => {
    expect(parseDmCommand("!status please")).toBeNull();
    expect(parseDmCommand("hello")).toBeNull();
  });
});

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
