/**
 * API response types. These mirror backend/src/shared/schemas.ts (the source of truth).
 * Kept as a plain copy to avoid a shared package for a small project.
 */

export type DocumentFormat = 'pdf' | 'txt' | 'csv';
export type DocumentStatus = 'parsed' | 'rejected' | 'failed';
export type FactKind = 'field' | 'date' | 'money' | 'identifier';
export type Severity = 'low' | 'medium' | 'high';

export interface SourceRef {
  documentId: string;
  factId?: string;
  snippet?: string;
}

/** Deterministically extracted from a document (not AI). */
export interface ExtractedFact {
  id: string;
  documentId: string;
  key: string;
  value: string;
  normalizedValue: string;
  kind: FactKind;
  location: { chunkIndex: number; startOffset: number };
  snippet: string;
  origin: 'extracted';
}

/** AI-generated interpretation. */
export interface Finding {
  id: string;
  type: 'discrepancy' | 'missing_information' | 'insight';
  title: string;
  detail: string;
  severity: Severity;
  confidence: number;
  sources: SourceRef[];
  origin: 'ai_interpretation';
}

export interface ComparisonRow {
  field: string;
  status: 'match' | 'mismatch' | 'partial';
  values: { documentId: string; value: string | null; factId?: string }[];
}

export interface DocumentSummary {
  id: string;
  name: string;
  format: DocumentFormat | null;
  status: DocumentStatus;
  errorCode?: string;
  errorMessage?: string;
  charCount: number;
  truncated: boolean;
}

export interface PerDocumentResult {
  documentId: string;
  summary: string;
  factIds: string[];
}

export interface AnalysisResult {
  analysisId: string;
  prompt: string;
  createdAt: string;
  documents: DocumentSummary[];
  facts: ExtractedFact[];
  perDocument: PerDocumentResult[];
  crossDocument: {
    summary: string;
    comparison: ComparisonRow[];
    discrepancies: Finding[];
    missingInformation: Finding[];
  };
  meta: { provider: string; warnings: string[] };
}
