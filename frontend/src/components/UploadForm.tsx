import { useState, type ChangeEvent, type FormEvent } from 'react';

// Mirror the backend defaults (backend/.env.example). The backend re-validates everything.
const ACCEPTED_EXTENSIONS = ['.pdf', '.txt', '.csv'];
const MAX_FILES = 10;
const MAX_FILE_SIZE_MB = 5;
const PROMPT_MIN_LENGTH = 5;
const PROMPT_MAX_LENGTH = 2000;

const EXAMPLE_PROMPTS = [
  'Compare the information across all uploaded documents.',
  'Identify inconsistencies between the application form and supporting documents.',
  'Extract key dates, obligations, financial values, and missing information.',
  'Highlight discrepancies in names, addresses, licence details, or revenue figures.',
];

interface Props {
  loading: boolean;
  onSubmit: (files: File[], prompt: string) => void;
}

export function UploadForm({ loading, onSubmit }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [prompt, setPrompt] = useState('');

  const tooLarge = files.filter((f) => f.size > MAX_FILE_SIZE_MB * 1024 * 1024);
  const promptLength = prompt.trim().length;
  const problems = [
    files.length > MAX_FILES && `Select at most ${MAX_FILES} files.`,
    tooLarge.length > 0 && `Files must be ${MAX_FILE_SIZE_MB} MB or smaller: ${tooLarge.map((f) => f.name).join(', ')}.`,
  ].filter((p): p is string => Boolean(p));

  const canSubmit =
    !loading &&
    files.length > 0 &&
    problems.length === 0 &&
    promptLength >= PROMPT_MIN_LENGTH &&
    promptLength <= PROMPT_MAX_LENGTH;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    // Append new files, skipping ones already in the list.
    setFiles((current) => [
      ...current,
      ...selected.filter((f) => !current.some((c) => c.name === f.name && c.size === f.size)),
    ]);
    event.target.value = ''; // allow selecting the same file again after removing it
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (canSubmit) onSubmit(files, prompt.trim());
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>1. Upload documents</h2>
      <label className="file-picker">
        <input type="file" multiple accept={ACCEPTED_EXTENSIONS.join(',')} onChange={handleFileChange} />
        <span>Choose files</span>
        <small>PDF, TXT or CSV · up to {MAX_FILES} files · {MAX_FILE_SIZE_MB} MB each</small>
      </label>

      {files.length > 0 && (
        <ul className="file-list">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`}>
              <span className="file-name">{file.name}</span>
              <span className="muted">{formatSize(file.size)}</span>
              {!isAccepted(file) && <span className="badge badge-warn">Unsupported — will be rejected</span>}
              <button
                type="button"
                className="link-button"
                onClick={() => setFiles((current) => current.filter((f) => f !== file))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>2. Describe the analysis</h2>
      <div className="chips">
        {EXAMPLE_PROMPTS.map((example) => (
          <button type="button" key={example} className="chip" onClick={() => setPrompt(example)}>
            {example}
          </button>
        ))}
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Highlight discrepancies in names, addresses and revenue figures."
        rows={3}
        maxLength={PROMPT_MAX_LENGTH}
      />
      <div className="form-footer">
        <small className="muted">
          {promptLength}/{PROMPT_MAX_LENGTH} characters
        </small>
        <button type="submit" className="primary" disabled={!canSubmit}>
          {loading ? 'Analysing…' : 'Analyse documents'}
        </button>
      </div>

      {problems.map((problem) => (
        <p key={problem} className="error-text">
          {problem}
        </p>
      ))}
    </form>
  );
}

function isAccepted(file: File): boolean {
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
