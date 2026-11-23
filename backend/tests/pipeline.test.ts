import { describe, expect, it } from 'vitest';
import { chunkText, truncateText } from '../src/pipeline/chunk.js';
import { compareMoney, normalizeValue } from '../src/pipeline/facts.js';
import { processDocument } from '../src/pipeline/index.js';
import type { ParsedDocument, ProcessedDocument } from '../src/pipeline/types.js';
import { pipelineOptions, sampleFile, textFile } from './helpers.js';

function expectParsed(doc: ProcessedDocument): ParsedDocument {
  if (doc.status !== 'parsed') throw new Error(`Expected parsed, got ${doc.status}: ${doc.errorMessage}`);
  return doc;
}

describe('processDocument — supported formats', () => {
  it('parses a TXT file and extracts typed, normalised facts', async () => {
    const doc = expectParsed(await processDocument(sampleFile('application_form.txt'), pipelineOptions));
    const fact = (key: string) => doc.facts.find((f) => f.key === key);

    expect(doc.format).toBe('txt');
    expect(fact('Company Name')).toMatchObject({ kind: 'field', value: 'Northwind Logistics Ltd' });
    expect(fact('Annual Revenue')).toMatchObject({ kind: 'money', normalizedValue: 'GBP 2450000' });
    expect(fact('Date of Incorporation')).toMatchObject({ kind: 'date', normalizedValue: '2016-05-12' });
    expect(fact('Licence Number')).toMatchObject({ kind: 'identifier', normalizedValue: 'nwl88231' });
  });

  it('parses a PDF file', async () => {
    const doc = expectParsed(await processDocument(sampleFile('company_registry.pdf'), pipelineOptions));

    expect(doc.format).toBe('pdf');
    expect(doc.facts.find((f) => f.key === 'Registered Name')?.value).toBe('Northwind Logistics Limited');
  });

  it('turns a key-value CSV and a table CSV into facts', async () => {
    const keyValue = expectParsed(await processDocument(sampleFile('financial_statement.csv'), pipelineOptions));
    const table = expectParsed(await processDocument(sampleFile('companies_comparison.csv'), pipelineOptions));

    expect(keyValue.facts.find((f) => f.key === 'Turnover')?.normalizedValue).toBe('GBP 2180000');
    expect(table.facts.find((f) => f.key === 'Bluefin Freight Ltd Revenue')?.normalizedValue).toBe('GBP 3100000');
  });

  it('records offsets that point to the exact source line of every fact (provenance)', async () => {
    const doc = expectParsed(await processDocument(sampleFile('application_form.txt'), pipelineOptions));

    expect(doc.facts.length).toBeGreaterThan(0);
    for (const fact of doc.facts) {
      const lineStart = doc.text.lastIndexOf('\n', fact.location.startOffset) + 1;
      expect(doc.text.startsWith(fact.snippet, lineStart)).toBe(true);
      expect(fact.documentId).toBe(doc.id);
    }
  });
});

describe('processDocument — invalid files are handled gracefully', () => {
  it.each([
    ['invalid/scanned_id.png', 'rejected', 'UNSUPPORTED_TYPE'],
    ['invalid/not_really_a.pdf', 'rejected', 'SIGNATURE_MISMATCH'],
    ['invalid/empty.txt', 'rejected', 'EMPTY_FILE'],
  ])('%s → %s (%s)', async (path, status, errorCode) => {
    const doc = await processDocument(sampleFile(path), pipelineOptions);
    expect(doc).toMatchObject({ status, errorCode });
  });

  it('rejects binary content disguised as text', async () => {
    const doc = await processDocument(
      { originalName: 'data.txt', mimeType: 'text/plain', buffer: Buffer.from([0x48, 0x00, 0x49]) },
      pipelineOptions,
    );
    expect(doc).toMatchObject({ status: 'rejected', errorCode: 'SIGNATURE_MISMATCH' });
  });

  it('marks a PDF with a valid header but corrupt body as unreadable', async () => {
    const doc = await processDocument(
      { originalName: 'broken.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\ngarbage') },
      pipelineOptions,
    );
    expect(doc).toMatchObject({ status: 'failed', errorCode: 'UNREADABLE' });
  });

  it('strips path components from filenames', async () => {
    const doc = await processDocument(textFile('../../etc/passwd.txt', 'Name: test'), pipelineOptions);
    expect(doc.name).toBe('passwd.txt');
  });
});

describe('large documents', () => {
  it('truncates to the character limit and flags it', async () => {
    const content = Array.from({ length: 2000 }, (_, i) => `Line ${i}: value ${i}`).join('\n');
    const doc = expectParsed(
      await processDocument(textFile('big.txt', content), { maxCharsPerDoc: 5000, chunkSize: 1000 }),
    );

    expect(doc.truncated).toBe(true);
    expect(doc.text.length).toBeLessThanOrEqual(5000);
    expect(doc.charCount).toBe(content.length);
  });

  it('splits text into contiguous chunks that cover the whole text', () => {
    const text = Array.from({ length: 300 }, (_, i) => `row ${i}`).join('\n');
    const chunks = chunkText(text, 200);

    expect(chunks.map((c) => c.text).join('')).toBe(text);
    chunks.forEach((chunk, i) => {
      expect(chunk.text.length).toBeLessThanOrEqual(200);
      if (i > 0) expect(chunk.startOffset).toBe(chunks[i - 1]!.endOffset);
    });
    expect(truncateText('abc', 10)).toEqual({ text: 'abc', truncated: false });
  });
});

describe('value normalisation', () => {
  it('normalises money with currency, and dates to ISO', () => {
    expect(normalizeValue('£1,200,000', 'money')).toBe('GBP 1200000');
    expect(normalizeValue('1.2m USD', 'money')).toBe('USD 1200000');
    expect(normalizeValue('1200000', 'money')).toBe('1200000');
    expect(normalizeValue('15/03/2024', 'date')).toBe('2024-03-15');
    expect(normalizeValue('3 March 2025', 'date')).toBe('2025-03-03');
  });

  it('compares money by amount and currency', () => {
    expect(compareMoney('GBP 1000', 'GBP 1000')).toBe('match');
    expect(compareMoney('GBP 1000', '1000')).toBe('match'); // missing currency is compatible
    expect(compareMoney('GBP 1000', 'USD 1000')).toBe('currency_mismatch');
    expect(compareMoney('GBP 1000', 'GBP 1200')).toBe('amount_mismatch');
  });
});
