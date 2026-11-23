import { refOf, type DocumentIndex } from '../lib/documents';
import type { ComparisonRow, DocumentSummary } from '../types';

const STATUS_LABEL: Record<ComparisonRow['status'], string> = {
  match: 'Match',
  mismatch: 'Mismatch',
  partial: 'Partial',
};

interface Props {
  rows: ComparisonRow[];
  documents: DocumentSummary[];
  index: DocumentIndex;
}

/** Fields as rows, documents as columns. */
export function ComparisonTable({ rows, documents, index }: Props) {
  if (rows.length === 0) {
    return <p className="muted">No fields were shared by two or more documents.</p>;
  }

  const columns = documents.filter((d) => d.status === 'parsed');

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Status</th>
            {columns.map((doc) => {
              const ref = refOf(index, doc.id);
              return (
                <th key={doc.id} title={ref.name}>
                  {ref.label} · {ref.name}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className={row.status === 'mismatch' ? 'row-mismatch' : undefined}>
              <td>
                <strong>{row.field}</strong>
              </td>
              <td>
                <span className={`badge cmp-${row.status}`}>{STATUS_LABEL[row.status]}</span>
              </td>
              {columns.map((doc) => {
                const value = row.values.find((v) => v.documentId === doc.id)?.value ?? null;
                return <td key={doc.id}>{value ?? <span className="muted">— not found</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
