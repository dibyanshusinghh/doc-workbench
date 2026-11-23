/** Error codes returned to API clients in the `{ error: { code } }` envelope. */
export type ApiErrorCode =
  | 'INVALID_PROMPT'
  | 'NO_FILES'
  | 'FILE_TOO_LARGE'
  | 'TOO_MANY_FILES'
  | 'INVALID_UPLOAD'
  | 'NO_VALID_DOCUMENTS'
  | 'INVALID_ID'
  | 'NOT_FOUND'
  | 'AI_OUTPUT_INVALID'
  | 'INTERNAL';

/** An expected, client-safe error. Anything else is treated as a 500. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
