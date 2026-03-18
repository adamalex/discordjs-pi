import type { Message } from "discord.js";

export type DmCommand = "status" | "reset-all";

export function isDmMessage(message: Message<boolean>): boolean {
  return message.guildId === null;
}

export function parseDmCommand(content: string): DmCommand | null {
  const normalized = content.trim().toLowerCase();

  if (normalized === "!status") {
    return "status";
  }

  if (normalized === "!reset-all") {
    return "reset-all";
  }

  return null;
}

export function deriveConversationKey(message: Message<boolean>): string {
  if (isDmMessage(message)) {
    return `dm:${message.channelId}`;
  }

  if (message.channel.isThread()) {
    return `thread:${message.guildId}:${message.channelId}`;
  }

  return `channel:${message.guildId}:${message.channelId}`;
}

export function formatPromptInput(message: Message<boolean>): string {
  const authorName =
    message.member?.displayName ?? message.author.globalName ?? message.author.username;
  const location = describeLocation(message);

  return [
    "Discord message received.",
    `Author: ${authorName} (@${message.author.username}, id ${message.author.id})`,
    `Location: ${location}`,
    "",
    message.content.trim(),
  ].join("\n");
}

function describeLocation(message: Message<boolean>): string {
  if (isDmMessage(message)) {
    return `DM channel ${message.channelId}`;
  }

  if (message.channel.isThread()) {
    return `${message.guild?.name ?? message.guildId} / thread ${message.channel.name}`;
  }

  if ("name" in message.channel && typeof message.channel.name === "string") {
    return `${message.guild?.name ?? message.guildId} / #${message.channel.name}`;
  }

  return `${message.guild?.name ?? message.guildId} / channel ${message.channelId}`;
}
