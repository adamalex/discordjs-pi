const DISCORD_MESSAGE_LIMIT = 2000;

export function buildStreamingPreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "_Thinking..._";
  }

  if (trimmed.length <= DISCORD_MESSAGE_LIMIT) {
    return trimmed;
  }

  return `...${trimmed.slice(-(DISCORD_MESSAGE_LIMIT - 3))}`;
}

export function splitDiscordMessage(text: string): string[] {
  const normalized = text.trim();
  if (!normalized) {
    return ["_No text response produced._"];
  }

  if (normalized.length <= DISCORD_MESSAGE_LIMIT) {
    return [normalized];
  }

  const chunks: string[] = [];
  let remaining = normalized;

  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    const slice = remaining.slice(0, DISCORD_MESSAGE_LIMIT);
    const splitAt = findSplitPoint(slice);
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks.filter(Boolean);
}

function findSplitPoint(slice: string): number {
  const candidates = ["\n\n", "\n", " "];
  for (const candidate of candidates) {
    const index = slice.lastIndexOf(candidate);
    if (index >= 0) {
      return index + candidate.length;
    }
  }

  return slice.length;
}
