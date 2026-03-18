import { describe, expect, it } from "vitest";
import { buildStreamingPreview, splitDiscordMessage } from "../src/text.js";

describe("splitDiscordMessage", () => {
  it("returns one chunk when under the Discord limit", () => {
    expect(splitDiscordMessage("hello")).toEqual(["hello"]);
  });

  it("splits long messages into multiple chunks", () => {
    const input = `${"a".repeat(1995)} ${"b".repeat(30)}`;
    const chunks = splitDiscordMessage(input);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ")).toContain("b".repeat(30));
    expect(chunks.every((chunk) => chunk.length <= 2000)).toBe(true);
  });
});

describe("buildStreamingPreview", () => {
  it("uses a thinking placeholder when empty", () => {
    expect(buildStreamingPreview("")).toBe("_Thinking..._");
  });

  it("clips previews that exceed the Discord limit", () => {
    const preview = buildStreamingPreview("a".repeat(2500));
    expect(preview.length).toBeLessThanOrEqual(2000);
    expect(preview.startsWith("...")).toBe(true);
  });
});
