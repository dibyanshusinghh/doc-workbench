import { parse } from 'csv-parse/sync';
import { DocumentError, type Extractor } from '../types.js';
import { decodeUtf8 } from './text.js';

/**
 * Converts a CSV into "Key: Value" lines so the fact extractor can treat every format the same way.
 *  - 2 columns:  each row becomes "column1: column2"
 *  - 3+ columns: the first row is the header; each cell becomes "<first cell> <header>: <value>"
 */
export const extractCsv: Extractor = async (buffer) => {
  const rows = parseRows(decodeUtf8(buffer));
  if (rows.length === 0) {
    throw new DocumentError('UNREADABLE', 'The CSV file contains no rows.');
  }

  const columnCount = Math.max(...rows.map((row) => row.length));
  return columnCount <= 2 ? keyValueRowsToText(rows) : tableToText(rows);
};

function parseRows(content: string): string[][] {
  try {
    return parse(content, { skip_empty_lines: true, relax_column_count: true, trim: true }) as string[][];
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown error';
    throw new DocumentError('UNREADABLE', `The CSV file could not be parsed: ${reason}`);
  }
}

function keyValueRowsToText(rows: string[][]): string {
  return rows.map(([key = '', value = '']) => `${key}: ${value}`).join('\n');
}

function tableToText(rows: string[][]): string {
  const [header = [], ...dataRows] = rows;
  const lines: string[] = [];

  for (const row of dataRows) {
    const rowLabel = row[0] ?? '';
    for (let col = 1; col < header.length; col++) {
      lines.push(`${rowLabel} ${header[col]}: ${row[col] ?? ''}`);
    }
  }
  return lines.join('\n');
}
