import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLists, fetchStats } from '../lib/api';
import type { List, BlockAction } from '../lib/types';

export function DashboardPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [stats, setStats] = useState<{
    totalAccounts: number;
    subscribersByList: { list_id: string; list_name: string; count: number }[];
    recentBlockActions: BlockAction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchLists(), fetchStats()])
      .then(([listsData, statsData]) => {
        setLists(listsData);
        setStats(statsData);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  const totalSubscribers = stats?.subscribersByList.reduce((sum, s) => sum + s.count, 0) || 0;

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{lists.length}</div>
          <div className="stat-label">Block Lists</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalAccounts || 0}</div>
          <div className="stat-label">Blocked Accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalSubscribers}</div>
          <div className="stat-label">Active Subscribers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.recentBlockActions.length || 0}</div>
          <div className="stat-label">Recent Block Actions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Block Lists</h2>
          <Link to="/lists" className="btn btn-sm">View All</Link>
        </div>
        {lists.length === 0 ? (
          <div className="empty-state">
            <p>No block lists yet.</p>
            <Link to="/lists" className="btn btn-primary">Create your first list</Link>
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Accounts</th>
                  <th>Subscribers</th>
                  <th>Public</th>
                </tr>
              </thead>
              <tbody>
                {lists.map((list) => {
                  const subs = stats?.subscribersByList.find((s) => s.list_id === list.id);
                  return (
                    <tr key={list.id}>
                      <td><Link to={`/lists/${list.slug}`}>{list.name}</Link></td>
                      <td style={{ color: 'var(--text-muted)' }}>{list.slug}</td>
                      <td>{list.account_count}</td>
                      <td>{subs?.count || 0}</td>
                      <td>{list.is_public ? 'Yes' : 'No'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stats && stats.recentBlockActions.length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="card-header">
            <h2>Recent Block Actions</h2>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Action</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentBlockActions.map((action) => (
                  <tr key={action.id}>
                    <td>@{action.twitter_handle}</td>
                    <td>
                      <span className={`badge badge-${action.action === 'blocked' ? 'active' : action.action === 'failed' ? 'removed' : 'under-review'}`}>
                        {action.action}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {new Date(action.executed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
