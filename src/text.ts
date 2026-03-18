// Keep a safety margin below Discord's 2000-character hard limit so
// streaming previews and formatting adjustments do not overflow edits.
const DISCORD_MESSAGE_LIMIT = 1900;

export function buildStreamingPreview(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "_Thinking..._";
  }

  let preview =
    trimmed.length <= DISCORD_MESSAGE_LIMIT
      ? trimmed
      : `...${trimmed.slice(-(DISCORD_MESSAGE_LIMIT - 3))}`;

  // If there's an unclosed code fence, append a closing one so Discord
  // renders the block properly during streaming.
  if (hasUnclosedCodeFence(preview)) {
    const closingFence = "\n```";
    const maxBaseLength = DISCORD_MESSAGE_LIMIT - closingFence.length;
    preview = `${preview.slice(0, maxBaseLength).trimEnd()}${closingFence}`;
  }

  return preview;
}

function hasUnclosedCodeFence(text: string): boolean {
  // Count lines that start with ``` (opening or closing fences).
  // An odd count means there's an unclosed fence.
  const fenceCount = (text.match(/^```/gm) || []).length;
  return fenceCount % 2 === 1;
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
