import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchLists,
  fetchAccountsForList,
  addAccountToList,
  bulkAddAccountsToList,
  removeAccountFromList,
} from '../lib/api';
import { AddAccountModal } from '../components/AddAccountModal';
import { BulkImportModal } from '../components/BulkImportModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { List, BlockedAccount } from '../lib/types';
import { Plus, Upload, Trash2, Search, ChevronLeft } from 'lucide-react';

export function ListDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [list, setList] = useState<List | null>(null);
  const [accounts, setAccounts] = useState<(BlockedAccount & { list_membership_created_at: string })[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [removingAccount, setRemovingAccount] = useState<(BlockedAccount & { list_membership_created_at: string }) | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isTestList = slug === 'test-list';

  const loadList = useCallback(async () => {
    const lists = await fetchLists();
    const found = lists.find((l) => l.slug === slug);
    setList(found || null);
    return found;
  }, [slug]);

  const loadAccounts = useCallback(async (listId: string, append = false, cursorVal?: string) => {
    const result = await fetchAccountsForList(listId, {
      cursor: cursorVal,
      search: search || undefined,
    });
    if (append) {
      setAccounts((prev) => [...prev, ...result.data]);
    } else {
      setAccounts(result.data);
    }
    setCursor(result.cursor);
    setHasMore(result.has_more);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    loadList()
      .then((found) => {
        if (found) return loadAccounts(found.id);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  // Reload accounts when search changes (debounced)
  useEffect(() => {
    if (!list) return;
    const timer = setTimeout(() => {
      loadAccounts(list.id).catch(console.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, list]);

  async function handleLoadMore() {
    if (!list || !cursor) return;
    setLoadingMore(true);
    try {
      await loadAccounts(list.id, true, cursor);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleAddAccount(handle: string, reason: string) {
    if (!list) return;
    await addAccountToList(list.id, handle, reason);
    await loadAccounts(list.id);
    await loadList();
    setAlert({ type: 'success', message: `Added @${handle} to the list.` });
  }

  async function handleBulkImport(handles: string[]) {
    if (!list) return { added: 0, skipped: 0 };
    const result = await bulkAddAccountsToList(list.id, handles);
    await loadAccounts(list.id);
    await loadList();
    return result;
  }

  async function handleRemove() {
    if (!list || !removingAccount) return;
    try {
      await removeAccountFromList(list.id, removingAccount.id);
      setRemovingAccount(null);
      await loadAccounts(list.id);
      await loadList();
      setAlert({ type: 'success', message: `Removed @${removingAccount.twitter_handle} from the list.` });
    } catch (err: any) {
      setAlert({ type: 'error', message: err.message });
    }
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!list) {
    return (
      <div className="empty-state">
        <p>List not found.</p>
        <Link to="/lists" className="btn">Back to Lists</Link>
      </div>
    );
  }

  return (
    <div>
      {isTestList && (
        <div className="test-mode-banner">TEST MODE - This is the test list. Do not use for production data.</div>
      )}

      <div style={{ marginBottom: '1rem' }}>
        <Link to="/lists" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Back to Lists
        </Link>
      </div>

      <div className="card-header">
        <div>
          <h1>{list.name}</h1>
          {list.description && <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>{list.description}</p>}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.25rem' }}>
            {list.account_count} accounts &middot; Slug: {list.slug}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn" onClick={() => setShowBulkModal(true)}>
            <Upload size={16} />
            Bulk Import
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            <Plus size={16} />
            Add Account
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert alert-${alert.type}`}>
          {alert.message}
          <button onClick={() => setAlert(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>&times;</button>
        </div>
      )}

      <div className="card">
        <div className="search-bar">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search handles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {accounts.length === 0 ? (
          <div className="empty-state">
            <p>{search ? 'No accounts match your search.' : 'No accounts in this list yet.'}</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Handle</th>
                    <th>Display Name</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Reason</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>@{account.twitter_handle}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{account.display_name || '-'}</td>
                      <td>
                        <span className={`badge badge-${account.status === 'active' ? 'active' : account.status === 'removed' ? 'removed' : 'under-review'}`}>
                          {account.status}
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge-${account.source === 'manual' ? 'manual' : account.source === 'crawler' ? 'crawler' : 'community'}`}>
                          {account.source}
                        </span>
                      </td>
                      <td style={{ color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {account.reason || '-'}
                      </td>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(account.list_membership_created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => setRemovingAccount(account)}
                          title="Remove from list"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="pagination">
                <button className="btn" onClick={handleLoadMore} disabled={loadingMore}>
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <AddAccountModal
          onAdd={handleAddAccount}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {showBulkModal && (
        <BulkImportModal
          onImport={handleBulkImport}
          onClose={() => setShowBulkModal(false)}
        />
      )}

      {removingAccount && (
        <ConfirmDialog
          title="Remove Account"
          message={`Remove @${removingAccount.twitter_handle} from "${list.name}"? The account will remain in the database but will no longer be part of this list.`}
          confirmLabel="Remove"
          danger
          onConfirm={handleRemove}
          onCancel={() => setRemovingAccount(null)}
        />
      )}
    </div>
  );
}
