import { DocumentError } from './types.js';

/** Cleans extracted text into a predictable shape. Throws if nothing readable is left. */
export function normalizeText(raw: string): string {
  const text = raw
    .replace(/\r\n?/g, '\n') // unify line endings
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '') // drop control chars (keep \t and \n)
    .replace(/[ \t]+/g, ' ') // collapse horizontal whitespace
    .replace(/ *\n */g, '\n') // trim around line breaks
    .replace(/\n{3,}/g, '\n\n') // at most one blank line
    .trim();

  if (text.length === 0) {
    throw new DocumentError('UNREADABLE', 'No readable text found (scanned or image-only documents are not supported).');
  }
  return text;
}
