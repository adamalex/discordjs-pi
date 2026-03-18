import { describe, expect, it } from "vitest";
import { buildStreamingPreview, splitDiscordMessage } from "../src/text.js";

const SAFE_DISCORD_LIMIT = 1900;

describe("splitDiscordMessage", () => {
  it("returns one chunk when under the Discord limit", () => {
    expect(splitDiscordMessage("hello")).toEqual(["hello"]);
  });

  it("splits long messages into multiple chunks", () => {
    const input = `${"a".repeat(1895)} ${"b".repeat(30)}`;
    const chunks = splitDiscordMessage(input);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("b".repeat(30));
    expect(chunks.every((chunk) => chunk.length <= SAFE_DISCORD_LIMIT)).toBe(true);
  });
});

describe("buildStreamingPreview", () => {
  it("uses a thinking placeholder when empty", () => {
    expect(buildStreamingPreview("")).toBe("_Thinking..._");
  });

  it("clips previews that exceed the Discord limit", () => {
    const preview = buildStreamingPreview("a".repeat(2500));
    expect(preview.length).toBeLessThanOrEqual(SAFE_DISCORD_LIMIT);
    expect(preview.startsWith("...")).toBe(true);
  });

  it("keeps code-fence-balanced previews under the safe limit", () => {
    const preview = buildStreamingPreview(`${"x".repeat(100)}\n\`\`\`ts\n${"a".repeat(1890)}`);
    expect(preview.length).toBeLessThanOrEqual(SAFE_DISCORD_LIMIT);
    expect(preview.endsWith("\n\`\`\`")).toBe(true);
  });
});
