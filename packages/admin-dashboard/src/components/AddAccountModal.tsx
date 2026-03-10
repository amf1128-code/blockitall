import { useState } from 'react';
import { normalizeHandle, isValidHandle } from '../lib/validation';

interface AddAccountModalProps {
  onAdd: (handle: string, reason: string) => Promise<void>;
  onClose: () => void;
}

export function AddAccountModal({ onAdd, onClose }: AddAccountModalProps) {
  const [handle, setHandle] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const normalized = normalizeHandle(handle);
    if (!normalized) {
      setError('Please enter a Twitter handle.');
      return;
    }
    if (!isValidHandle(normalized)) {
      setError('Invalid handle. Must be 1-15 characters, alphanumeric and underscores only.');
      return;
    }

    setLoading(true);
    try {
      await onAdd(normalized, reason);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Add Account to List</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Twitter Handle</label>
            <input
              className="form-input"
              placeholder="@username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Reason (optional)</label>
            <input
              className="form-input"
              placeholder="Why is this account being added?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
