import path from "node:path";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const logLevels = ["debug", "info", "warn", "error"] as const;

const envSchema = z
  .object({
    DISCORD_TOKEN: z.string().min(1, "DISCORD_TOKEN is required"),
    BOT_PROVIDER: z.string().min(1, "BOT_PROVIDER is required"),
    BOT_MODEL: z.string().min(1, "BOT_MODEL is required"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    LOG_LEVEL: z.enum(logLevels).default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.BOT_PROVIDER === "openai" && !env.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OPENAI_API_KEY is required when BOT_PROVIDER=openai",
        path: ["OPENAI_API_KEY"],
      });
    }

    if (env.BOT_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ANTHROPIC_API_KEY is required when BOT_PROVIDER=anthropic",
        path: ["ANTHROPIC_API_KEY"],
      });
    }
  });

export type LogLevel = (typeof logLevels)[number];

export interface AppConfig {
  discordToken: string;
  botProvider: string;
  botModel: string;
  openAiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  logLevel: LogLevel;
  projectRoot: string;
  sessionRootDir: string;
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const env = parsed.data;
  const projectRoot = process.cwd();

  return {
    discordToken: env.DISCORD_TOKEN,
    botProvider: env.BOT_PROVIDER,
    botModel: env.BOT_MODEL,
    openAiApiKey: env.OPENAI_API_KEY,
    anthropicApiKey: env.ANTHROPIC_API_KEY,
    logLevel: env.LOG_LEVEL,
    projectRoot,
    sessionRootDir: path.join(projectRoot, ".data", "pi-sessions"),
  };
}
