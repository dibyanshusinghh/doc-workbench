import { useState } from 'react';
import { ApiError, createAnalysis } from './api/client';
import { DocumentStatusList } from './components/DocumentStatusList';
import { ResultsView } from './components/ResultsView';
import { UploadForm } from './components/UploadForm';
import type { AnalysisResult } from './types';

export default function App() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(files: File[], prompt: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await createAnalysis(files, prompt));
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('Something went wrong. Please try again.', 'UNKNOWN'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Multi-Document Intelligence Workbench</h1>
        <p className="muted">Upload documents, describe the analysis, and get traceable findings.</p>
      </header>

      <main>
        <UploadForm loading={loading} onSubmit={handleSubmit} />

        {error && (
          <div className="card error-box" role="alert">
            <strong>Analysis failed:</strong> {error.message}
            {error.documents.length > 0 && <DocumentStatusList documents={error.documents} />}
          </div>
        )}

        {result && <ResultsView result={result} />}
      </main>
    </div>
  );
}
