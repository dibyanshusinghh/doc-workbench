import { createHash, randomUUID } from 'node:crypto';
import type { DocumentFormat } from '../shared/schemas.js';
import { chunkText, truncateText } from './chunk.js';
import { extractors } from './extractors/index.js';
import { extractFacts } from './facts.js';
import { normalizeText } from './normalize.js';
import {
  DocumentError,
  type PipelineOptions,
  type ProcessedDocument,
  type RejectedDocument,
  type UploadedFile,
} from './types.js';
import { sanitizeFilename, validateFile } from './validate.js';

/**
 * Runs one file through the pipeline:
 *   validate → extract → normalise → truncate → chunk → extract facts
 * Never throws for a bad document. Problems come back as a rejected/failed result,
 * so one bad file does not stop the others.
 */
export async function processDocument(file: UploadedFile, options: PipelineOptions): Promise<ProcessedDocument> {
  const base = {
    id: randomUUID(),
    name: sanitizeFilename(file.originalName),
    mimeType: file.mimeType,
    sizeBytes: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
  };

  let format: DocumentFormat;
  try {
    format = validateFile(file);
  } catch (err) {
    return { ...base, ...toFailure(err), status: 'rejected', format: null };
  }

  try {
    const normalized = normalizeText(await extractors[format](file.buffer));
    const { text, truncated } = truncateText(normalized, options.maxCharsPerDoc);
    const chunks = chunkText(text, options.chunkSize);
    const facts = extractFacts(base.id, chunks);

    return { ...base, status: 'parsed', format, text, charCount: normalized.length, truncated, chunks, facts };
  } catch (err) {
    return { ...base, ...toFailure(err), status: 'failed', format };
  }
}

function toFailure(err: unknown): Pick<RejectedDocument, 'errorCode' | 'errorMessage'> {
  if (err instanceof DocumentError) {
    return { errorCode: err.code, errorMessage: err.message };
  }
  console.error('Unexpected document processing error:', err);
  return { errorCode: 'UNREADABLE', errorMessage: 'The document could not be processed.' };
}
