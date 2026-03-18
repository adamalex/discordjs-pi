import {
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
} from "discord.js";
import type { Logger } from "./logger.js";

/**
 * Slash command definitions for the bot.
 */

export const statusCommand = new SlashCommandBuilder()
  .setName("status")
  .setDescription("Show bot uptime, model info, and active sessions");

export const resetCommand = new SlashCommandBuilder()
  .setName("reset")
  .setDescription("Reset the conversation in this channel/DM");

export const resetAllCommand = new SlashCommandBuilder()
  .setName("reset-all")
  .setDescription("Reset ALL conversations and session state (admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export const helpCommand = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show what this bot can do");

export const allCommands = [statusCommand, resetCommand, resetAllCommand, helpCommand];

/**
 * Clear all guild-scoped slash commands (to remove duplicates with global commands).
 */
export async function clearGuildCommands(
  clientId: string,
  guildId: string,
  token: string,
  logger: Logger,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);

  try {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [],
    });
    logger.info(`Cleared guild-scoped slash commands for guild ${guildId}`);
  } catch (error) {
    logger.error("Failed to clear guild slash commands", {
      guildId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Register slash commands as global commands (for DMs).
 */
export async function registerGlobalCommands(
  clientId: string,
  token: string,
  logger: Logger,
): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  const commandData = allCommands.map((cmd) => cmd.toJSON());

  try {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandData,
    });
    logger.info(`Registered ${commandData.length} global slash commands`);
  } catch (error) {
    logger.error("Failed to register global slash commands", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const HELP_TEXT = [
  "**Pi Bot** — AI assistant powered by Pi",
  "",
  "Just send a message (text, images, or both) and I'll respond.",
  "If you explicitly ask me to attach an existing local project file, I can send it as a Discord attachment.",
  "",
  "**Commands:**",
  "• `/status` — Bot uptime, model info, active sessions",
  "• `/reset` — Reset the conversation in this channel/DM",
  "• `/reset-all` — Reset all conversations (admin only)",
  "• `/help` — Show this message",
].join("\n");
