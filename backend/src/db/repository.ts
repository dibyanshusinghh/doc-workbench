import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { analysisResultSchema, type AnalysisResult, type DocumentSummary } from '../shared/schemas.js';

export interface StoredChunk {
  index: number;
  startOffset: number;
  endOffset: number;
  text: string;
}

/** Everything persisted about one uploaded file. The original file bytes are never stored. */
export interface StoredDocument {
  summary: DocumentSummary;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  chunks: StoredChunk[];
}

export interface NewAnalysis {
  result: AnalysisResult;
  documents: StoredDocument[];
}

export interface AnalysisRepository {
  saveAnalysis(analysis: NewAnalysis): void;
  getAnalysis(id: string): AnalysisResult | null;
}

export function createRepository(db: Database.Database): AnalysisRepository {
  const insertAnalysis = db.prepare(
    `INSERT INTO analyses (id, prompt, result_json, created_at)
     VALUES (@id, @prompt, @resultJson, @createdAt)`,
  );

  const insertDocument = db.prepare(
    `INSERT INTO documents (id, analysis_id, original_name, format, mime_type, size_bytes, sha256,
                            status, error_code, error_message, char_count, truncated, created_at)
     VALUES (@id, @analysisId, @name, @format, @mimeType, @sizeBytes, @sha256,
             @status, @errorCode, @errorMessage, @charCount, @truncated, @createdAt)`,
  );

  const insertChunk = db.prepare(
    `INSERT INTO document_chunks (id, document_id, chunk_index, start_offset, end_offset, text)
     VALUES (@id, @documentId, @index, @startOffset, @endOffset, @text)`,
  );

  const insertFact = db.prepare(
    `INSERT INTO facts (id, document_id, key, value, normalized_value, kind, chunk_index, start_offset, snippet)
     VALUES (@id, @documentId, @key, @value, @normalizedValue, @kind, @chunkIndex, @startOffset, @snippet)`,
  );

  const selectAnalysis = db.prepare('SELECT result_json FROM analyses WHERE id = ?');

  // All rows for one analysis are written in a single transaction: all or nothing.
  const saveAnalysis = db.transaction(({ result, documents }: NewAnalysis) => {
    insertAnalysis.run({
      id: result.analysisId,
      prompt: result.prompt,
      resultJson: JSON.stringify(result),
      createdAt: result.createdAt,
    });

    for (const doc of documents) {
      insertDocument.run({
        id: doc.summary.id,
        analysisId: result.analysisId,
        name: doc.summary.name,
        format: doc.summary.format,
        mimeType: doc.mimeType,
        sizeBytes: doc.sizeBytes,
        sha256: doc.sha256,
        status: doc.summary.status,
        errorCode: doc.summary.errorCode ?? null,
        errorMessage: doc.summary.errorMessage ?? null,
        charCount: doc.summary.charCount,
        truncated: doc.summary.truncated ? 1 : 0,
        createdAt: result.createdAt,
      });

      for (const chunk of doc.chunks) {
        insertChunk.run({ id: randomUUID(), documentId: doc.summary.id, ...chunk });
      }
    }

    for (const fact of result.facts) {
      insertFact.run({
        id: fact.id,
        documentId: fact.documentId,
        key: fact.key,
        value: fact.value,
        normalizedValue: fact.normalizedValue,
        kind: fact.kind,
        chunkIndex: fact.location.chunkIndex,
        startOffset: fact.location.startOffset,
        snippet: fact.snippet,
      });
    }
  });

  function getAnalysis(id: string): AnalysisResult | null {
    const row = selectAnalysis.get(id) as { result_json: string } | undefined;
    if (!row) return null;
    return analysisResultSchema.parse(JSON.parse(row.result_json));
  }

  return { saveAnalysis, getAnalysis };
}
