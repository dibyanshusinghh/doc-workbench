import { z } from 'zod';

/**
 * The API response contract. Every AnalysisResult is validated against these
 * schemas before it is stored or returned, whichever AI provider produced it.
 */

export const documentFormatSchema = z.enum(['pdf', 'txt', 'csv']);
export const documentStatusSchema = z.enum(['parsed', 'rejected', 'failed']);
export const factKindSchema = z.enum(['field', 'date', 'money', 'identifier']);
export const severitySchema = z.enum(['low', 'medium', 'high']);

/** Points a finding back to the document (and optionally the fact) it came from. */
export const sourceRefSchema = z.object({
  documentId: z.string(),
  factId: z.string().optional(),
  snippet: z.string().optional(),
});

/** A value pulled from a document by deterministic rules — not AI. */
export const extractedFactSchema = z.object({
  id: z.string(),
  documentId: z.string(),
  key: z.string(),
  value: z.string(),
  normalizedValue: z.string(),
  kind: factKindSchema,
  location: z.object({
    chunkIndex: z.number().int().nonnegative(),
    startOffset: z.number().int().nonnegative(),
  }),
  snippet: z.string(),
  origin: z.literal('extracted'),
});

/** An AI-generated interpretation. Must cite at least one source. */
export const findingSchema = z.object({
  id: z.string(),
  type: z.enum(['discrepancy', 'missing_information', 'insight']),
  title: z.string(),
  detail: z.string(),
  severity: severitySchema,
  confidence: z.number().min(0).max(1),
  sources: z.array(sourceRefSchema).min(1),
  origin: z.literal('ai_interpretation'),
});

export const comparisonRowSchema = z.object({
  field: z.string(),
  status: z.enum(['match', 'mismatch', 'partial']),
  values: z.array(
    z.object({
      documentId: z.string(),
      value: z.string().nullable(),
      factId: z.string().optional(),
    }),
  ),
});

export const documentSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  format: documentFormatSchema.nullable(),
  status: documentStatusSchema,
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  charCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export const perDocumentResultSchema = z.object({
  documentId: z.string(),
  summary: z.string(),
  factIds: z.array(z.string()),
});

export const crossDocumentResultSchema = z.object({
  summary: z.string(),
  comparison: z.array(comparisonRowSchema),
  discrepancies: z.array(findingSchema),
  missingInformation: z.array(findingSchema),
});

export const analysisResultSchema = z.object({
  analysisId: z.string(),
  prompt: z.string(),
  createdAt: z.string(),
  documents: z.array(documentSummarySchema),
  facts: z.array(extractedFactSchema),
  perDocument: z.array(perDocumentResultSchema),
  crossDocument: crossDocumentResultSchema,
  meta: z.object({
    provider: z.string(),
    warnings: z.array(z.string()),
  }),
});

export type DocumentFormat = z.infer<typeof documentFormatSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
export type FactKind = z.infer<typeof factKindSchema>;
export type SourceRef = z.infer<typeof sourceRefSchema>;
export type ExtractedFact = z.infer<typeof extractedFactSchema>;
export type Finding = z.infer<typeof findingSchema>;
export type ComparisonRow = z.infer<typeof comparisonRowSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type PerDocumentResult = z.infer<typeof perDocumentResultSchema>;
export type CrossDocumentResult = z.infer<typeof crossDocumentResultSchema>;
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
