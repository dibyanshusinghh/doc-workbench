import type { AnalysisResult, DocumentSummary } from '../types';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    /** Per-document statuses, sent when no document could be processed. */
    public readonly documents: DocumentSummary[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error: { code: string; message: string; details?: { documents?: DocumentSummary[] } };
}

function isErrorBody(body: unknown): body is ErrorBody {
  return typeof body === 'object' && body !== null && 'error' in body;
}

export async function createAnalysis(files: File[], prompt: string): Promise<AnalysisResult> {
  const form = new FormData();
  form.append('prompt', prompt);
  for (const file of files) form.append('files', file);

  let response: Response;
  try {
    response = await fetch('/api/analyses', { method: 'POST', body: form });
  } catch {
    throw new ApiError('Could not reach the server. Is the backend running?', 'NETWORK_ERROR');
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (isErrorBody(body)) {
      throw new ApiError(body.error.message, body.error.code, body.error.details?.documents ?? []);
    }
    throw new ApiError(`Request failed with status ${response.status}.`, 'UNKNOWN');
  }

  return body as AnalysisResult;
}
