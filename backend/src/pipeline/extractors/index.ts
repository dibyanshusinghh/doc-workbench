import type { DocumentFormat } from '../../shared/schemas.js';
import type { Extractor } from '../types.js';
import { extractCsv } from './csv.js';
import { extractPdf } from './pdf.js';
import { extractText } from './text.js';

/** Supporting a new format = write an Extractor and register it here (plus validate.ts). */
export const extractors: Record<DocumentFormat, Extractor> = {
  pdf: extractPdf,
  txt: extractText,
  csv: extractCsv,
};
