import type { DocumentFormat, ExtractedFact } from '../shared/schemas.js';

/** Why a single document could not be processed. Reported per document, never as a request failure. */
export type DocumentErrorCode = 'UNSUPPORTED_TYPE' | 'SIGNATURE_MISMATCH' | 'EMPTY_FILE' | 'UNREADABLE';

export class DocumentError extends Error {
  constructor(
    public readonly code: DocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

/** The pipeline's input: a file held in memory. */
export interface UploadedFile {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface PipelineOptions {
  maxCharsPerDoc: number;
  chunkSize: number;
}

/** A slice of a document's normalised text, with character offsets for provenance. */
export interface TextChunk {
  index: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

/** Turns raw file bytes into plain text. One per supported format. */
export type Extractor = (buffer: Buffer) => Promise<string>;

interface DocumentBase {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ParsedDocument extends DocumentBase {
  status: 'parsed';
  format: DocumentFormat;
  text: string;
  charCount: number; // length before truncation
  truncated: boolean;
  chunks: TextChunk[];
  facts: ExtractedFact[];
}

export interface RejectedDocument extends DocumentBase {
  status: 'rejected' | 'failed'; // rejected = failed validation, failed = could not be read
  format: DocumentFormat | null;
  errorCode: DocumentErrorCode;
  errorMessage: string;
}

export type ProcessedDocument = ParsedDocument | RejectedDocument;
