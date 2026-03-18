import { DiscordPiBot } from "./bot.js";
import { loadConfig } from "./config.js";
import { Logger } from "./logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.logLevel);
  const bot = await DiscordPiBot.create(config, logger);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down.`);
    await bot.shutdown();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.once("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  await bot.start();
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
