import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockLlmProvider } from '../src/analysis/mockProvider.js';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { createRepository } from '../src/db/repository.js';
import { sampleFile } from './helpers.js';

// Runs the real Express app on a random port with an in-memory database.
let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp(createRepository(createDatabase(':memory:')), new MockLlmProvider());
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => {
  server.close();
});

function form(prompt: string | null, ...samplePaths: string[]): FormData {
  const data = new FormData();
  if (prompt !== null) data.append('prompt', prompt);
  for (const path of samplePaths) {
    const file = sampleFile(path);
    data.append('files', new Blob([new Uint8Array(file.buffer)], { type: file.mimeType }), file.originalName);
  }
  return data;
}

const post = (body: FormData) => fetch(`${baseUrl}/analyses`, { method: 'POST', body });

describe('POST /api/analyses', () => {
  it('analyses valid files, rejects the unsupported one, and stores the result', async () => {
    const response = await post(
      form('Compare the information across all uploaded documents.', 'application_form.txt', 'company_registry.pdf', 'invalid/scanned_id.png'),
    );
    const result = await response.json();

    expect(response.status).toBe(201);
    expect(result.documents.map((d: { status: string }) => d.status)).toEqual(['parsed', 'parsed', 'rejected']);
    expect(result.crossDocument.discrepancies.length).toBeGreaterThan(0);

    const stored = await fetch(`${baseUrl}/analyses/${result.analysisId}`);
    expect(stored.status).toBe(200);
    expect(await stored.json()).toEqual(result);
  });

  it('returns 400 when the prompt is missing', async () => {
    const response = await post(form(null, 'application_form.txt'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('INVALID_PROMPT');
  });

  it('returns 400 when no files are uploaded', async () => {
    const response = await post(form('Compare all documents.'));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('NO_FILES');
  });

  it('returns 422 with per-file reasons when no document is usable', async () => {
    const response = await post(form('Compare all documents.', 'invalid/not_really_a.pdf', 'invalid/empty.txt'));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('NO_VALID_DOCUMENTS');
    expect(body.error.details.documents.map((d: { errorCode: string }) => d.errorCode)).toEqual([
      'SIGNATURE_MISMATCH',
      'EMPTY_FILE',
    ]);
  });
});

describe('GET /api/analyses/:id', () => {
  it('returns 400 for an invalid id and 404 for an unknown id', async () => {
    expect((await fetch(`${baseUrl}/analyses/not-a-uuid`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/analyses/3f1c2a9e-1b2c-4d5e-8f90-123456789abc`)).status).toBe(404);
  });
});
