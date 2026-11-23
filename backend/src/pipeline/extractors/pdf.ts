import { PDFParse } from 'pdf-parse';
import { DocumentError, type Extractor } from '../types.js';

/** Extracts the text layer of a PDF. Scanned (image-only) PDFs yield no text, since OCR is out of scope. */
export const extractPdf: Extractor = async (buffer) => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } catch {
    throw new DocumentError('UNREADABLE', 'The PDF is corrupted or password-protected.');
  } finally {
    await parser.destroy();
  }
};
