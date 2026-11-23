import { describe, expect, it } from 'vitest';
import { findProvenanceErrors, runAnalysis } from '../src/analysis/analyze.js';
import { MockLlmProvider } from '../src/analysis/mockProvider.js';
import type { LlmProvider } from '../src/analysis/provider.js';
import { processDocument } from '../src/pipeline/index.js';
import { AppError } from '../src/shared/errors.js';
import { pipelineOptions, sampleFile, textFile } from './helpers.js';

const provider = new MockLlmProvider();

async function analyse(prompt: string, ...files: Parameters<typeof processDocument>[0][]) {
  const documents = await Promise.all(files.map((f) => processDocument(f, pipelineOptions)));
  return runAnalysis(prompt, documents, provider);
}

describe('cross-document analysis (mock AI)', () => {
  it('detects discrepancies across the sample documents and cites both sources', async () => {
    const result = await analyse(
      'Highlight discrepancies in names, addresses, licence details, or revenue figures.',
      sampleFile('application_form.txt'),
      sampleFile('company_registry.pdf'),
      sampleFile('financial_statement.csv'),
    );
    const [application, registry, financials] = result.documents;
    const finding = (title: string) => result.crossDocument.discrepancies.find((d) => d.title.startsWith(title));

    // Revenue: £2,450,000 (application) vs £2,180,000 (financial statement)
    const revenue = finding('Revenue');
    expect(revenue?.severity).toBe('high');
    expect(revenue?.sources.map((s) => s.documentId)).toEqual([application!.id, financials!.id]);

    // Licence: NWL-88231 (application) vs NWL-88213 (registry)
    expect(finding('Licence number')?.sources.map((s) => s.documentId)).toEqual([application!.id, registry!.id]);

    // Address: 14 vs 18 Harbour Road
    expect(finding('Address')).toBeDefined();

    // "Northwind Logistics Ltd" vs "Limited" is treated as the same name
    expect(result.crossDocument.comparison.find((r) => r.field === 'Company name')?.status).not.toBe('mismatch');

    // Every finding is AI interpretation and traceable to real documents/facts
    for (const f of [...result.crossDocument.discrepancies, ...result.crossDocument.missingInformation]) {
      expect(f.origin).toBe('ai_interpretation');
      expect(f.sources.length).toBeGreaterThan(0);
    }
    expect(findProvenanceErrors(result)).toEqual([]);
  });

  it('analyses each document independently', async () => {
    const result = await analyse(
      'Compare all documents.',
      sampleFile('application_form.txt'),
      sampleFile('bank_reference.txt'),
    );
    expect(result.perDocument.map((p) => p.documentId)).toEqual(result.documents.map((d) => d.id));
  });

  it('reports information missing from a document', async () => {
    const result = await analyse(
      'Identify missing information.',
      textFile('a.txt', 'Company Name: Acme Ltd\nLicence Number: L-1'),
      textFile('b.txt', 'Company Name: Acme Ltd\nLicence Number: L-1'),
      textFile('c.txt', 'Company Name: Acme Ltd'),
    );
    const missing = result.crossDocument.missingInformation;

    expect(missing).toHaveLength(1);
    expect(missing[0]?.title).toBe('Licence number not found in c.txt');
  });

  it('flags the same amount stated in different currencies', async () => {
    const result = await analyse(
      'Compare revenue figures.',
      textFile('a.txt', 'Revenue: £1,000,000'),
      textFile('b.txt', 'Turnover: $1,000,000'),
    );
    expect(result.crossDocument.discrepancies[0]?.title).toBe('Revenue is stated in different currencies');
  });

  it('skips rejected documents and reports them as warnings', async () => {
    const result = await analyse('Compare all documents.', sampleFile('bank_reference.txt'), sampleFile('invalid/empty.txt'));

    expect(result.perDocument).toHaveLength(1);
    expect(result.meta.warnings).toEqual(['empty.txt was skipped: The file is empty.']);
  });
});

describe('AI output validation', () => {
  it('rejects provider output that does not match the schema', async () => {
    const broken: LlmProvider = {
      name: 'broken',
      analyzeDocument: async () => ({ summary: 42 }),
      synthesize: async () => ({}),
    };
    const documents = [await processDocument(textFile('a.txt', 'Name: A'), pipelineOptions)];

    await expect(runAnalysis('Compare all documents.', documents, broken)).rejects.toMatchObject({
      status: 502,
      code: 'AI_OUTPUT_INVALID',
    } satisfies Partial<AppError>);
  });

  it('rejects findings that cite unknown documents or facts', async () => {
    const result = await analyse('Compare.', textFile('a.txt', 'Name: A'), textFile('b.txt', 'Name: B'));
    const [a, b] = result.facts;

    result.crossDocument.discrepancies.push({
      ...result.crossDocument.discrepancies[0]!,
      sources: [{ documentId: 'made-up-id' }, { documentId: a!.documentId, factId: b!.id }],
    });

    expect(findProvenanceErrors(result)).toEqual([
      expect.stringContaining('unknown document "made-up-id"'),
      expect.stringContaining(`fact "${b!.id}" does not belong to document "${a!.documentId}"`),
    ]);
  });
});
