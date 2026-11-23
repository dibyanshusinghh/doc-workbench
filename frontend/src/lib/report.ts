import type { AnalysisResult, Finding } from '../types';
import { buildDocumentIndex, refOf, type DocumentIndex } from './documents';

/** Formats an analysis as plain text for the "Copy report" button. */
export function formatReport(result: AnalysisResult): string {
  const index = buildDocumentIndex(result.documents);
  const label = (id: string) => refOf(index, id).label;
  const lines: string[] = [];

  lines.push('MULTI-DOCUMENT ANALYSIS', `Instruction: ${result.prompt}`, `Created: ${result.createdAt}`, '');

  lines.push('DOCUMENTS');
  for (const doc of result.documents) {
    const note = doc.status === 'parsed' ? '' : ` — ${doc.errorMessage ?? ''}`;
    lines.push(`  ${label(doc.id)} ${doc.name} [${doc.status}]${note}`);
  }

  lines.push('', 'SUMMARY (AI interpretation)', `  ${result.crossDocument.summary}`);

  if (result.crossDocument.comparison.length > 0) {
    lines.push('', 'COMPARISON (AI interpretation)');
    for (const row of result.crossDocument.comparison) {
      const values = row.values.map((v) => `${label(v.documentId)}: ${v.value ?? 'not found'}`).join('; ');
      lines.push(`  ${row.field} [${row.status}] — ${values}`);
    }
  }

  appendFindings(lines, 'DISCREPANCIES (AI interpretation)', result.crossDocument.discrepancies, index);
  appendFindings(lines, 'MISSING INFORMATION (AI interpretation)', result.crossDocument.missingInformation, index);

  lines.push('', 'EXTRACTED FACTS (from documents)');
  for (const fact of result.facts) {
    lines.push(`  ${label(fact.documentId)} ${fact.key}: ${fact.value} (${fact.kind})`);
  }

  if (result.meta.warnings.length > 0) {
    lines.push('', 'WARNINGS', ...result.meta.warnings.map((w) => `  ${w}`));
  }

  return lines.join('\n');
}

function appendFindings(lines: string[], title: string, findings: Finding[], index: DocumentIndex): void {
  if (findings.length === 0) return;
  lines.push('', title);
  for (const finding of findings) {
    const sources = [...new Set(finding.sources.map((s) => refOf(index, s.documentId).label))].join(', ');
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title} — ${finding.detail} (Sources: ${sources})`);
  }
}
