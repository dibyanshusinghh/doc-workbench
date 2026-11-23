import { readFileSync } from 'node:fs';
import { extname } from 'node:path';
import type { PipelineOptions, UploadedFile } from '../src/pipeline/types.js';

const SAMPLES_DIR = new URL('../../samples/', import.meta.url);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.png': 'image/png',
};

export const pipelineOptions: PipelineOptions = { maxCharsPerDoc: 100_000, chunkSize: 4000 };

export function mimeFor(name: string): string {
  return MIME_BY_EXTENSION[extname(name)] ?? 'application/octet-stream';
}

/** Loads a file from /samples as a pipeline input, e.g. sampleFile('invalid/empty.txt'). */
export function sampleFile(relativePath: string): UploadedFile {
  return {
    originalName: relativePath.split('/').pop()!,
    mimeType: mimeFor(relativePath),
    buffer: readFileSync(new URL(relativePath, SAMPLES_DIR)),
  };
}

/** Builds an in-memory text file for focused tests. */
export function textFile(name: string, content: string): UploadedFile {
  return { originalName: name, mimeType: mimeFor(name), buffer: Buffer.from(content, 'utf8') };
}
