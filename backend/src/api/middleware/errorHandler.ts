import type { ErrorRequestHandler, RequestHandler } from 'express';
import multer from 'multer';
import { config } from '../../config/env.js';
import { AppError } from '../../shared/errors.js';

/** Catches requests that matched no route. */
export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found.'));
};

/** Central error handler: every error leaves the API as `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appError = toAppError(err);

  if (appError.status >= 500) {
    console.error(err);
  }

  res.status(appError.status).json({
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined && { details: appError.details }),
    },
  });
};

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof multer.MulterError) return fromMulterError(err);

  // Unknown errors: never leak internal messages or stack traces to the client.
  return new AppError(500, 'INTERNAL', 'An unexpected error occurred.');
}

function fromMulterError(err: multer.MulterError): AppError {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return new AppError(413, 'FILE_TOO_LARGE', `Each file must be ${config.MAX_FILE_SIZE_MB} MB or smaller.`);
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return new AppError(413, 'TOO_MANY_FILES', `Upload at most ${config.MAX_FILES} files in the "files" field.`);
    default:
      return new AppError(400, 'INVALID_UPLOAD', err.message);
  }
}
