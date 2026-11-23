import { Router } from 'express';
import { z } from 'zod';
import { runAnalysis, toDocumentSummary } from '../../analysis/analyze.js';
import type { LlmProvider } from '../../analysis/provider.js';
import { config } from '../../config/env.js';
import type { AnalysisRepository, StoredDocument } from '../../db/repository.js';
import { processDocument } from '../../pipeline/index.js';
import type { ProcessedDocument } from '../../pipeline/types.js';
import { AppError } from '../../shared/errors.js';
import { uploadFiles } from '../middleware/upload.js';

const PROMPT_MIN_LENGTH = 5;
const PROMPT_MAX_LENGTH = 2000;

const promptSchema = z.string().trim().min(PROMPT_MIN_LENGTH).max(PROMPT_MAX_LENGTH);
const analysisIdSchema = z.uuid();

export function createAnalysesRouter(repository: AnalysisRepository, provider: LlmProvider): Router {
  const router = Router();

  // POST /api/analyses — multipart form: files[] + prompt
  router.post('/', uploadFiles, async (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      throw new AppError(400, 'NO_FILES', 'Upload at least one document.');
    }

    const prompt = promptSchema.safeParse(req.body?.prompt);
    if (!prompt.success) {
      throw new AppError(
        400,
        'INVALID_PROMPT',
        `Prompt must be between ${PROMPT_MIN_LENGTH} and ${PROMPT_MAX_LENGTH} characters.`,
      );
    }

    const documents = await Promise.all(
      files.map((file) =>
        processDocument(
          { originalName: file.originalname, mimeType: file.mimetype, buffer: file.buffer },
          { maxCharsPerDoc: config.MAX_CHARS_PER_DOC, chunkSize: config.CHUNK_SIZE },
        ),
      ),
    );

    if (!documents.some((doc) => doc.status === 'parsed')) {
      throw new AppError(422, 'NO_VALID_DOCUMENTS', 'None of the uploaded documents could be processed.', {
        documents: documents.map(toDocumentSummary),
      });
    }

    const result = await runAnalysis(prompt.data, documents, provider);
    repository.saveAnalysis({ result, documents: documents.map(toStoredDocument) });

    res.status(201).json(result);
  });

  // GET /api/analyses/:id — fetch a stored analysis result
  router.get('/:id', (req, res) => {
    const id = analysisIdSchema.safeParse(req.params.id);
    if (!id.success) {
      throw new AppError(400, 'INVALID_ID', 'Analysis id must be a valid UUID.');
    }

    const analysis = repository.getAnalysis(id.data);
    if (!analysis) {
      throw new AppError(404, 'NOT_FOUND', 'Analysis not found.');
    }

    res.json(analysis);
  });

  return router;
}

function toStoredDocument(doc: ProcessedDocument): StoredDocument {
  return {
    summary: toDocumentSummary(doc),
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    sha256: doc.sha256,
    chunks: doc.status === 'parsed' ? doc.chunks : [],
  };
}
