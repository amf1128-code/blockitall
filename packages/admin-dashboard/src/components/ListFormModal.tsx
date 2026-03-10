import { useState, useEffect } from 'react';
import { generateSlug } from '../lib/validation';
import type { List } from '../lib/types';

interface ListFormModalProps {
  list?: List | null;
  onSave: (data: { name: string; slug: string; description: string; is_public: boolean }) => Promise<void>;
  onClose: () => void;
}

export function ListFormModal({ list, onSave, onClose }: ListFormModalProps) {
  const [name, setName] = useState(list?.name || '');
  const [slug, setSlug] = useState(list?.slug || '');
  const [description, setDescription] = useState(list?.description || '');
  const [isPublic, setIsPublic] = useState(list?.is_public ?? true);
  const [autoSlug, setAutoSlug] = useState(!list);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (autoSlug) {
      setSlug(generateSlug(name));
    }
  }, [name, autoSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!slug.trim()) {
      setError('Slug is required.');
      return;
    }

    setLoading(true);
    try {
      await onSave({ name: name.trim(), slug: slug.trim(), description: description.trim(), is_public: isPublic });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save list.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{list ? 'Edit List' : 'Create List'}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              className="form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Porn Bots"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>Slug (URL-safe identifier)</label>
            <input
              className="form-input"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setAutoSlug(false); }}
              placeholder="e.g., porn-bots"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What kind of accounts are on this list?"
            />
          </div>
          <div className="form-group">
            <label className="form-checkbox">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Public (visible to all users)
            </label>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving...' : (list ? 'Update' : 'Create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
