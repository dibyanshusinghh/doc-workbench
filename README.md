# Multi-Document Intelligence Workbench

Upload several documents, describe the analysis you want, and get a structured comparison: a consolidated summary, a comparison table, discrepancies, missing information and key-value extraction. **Every finding is traced back to the document (and line) it came from.**

- **Stack:** React + Vite (frontend) · Node.js + Express (backend) · TypeScript throughout · SQLite (`better-sqlite3`)
- **Formats:** PDF (`pdf-parse`), TXT, CSV (`csv-parse`)
- **AI:** mocked LLM behind a provider interface, with schema-validated output

---

## Setup

**Requirements:** Node.js 20.19+ (an `.nvmrc` is included, so run `nvm use`). On macOS, `better-sqlite3` installs a prebuilt binary; other platforms may need build tools.

```bash
# Backend: http://localhost:4000
cd backend
cp .env.example .env        # optional; defaults work without it
npm install
npm run dev

# Frontend: http://localhost:5173 (proxies /api to the backend)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173, upload files from [`samples/`](samples/), pick an example instruction and click **Analyse documents**.

| Command (in `backend/`) | Purpose |
|---|---|
| `npm test` | Run the test suite (Vitest) |
| `npm run typecheck` | Type-check source and tests |
| `npm run build && npm start` | Production build and run |

The database file and schema are created automatically on start-up. The schema is in [`backend/src/db/schema.sql`](backend/src/db/schema.sql).

---

## Architecture

```
frontend (React)                      backend (Express)
────────────────                      ─────────────────────────────────────────────
UploadForm ──multipart──▶ POST /api/analyses
                                        │  multer: memory only, size/count limits
                                        │  zod: prompt validation
                                        ▼
                                      Parsing pipeline (per file, independent)
                                        validate → extract → normalise → truncate → chunk → extract facts
                                        │  bad file → status "rejected"/"failed"; the others continue
                                        ▼
                                      AI analysis (LlmProvider)
                                        1. analyzeDocument()  ← each document on its own
                                        2. synthesize()       ← per-document results + facts only (no raw text)
                                        3. zod schema check + provenance check
                                        ▼
                                      SQLite (one transaction) ──▶ 201 AnalysisResult
ResultsView ◀───────────────────────── GET /api/analyses/:id
```

### Backend layout (`backend/src`)

| Folder | Responsibility |
|---|---|
| `config/` | Environment variables, validated with zod (fails fast on bad config) |
| `api/` | Routes, upload middleware, central error handler (`{ error: { code, message } }`) |
| `pipeline/` | Document processing. One extractor per format, registered in `extractors/index.ts` |
| `analysis/` | `LlmProvider` interface, mock provider, orchestration and output validation |
| `db/` | SQLite connection, schema, repository |
| `shared/` | zod schemas (the API contract) and error types |

### Key design points

- **Document boundaries are kept.** Documents are never merged into one prompt. Each is analysed on its own, and the cross-document step receives only structured per-document results and extracted facts.
- **Provenance.** Each fact records its `documentId`, chunk, character offset and source line. Each finding must cite at least one source (`documentId`, plus `factId` and `snippet` where it has them). `findProvenanceErrors()` rejects any AI output that cites a document or fact that doesn't exist, or a fact that belongs to a different document.
- **Facts vs interpretation.** `origin: "extracted"` marks values pulled from the text by deterministic rules. `origin: "ai_interpretation"` marks findings produced by the AI. The UI labels every section with one of the two.
- **Structured AI output.** Providers return `unknown`, and the output is validated against zod schemas before use. A malformed response returns `502 AI_OUTPUT_INVALID`.
- **Large content.** Each document is capped (`MAX_CHARS_PER_DOC`, flagged `truncated`) and split into chunks of `CHUNK_SIZE` with offsets. Synthesis input stays bounded because it never includes raw text.

### API

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness check |
| POST | `/api/analyses` | `multipart/form-data`: `files` (1–10) and `prompt` (5–2000 chars) → `201 AnalysisResult` |
| GET | `/api/analyses/:id` | Fetch a stored analysis |

Errors: `400 INVALID_PROMPT / NO_FILES / INVALID_ID`, `413 FILE_TOO_LARGE / TOO_MANY_FILES`, `422 NO_VALID_DOCUMENTS` (with the reason for each file), `404 NOT_FOUND`, `502 AI_OUTPUT_INVALID`, `500 INTERNAL`.

### Database

`analyses` (prompt and validated result JSON) → `documents` (metadata, status, SHA-256, error) → `document_chunks` (text and offsets) and `facts` (extracted values and location). Original file bytes are never stored.

---

## Completed functionality

- Multiple file upload; PDF, TXT and CSV supported
- Text extraction per document, and rule-based fact extraction (labelled fields, dates, money, identifiers)
- Value normalisation: `£1,200,000` = `1.2m GBP`, `LIC-4471` = `LIC 4471`, `15/03/2024` = `2024-03-15`
- Free-text instruction with example prompts; keywords narrow the analysis (dates, financial values, names/identifiers)
- Per-document and cross-document analysis
- Output: consolidated summary, comparison table, discrepancies (severity and confidence), missing-information report, key-value extraction
- Source document and quoted line shown for each finding
- Copy buttons: full report (plain text), JSON, summary
- Graceful handling of unsupported, empty, disguised or corrupt files, with a reason for each file
- Results stored in SQLite and retrievable by ID

## Sample documents

[`samples/`](samples/) contains **synthetic** documents about a fictional company, with planted inconsistencies:

| File | Planted issues |
|---|---|
| `application_form.txt` | The reference document |
| `company_registry.pdf` | Licence number has two digits swapped (`NWL-88213` vs `NWL-88231`), different street number, "Limited" vs "Ltd" (should match) |
| `financial_statement.csv` | Turnover £2,180,000 vs £2,450,000 revenue on the application |
| `bank_reference.txt` | No revenue figure (missing information) |
| `companies_comparison.csv` | Three fictional companies, for a financial comparison |
| `invalid/` | Text file named `.pdf`, empty file, unsupported `.png` |

`company_registry.pdf` was generated from a text file with macOS `cupsfilter`.

## Tests

26 Vitest tests in [`backend/tests/`](backend/tests/):

- **pipeline:** each format parses; fact offsets point to the exact source line; invalid files are rejected with the right reason; truncation and chunking; money and date normalisation.
- **analysis:** the planted discrepancies in the samples are found and cite the right documents; missing information; currency mismatch; malformed AI output is rejected; fabricated citations are caught.
- **api:** the real Express app with an in-memory database. Mixed valid/invalid upload returns 201 and the result is stored; 400 / 422 / 404 error paths.

---

## Assumptions

- Documents are in English and contain a text layer. Scanned or image-only documents are rejected, as OCR was out of scope.
- Many fields are written as `Label: Value`, which is typical of forms, letters and registry extracts.
- Numeric dates are UK-style (`DD/MM/YYYY`).
- A single user and local use. Authentication was explicitly out of scope.

## Known limitations

- **The AI is mocked.** It lines up fields by label and a fixed synonym list (e.g. Turnover → Revenue), not by meaning, and it doesn't read prose for obligations or context.
- Fields that appear in only one document are not compared or reported as missing (this avoids noise).
- Table CSVs are read row by row with the first column as the row label. Cross-document comparison works best with key/value documents.
- Only GBP, USD and EUR are recognised; there is no currency conversion.
- Truncated documents are analysed only up to the character limit.
- Processing is synchronous within the request, with no job queue.
- No frontend tests.

## Security considerations

- **Uploads:** stored in memory only, never written to disk. Limits on size (5 MB), file count (10) and form fields.
- **Validation:** extension allow-list, MIME check, and a file-signature check (`%PDF-` for PDFs, no binary bytes in text files), so a renamed binary is rejected.
- **Filenames:** stripped of path components and control characters before storage or display, and never used as file paths.
- **Input:** prompt length is validated with zod; route IDs must be UUIDs. All SQL uses prepared statements.
- **Errors:** unknown errors return a generic `500` without stack traces. `x-powered-by` is disabled.
- **Data:** only extracted text is stored; a SHA-256 hash is kept for traceability. `.env` and database files are gitignored.
- **React** escapes all rendered content; there is no `dangerouslySetInnerHTML`.

## Productionisation

- **Real LLM:** implement `LlmProvider` (e.g. Claude) with document-tagged prompts, the JSON schema enforced through tool use or structured output, retries, and a map-reduce over chunks for long documents. The existing zod and provenance checks stay as safety checks.
- **Storage:** PostgreSQL with migrations; originals in encrypted object storage with a retention policy, if they need keeping.
- **Scale:** background jobs (e.g. BullMQ) with status polling for long analyses; streaming progress to the UI.
- **Security:** authentication and per-user access to analyses, rate limiting, `helmet`/CSP, malware scanning of uploads, and audit logs. Avoid sending sensitive data to third-party LLMs without a data processing agreement and redaction.
- **Capability:** OCR (e.g. Tesseract or a cloud OCR service) for scanned documents, and more formats (DOCX, XLSX).
- **Operations:** Docker, CI (type check, tests, build), structured logging, metrics and tracing, health/readiness probes.
- **Quality:** a shared types package for frontend and backend, frontend tests, and an evaluation set of document pairs with expected findings.

---

## AI tools used and personal decisions

**AI tool:** Claude Code (Anthropic, Claude Opus 5.5) wrote most of the code, the sample data and this README from step-by-step instructions. All output was reviewed and steered section by section.

**Decisions made personally:**

- **Stack:** SQLite with `better-sqlite3`; Express + zod + multer + Vitest; Vite + React with plain CSS (no UI libraries); `pdf-parse` and `csv-parse`; a mocked LLM.
- **Scope:** a strict scope with explicit exclusions (auth, OCR, Docker, queues, streaming, export formats), and a minimal set of dependencies.
- **Plan:** a separate frontend and backend, and a six-section build plan (foundation → parsing → AI → frontend → tests → docs), with each section reviewed before moving on.
- **Node version:** moving to Node 20 rather than pinning older library versions for Node 18.
- **Money comparison:** requested currency-aware money comparison, so the same amount in different currencies is flagged rather than reported as a match.
- **Commits:** every commit was approved manually.
