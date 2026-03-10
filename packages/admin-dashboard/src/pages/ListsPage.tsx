import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLists, createList, updateList, deleteList } from '../lib/api';
import { ListFormModal } from '../components/ListFormModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { List } from '../lib/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';

export function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingList, setEditingList] = useState<List | null>(null);
  const [deletingList, setDeletingList] = useState<List | null>(null);
  const [error, setError] = useState('');

  async function loadLists() {
    try {
      const data = await fetchLists();
      setLists(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadLists(); }, []);

  async function handleCreate(data: { name: string; slug: string; description: string; is_public: boolean }) {
    await createList(data);
    await loadLists();
  }

  async function handleUpdate(data: { name: string; slug: string; description: string; is_public: boolean }) {
    if (!editingList) return;
    await updateList(editingList.id, data);
    setEditingList(null);
    await loadLists();
  }

  async function handleDelete() {
    if (!deletingList) return;
    try {
      await deleteList(deletingList.id);
      setDeletingList(null);
      await loadLists();
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  return (
    <div>
      <div className="card-header">
        <h1>Block Lists</h1>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          <Plus size={16} />
          Create List
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {lists.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <p>No block lists yet. Create your first one to get started.</p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Description</th>
                  <th>Accounts</th>
                  <th>Public</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((list) => (
                  <tr key={list.id}>
                    <td>
                      <Link to={`/lists/${list.slug}`}>{list.name}</Link>
                      {list.slug === 'test-list' && (
                        <span className="badge badge-under-review" style={{ marginLeft: '0.5rem' }}>TEST</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{list.slug}</td>
                    <td style={{ color: 'var(--text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {list.description}
                    </td>
                    <td>{list.account_count}</td>
                    <td>{list.is_public ? 'Yes' : 'No'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className="btn btn-sm" onClick={() => setEditingList(list)} title="Edit">
                          <Pencil size={14} />
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => setDeletingList(list)} title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <ListFormModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {editingList && (
        <ListFormModal list={editingList} onSave={handleUpdate} onClose={() => setEditingList(null)} />
      )}

      {deletingList && (
        <ConfirmDialog
          title="Delete List"
          message={`Are you sure you want to delete "${deletingList.name}"? This will remove all account memberships for this list. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeletingList(null)}
        />
      )}
    </div>
  );
}
