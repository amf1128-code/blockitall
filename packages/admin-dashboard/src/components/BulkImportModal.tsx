import { useState } from 'react';
import { parseBulkImport } from '../lib/validation';

interface BulkImportModalProps {
  onImport: (handles: string[]) => Promise<{ added: number; skipped: number }>;
  onClose: () => void;
}

export function BulkImportModal({ onImport, onClose }: BulkImportModalProps) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    added: number;
    skipped: number;
    invalid: string[];
    duplicates: string[];
  } | null>(null);
  const [error, setError] = useState('');

  async function handleImport() {
    setError('');
    const { valid, invalid, duplicates } = parseBulkImport(input);

    if (valid.length === 0) {
      setError('No valid handles found. Handles must be 1-15 characters, alphanumeric and underscores only.');
      return;
    }

    setLoading(true);
    try {
      const { added, skipped } = await onImport(valid);
      setResult({ added, skipped, invalid, duplicates });
    } catch (err: any) {
      setError(err.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setInput(reader.result as string);
    };
    reader.readAsText(file);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Bulk Import Handles</h3>

        {result ? (
          <div>
            <div className="alert alert-success">
              Added {result.added} accounts. {result.skipped} skipped (already existed).
            </div>
            {result.invalid.length > 0 && (
              <div className="alert alert-warning">
                {result.invalid.length} invalid handle(s) skipped: {result.invalid.slice(0, 5).join(', ')}
                {result.invalid.length > 5 && ` and ${result.invalid.length - 5} more`}
              </div>
            )}
            {result.duplicates.length > 0 && (
              <div className="alert alert-warning">
                {result.duplicates.length} duplicate(s) in input skipped.
              </div>
            )}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={onClose}>Done</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="form-group">
              <label>Upload CSV or text file</label>
              <input type="file" accept=".csv,.txt" onChange={handleFileUpload} />
            </div>
            <div className="form-group">
              <label>Or paste handles (one per line)</label>
              <textarea
                className="form-input"
                rows={8}
                placeholder={"@username1\n@username2\nusername3"}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleImport}
                disabled={loading || !input.trim()}
              >
                {loading ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
