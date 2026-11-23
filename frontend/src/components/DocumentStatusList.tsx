import { buildDocumentIndex, refOf } from '../lib/documents';
import type { DocumentSummary } from '../types';
import { SourceTag } from './Section';

const STATUS_LABEL: Record<DocumentSummary['status'], string> = {
  parsed: 'Parsed',
  rejected: 'Rejected',
  failed: 'Unreadable',
};

export function DocumentStatusList({ documents }: { documents: DocumentSummary[] }) {
  const index = buildDocumentIndex(documents);

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Document</th>
            <th>Format</th>
            <th>Status</th>
            <th>Characters</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id}>
              <td>
                <SourceTag docRef={refOf(index, doc.id)} />
              </td>
              <td>{doc.format?.toUpperCase() ?? '—'}</td>
              <td>
                <span className={`badge status-${doc.status}`}>{STATUS_LABEL[doc.status]}</span>
              </td>
              <td>{doc.status === 'parsed' ? doc.charCount.toLocaleString() : '—'}</td>
              <td className="muted">
                {doc.errorMessage ?? (doc.truncated ? 'Truncated — only the first part was analysed.' : '')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
