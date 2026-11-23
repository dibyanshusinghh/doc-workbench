-- Multi-Document Intelligence Workbench schema (SQLite)

CREATE TABLE IF NOT EXISTS analyses (
  id           TEXT PRIMARY KEY,
  prompt       TEXT NOT NULL,
  result_json  TEXT NOT NULL,          -- validated AnalysisResult
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id             TEXT PRIMARY KEY,
  analysis_id    TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  original_name  TEXT NOT NULL,
  format         TEXT CHECK (format IN ('pdf', 'txt', 'csv')),   -- NULL when rejected
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('parsed', 'rejected', 'failed')),
  error_code     TEXT,
  error_message  TEXT,
  char_count     INTEGER NOT NULL DEFAULT 0,
  truncated      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INTEGER NOT NULL,
  start_offset  INTEGER NOT NULL,
  end_offset    INTEGER NOT NULL,
  text          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
  id                TEXT PRIMARY KEY,
  document_id       TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,
  value             TEXT NOT NULL,
  normalized_value  TEXT NOT NULL,
  kind              TEXT NOT NULL CHECK (kind IN ('field', 'date', 'money', 'identifier')),
  chunk_index       INTEGER NOT NULL,
  start_offset      INTEGER NOT NULL,
  snippet           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_analysis ON documents(analysis_id);
CREATE INDEX IF NOT EXISTS idx_chunks_document    ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_facts_document     ON facts(document_id);
