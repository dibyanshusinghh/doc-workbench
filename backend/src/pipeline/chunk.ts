import type { TextChunk } from './types.js';

/** Caps document length so one huge file cannot dominate memory or AI context. */
export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: text.slice(0, maxChars), truncated: true };
}

/**
 * Splits text into chunks of at most `chunkSize` characters, preferring to break at a newline.
 * Offsets point into the full normalised text, so any fact can be traced to its position.
 */
export function chunkText(text: string, chunkSize: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Break at the last newline in the window, unless it would make the chunk too small.
    if (end < text.length) {
      const lastNewline = text.lastIndexOf('\n', end);
      if (lastNewline > start + chunkSize / 2) end = lastNewline + 1;
    }

    chunks.push({ index: chunks.length, startOffset: start, endOffset: end, text: text.slice(start, end) });
    start = end;
  }

  return chunks;
}
