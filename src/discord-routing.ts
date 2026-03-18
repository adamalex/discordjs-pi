import type { Message, Attachment } from "discord.js";
import type { ImageContent } from "@mariozechner/pi-ai";

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

  const imageAttachmentCount = message.attachments.filter(
    (a) => a.contentType !== null && a.contentType.startsWith("image/"),
  ).size;

  const lines = [
    "Discord message received.",
    `Author: ${authorName} (@${message.author.username}, id ${message.author.id})`,
    `Location: ${location}`,
  ];

  if (imageAttachmentCount > 0) {
    lines.push(`Attachments: ${imageAttachmentCount} image(s) (included inline below)`);
  }

  lines.push("", message.content.trim());

  return lines.join("\n");
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

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20 MB

/**
 * Detect the actual MIME type of an image from its magic bytes.
 * Falls back to the declared type if detection fails.
 */
function detectImageMimeType(buffer: Buffer, declaredType: string): string {
  // Check magic bytes (file signatures)
  if (buffer.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    // GIF: 47 49 46 38
    if (
      buffer[0] === 0x47 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x38
    ) {
      return "image/gif";
    }
    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.length >= 12 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return declaredType;
}

/**
 * Extract image attachments from a Discord message, download them,
 * and return them as base64-encoded ImageContent objects for the Pi SDK.
 */
export async function extractImages(message: Message<boolean>): Promise<ImageContent[]> {
  const imageAttachments = message.attachments.filter(
    (a): a is Attachment =>
      a.contentType !== null &&
      SUPPORTED_IMAGE_TYPES.has(a.contentType) &&
      (a.size ?? Infinity) <= MAX_IMAGE_SIZE,
  );

  if (imageAttachments.size === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    imageAttachments.map(async (attachment) => {
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download ${attachment.url}: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const actualMimeType = detectImageMimeType(buffer, attachment.contentType!);
      return {
        type: "image" as const,
        data: buffer.toString("base64"),
        mimeType: actualMimeType,
      };
    }),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<ImageContent> => r.status === "fulfilled")
    .map((r) => r.value);
}
