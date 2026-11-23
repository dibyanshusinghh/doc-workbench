import { refOf, type DocumentIndex } from '../lib/documents';
import type { ExtractedFact } from '../types';
import { SourceTag } from './Section';

export function FactsTable({ facts, index }: { facts: ExtractedFact[]; index: DocumentIndex }) {
  if (facts.length === 0) {
    return <p className="muted">No facts were extracted.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Field</th>
            <th>Value</th>
            <th>Type</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((fact) => (
            <tr key={fact.id}>
              <td>
                <SourceTag docRef={refOf(index, fact.documentId)} />
              </td>
              <td>{fact.key}</td>
              <td title={fact.snippet}>{fact.value}</td>
              <td>
                <span className="badge kind">{fact.kind}</span>
              </td>
              <td className="muted">
                chunk {fact.location.chunkIndex + 1}, char {fact.location.startOffset}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
