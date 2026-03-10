import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { LayoutDashboard, List, BarChart3, LogOut } from 'lucide-react';

export function Layout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>BlockItAll</h1>
          <span>Admin Dashboard</span>
        </div>
        <nav>
          <ul className="sidebar-nav">
            <li>
              <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                <LayoutDashboard size={18} />
                Dashboard
              </NavLink>
            </li>
            <li>
              <NavLink to="/lists" className={({ isActive }) => isActive ? 'active' : ''}>
                <List size={18} />
                Block Lists
              </NavLink>
            </li>
            <li>
              <NavLink to="/stats" className={({ isActive }) => isActive ? 'active' : ''}>
                <BarChart3 size={18} />
                Stats
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className="sidebar-footer">
          <div className="user-email">{user?.email}</div>
          <button className="btn btn-sm" onClick={signOut}>
            <LogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
