import type { DocumentSummary } from '../types';

export interface DocumentRef {
  label: string; // short reference such as "D1"
  name: string;
}

/** documentId → { label, name }. Used to show which document supports each finding. */
export type DocumentIndex = Map<string, DocumentRef>;

export function buildDocumentIndex(documents: DocumentSummary[]): DocumentIndex {
  return new Map(documents.map((doc, i) => [doc.id, { label: `D${i + 1}`, name: doc.name }]));
}

export function refOf(index: DocumentIndex, documentId: string): DocumentRef {
  return index.get(documentId) ?? { label: '?', name: 'Unknown document' };
}
