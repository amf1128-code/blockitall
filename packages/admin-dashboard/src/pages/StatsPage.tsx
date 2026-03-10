import { useEffect, useState } from 'react';
import { fetchStats } from '../lib/api';
import type { BlockAction } from '../lib/types';

export function StatsPage() {
  const [stats, setStats] = useState<{
    totalAccounts: number;
    subscribersByList: { list_id: string; list_name: string; count: number }[];
    recentBlockActions: BlockAction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading-screen"><div className="spinner" /></div>;
  }

  if (!stats) {
    return <div className="empty-state"><p>Failed to load stats.</p></div>;
  }

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Statistics</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.totalAccounts}</div>
          <div className="stat-label">Total Blocked Accounts</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats.subscribersByList.reduce((sum, s) => sum + s.count, 0)}
          </div>
          <div className="stat-label">Total Subscribers</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.recentBlockActions.length}</div>
          <div className="stat-label">Recent Block Actions</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Subscribers by List</h2>
        </div>
        {stats.subscribersByList.length === 0 ? (
          <div className="empty-state"><p>No subscription data yet.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>List</th>
                  <th>Subscribers</th>
                </tr>
              </thead>
              <tbody>
                {stats.subscribersByList.map((s) => (
                  <tr key={s.list_id}>
                    <td>{s.list_name}</td>
                    <td>{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-header">
          <h2>Recent Block Actions</h2>
        </div>
        {stats.recentBlockActions.length === 0 ? (
          <div className="empty-state"><p>No block actions logged yet.</p></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Handle</th>
                  <th>Action</th>
                  <th>Error</th>
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
                    <td style={{ color: 'var(--text-muted)' }}>{action.error_message || '-'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {new Date(action.executed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
