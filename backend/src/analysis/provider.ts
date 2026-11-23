import type { ParsedDocument } from '../pipeline/types.js';
import type { ExtractedFact, PerDocumentResult } from '../shared/schemas.js';

/** Step 1: one document, analysed on its own. */
export interface DocumentAnalysisInput {
  prompt: string;
  document: ParsedDocument;
}

/**
 * Step 2: all documents together. Receives only structured per-document results and
 * extracted facts — never the raw merged text — so document boundaries are preserved
 * and the input size stays bounded regardless of document length.
 */
export interface SynthesisInput {
  prompt: string;
  documents: { id: string; name: string }[];
  perDocument: PerDocumentResult[];
  facts: ExtractedFact[];
}

/**
 * Any AI backend (mock, OpenAI, Anthropic, ...) implements this interface.
 * Outputs are `unknown` on purpose: whatever a provider returns is validated
 * against the zod schemas before it is used.
 */
export interface LlmProvider {
  readonly name: string;
  analyzeDocument(input: DocumentAnalysisInput): Promise<unknown>;
  synthesize(input: SynthesisInput): Promise<unknown>;
}
