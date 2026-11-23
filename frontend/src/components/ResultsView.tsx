import { useMemo } from 'react';
import { buildDocumentIndex, refOf } from '../lib/documents';
import { formatReport } from '../lib/report';
import type { AnalysisResult } from '../types';
import { ComparisonTable } from './ComparisonTable';
import { CopyButton } from './CopyButton';
import { DocumentStatusList } from './DocumentStatusList';
import { FactsTable } from './FactsTable';
import { FindingsList } from './FindingsList';
import { OriginBadge, Section, SourceTag } from './Section';

export function ResultsView({ result }: { result: AnalysisResult }) {
  const index = useMemo(() => buildDocumentIndex(result.documents), [result.documents]);
  const { crossDocument } = result;

  return (
    <div className="results">
      <div className="results-header">
        <div>
          <h2>Results</h2>
          <p className="muted">
            “{result.prompt}” · {new Date(result.createdAt).toLocaleString()} · provider: {result.meta.provider}
          </p>
          <p className="legend">
            <OriginBadge origin="extracted" /> taken directly from documents · <OriginBadge origin="ai" /> generated
            from those facts
          </p>
        </div>
        <div className="section-actions">
          <CopyButton text={formatReport(result)} label="Copy report" />
          <CopyButton text={JSON.stringify(result, null, 2)} label="Copy JSON" />
        </div>
      </div>

      {result.meta.warnings.length > 0 && (
        <div className="warning-box">
          {result.meta.warnings.map((warning) => (
            <p key={warning}>⚠ {warning}</p>
          ))}
        </div>
      )}

      <Section title="Documents">
        <DocumentStatusList documents={result.documents} />
      </Section>

      <Section title="Consolidated summary" origin="ai" actions={<CopyButton text={crossDocument.summary} label="Copy" />}>
        <p>{crossDocument.summary}</p>
      </Section>

      <Section title="Comparison table" origin="ai">
        <ComparisonTable rows={crossDocument.comparison} documents={result.documents} index={index} />
      </Section>

      <Section title={`Discrepancies (${crossDocument.discrepancies.length})`} origin="ai">
        <FindingsList findings={crossDocument.discrepancies} index={index} emptyText="No discrepancies found." />
      </Section>

      <Section title={`Missing information (${crossDocument.missingInformation.length})`} origin="ai">
        <FindingsList
          findings={crossDocument.missingInformation}
          index={index}
          emptyText="No missing information detected."
        />
      </Section>

      <Section title="Per-document analysis" origin="ai">
        <ul className="per-document">
          {result.perDocument.map((entry) => (
            <li key={entry.documentId}>
              <SourceTag docRef={refOf(index, entry.documentId)} />
              <p>{entry.summary}</p>
              <small className="muted">{entry.factIds.length} fact(s) relevant to the instruction</small>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`Key-value extraction (${result.facts.length})`} origin="extracted">
        <FactsTable facts={result.facts} index={index} />
      </Section>
    </div>
  );
}
