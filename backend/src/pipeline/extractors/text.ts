import { DocumentError, type Extractor } from '../types.js';

const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

/** Decodes bytes as strict UTF-8. Invalid byte sequences mean the file is unreadable. */
export function decodeUtf8(buffer: Buffer): string {
  try {
    return utf8Decoder.decode(buffer);
  } catch {
    throw new DocumentError('UNREADABLE', 'The file is not valid UTF-8 text.');
  }
}

export const extractText: Extractor = async (buffer) => decodeUtf8(buffer);
