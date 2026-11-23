import { basename, extname } from 'node:path';
import type { DocumentFormat } from '../shared/schemas.js';
import { DocumentError, type UploadedFile } from './types.js';

const FORMAT_BY_EXTENSION: Record<string, DocumentFormat> = {
  '.pdf': 'pdf',
  '.txt': 'txt',
  '.csv': 'csv',
};

// The browser-supplied MIME type cannot be trusted, so it is only a first filter.
// "application/octet-stream" is allowed because many clients send it for any file.
const ALLOWED_MIME_TYPES: Record<DocumentFormat, string[]> = {
  pdf: ['application/pdf', 'application/octet-stream'],
  txt: ['text/plain', 'application/octet-stream'],
  csv: ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'],
};

const PDF_SIGNATURE = '%PDF-';
const TEXT_SNIFF_BYTES = 8 * 1024;

/** Makes a client-supplied filename safe to store and display. */
export function sanitizeFilename(name: string): string {
  const cleaned = basename(name)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 255);
  return cleaned || 'unnamed';
}

/**
 * Checks that a file is non-empty, has an allowed extension and MIME type, and that its
 * content matches the claimed format. Returns the detected format or throws DocumentError.
 */
export function validateFile(file: UploadedFile): DocumentFormat {
  if (file.buffer.length === 0) {
    throw new DocumentError('EMPTY_FILE', 'The file is empty.');
  }

  const extension = extname(file.originalName).toLowerCase();
  const format = FORMAT_BY_EXTENSION[extension];
  if (!format) {
    throw new DocumentError('UNSUPPORTED_TYPE', `Unsupported file type "${extension || 'none'}". Use PDF, TXT or CSV.`);
  }

  if (!ALLOWED_MIME_TYPES[format].includes(file.mimeType.toLowerCase())) {
    throw new DocumentError('UNSUPPORTED_TYPE', `MIME type "${file.mimeType}" does not match a ${format.toUpperCase()} file.`);
  }

  if (!contentMatchesFormat(file.buffer, format)) {
    throw new DocumentError('SIGNATURE_MISMATCH', `File content is not a valid ${format.toUpperCase()} file.`);
  }

  return format;
}

function contentMatchesFormat(buffer: Buffer, format: DocumentFormat): boolean {
  if (format === 'pdf') {
    return buffer.subarray(0, PDF_SIGNATURE.length).toString('latin1') === PDF_SIGNATURE;
  }
  // Text formats: a NUL byte near the start means the file is binary.
  return !buffer.subarray(0, TEXT_SNIFF_BYTES).includes(0);
}
