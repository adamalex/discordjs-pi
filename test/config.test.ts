import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const originalEnv = { ...process.env };

function resetEnv(overrides: Record<string, string | undefined>): void {
  process.env = { ...originalEnv };

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("loadConfig", () => {
  it("allows openai-codex without OPENAI_API_KEY", () => {
    resetEnv({
      DISCORD_TOKEN: "discord-token",
      BOT_PROVIDER: "openai-codex",
      BOT_MODEL: "gpt-5.4",
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      LOG_LEVEL: "info",
    });

    const config = loadConfig();

    expect(config.botProvider).toBe("openai-codex");
    expect(config.botModel).toBe("gpt-5.4");
    expect(config.openAiApiKey).toBeUndefined();
  });

  it("still requires OPENAI_API_KEY for the openai provider", () => {
    resetEnv({
      DISCORD_TOKEN: "discord-token",
      BOT_PROVIDER: "openai",
      BOT_MODEL: "gpt-5.4",
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      LOG_LEVEL: "info",
    });

    expect(() => loadConfig()).toThrow(
      "Invalid environment configuration: OPENAI_API_KEY is required when BOT_PROVIDER=openai",
    );
  });
});
