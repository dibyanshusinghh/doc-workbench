import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ParsedDocument, ProcessedDocument } from '../pipeline/types.js';
import { AppError } from '../shared/errors.js';
import {
  crossDocumentResultSchema,
  perDocumentResultSchema,
  type AnalysisResult,
  type DocumentSummary,
} from '../shared/schemas.js';
import type { LlmProvider } from './provider.js';

/**
 * Orchestrates the AI analysis:
 *   1. analyse each parsed document independently
 *   2. synthesise across documents using only the structured step-1 results and facts
 *   3. validate the output (schema + provenance) before returning it
 */
export async function runAnalysis(
  prompt: string,
  documents: ProcessedDocument[],
  provider: LlmProvider,
): Promise<AnalysisResult> {
  const parsed = documents.filter((d): d is ParsedDocument => d.status === 'parsed');
  const facts = parsed.flatMap((d) => d.facts);

  const perDocument = await Promise.all(
    parsed.map(async (document) =>
      validateOutput(perDocumentResultSchema, await provider.analyzeDocument({ prompt, document }), 'document analysis'),
    ),
  );

  const crossDocument = validateOutput(
    crossDocumentResultSchema,
    await provider.synthesize({
      prompt,
      documents: parsed.map(({ id, name }) => ({ id, name })),
      perDocument,
      facts,
    }),
    'cross-document synthesis',
  );

  const result: AnalysisResult = {
    analysisId: randomUUID(),
    prompt,
    createdAt: new Date().toISOString(),
    documents: documents.map(toDocumentSummary),
    facts,
    perDocument,
    crossDocument,
    meta: { provider: provider.name, warnings: buildWarnings(documents) },
  };

  const provenanceErrors = findProvenanceErrors(result);
  if (provenanceErrors.length > 0) {
    console.error('AI output failed provenance check:', provenanceErrors);
    throw new AppError(502, 'AI_OUTPUT_INVALID', 'The AI response referenced unknown documents or facts.');
  }

  return result;
}

/**
 * Checks that every document and fact the AI cites actually exists, and that each
 * cited fact belongs to the cited document. Returns a list of problems (empty = valid).
 */
export function findProvenanceErrors(result: AnalysisResult): string[] {
  const parsedDocumentIds = new Set(result.documents.filter((d) => d.status === 'parsed').map((d) => d.id));
  const factOwner = new Map(result.facts.map((f) => [f.id, f.documentId]));
  const errors: string[] = [];

  const check = (where: string, documentId: string, factId?: string) => {
    if (!parsedDocumentIds.has(documentId)) {
      errors.push(`${where}: unknown document "${documentId}"`);
    }
    if (factId !== undefined && factOwner.get(factId) !== documentId) {
      errors.push(`${where}: fact "${factId}" does not belong to document "${documentId}"`);
    }
  };

  for (const entry of result.perDocument) {
    check('perDocument', entry.documentId);
    for (const factId of entry.factIds) check('perDocument', entry.documentId, factId);
  }
  for (const row of result.crossDocument.comparison) {
    for (const value of row.values) check(`comparison "${row.field}"`, value.documentId, value.factId);
  }
  for (const finding of [...result.crossDocument.discrepancies, ...result.crossDocument.missingInformation]) {
    for (const source of finding.sources) check(`finding "${finding.title}"`, source.documentId, source.factId);
  }

  return errors;
}

export function toDocumentSummary(doc: ProcessedDocument): DocumentSummary {
  const base = { id: doc.id, name: doc.name, format: doc.format, status: doc.status };
  if (doc.status === 'parsed') {
    return { ...base, charCount: doc.charCount, truncated: doc.truncated };
  }
  return { ...base, errorCode: doc.errorCode, errorMessage: doc.errorMessage, charCount: 0, truncated: false };
}

function validateOutput<T>(schema: z.ZodType<T>, output: unknown, step: string): T {
  const parsed = schema.safeParse(output);
  if (!parsed.success) {
    console.error(`AI ${step} output failed validation:\n${z.prettifyError(parsed.error)}`);
    throw new AppError(502, 'AI_OUTPUT_INVALID', 'The AI returned a response in an unexpected format.');
  }
  return parsed.data;
}

function buildWarnings(documents: ProcessedDocument[]): string[] {
  return documents.flatMap((doc) => {
    if (doc.status !== 'parsed') return [`${doc.name} was skipped: ${doc.errorMessage}`];
    if (doc.truncated) return [`${doc.name} was truncated; only the first part was analysed.`];
    return [];
  });
}
