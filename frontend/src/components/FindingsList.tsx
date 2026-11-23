import { refOf, type DocumentIndex } from '../lib/documents';
import type { Finding } from '../types';
import { SourceTag } from './Section';

interface Props {
  findings: Finding[];
  index: DocumentIndex;
  emptyText: string;
}

export function FindingsList({ findings, index, emptyText }: Props) {
  if (findings.length === 0) {
    return <p className="muted">{emptyText}</p>;
  }

  return (
    <ul className="findings">
      {findings.map((finding) => (
        <li key={finding.id} className={`finding severity-${finding.severity}`}>
          <div className="finding-header">
            <span className={`badge sev-${finding.severity}`}>{finding.severity}</span>
            <strong>{finding.title}</strong>
            <span className="muted confidence">confidence {Math.round(finding.confidence * 100)}%</span>
          </div>
          <p>{finding.detail}</p>
          <div className="sources">
            <span className="muted">Sources:</span>
            <ul>
              {finding.sources.map((source, i) => (
                <li key={`${source.documentId}-${source.factId ?? i}`}>
                  <SourceTag docRef={refOf(index, source.documentId)} />
                  {source.snippet ? (
                    <q className="snippet">{source.snippet}</q>
                  ) : (
                    <span className="muted"> (field not present)</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </li>
      ))}
    </ul>
  );
}
