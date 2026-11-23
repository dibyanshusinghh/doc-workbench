import multer from 'multer';
import { config } from '../../config/env.js';

/**
 * Accepts up to MAX_FILES files in the "files" field.
 * Files are kept in memory only (never written to disk) and size-limited.
 * Type checks happen per file in the parsing pipeline so one bad file
 * does not reject the whole upload.
 */
export const uploadFiles = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_FILE_SIZE_BYTES,
    files: config.MAX_FILES,
    fields: 5,
    fieldSize: 16 * 1024, // the prompt is the only text field
  },
}).array('files', config.MAX_FILES);
