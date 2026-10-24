import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  { to: '/', label: 'Overview', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
];

export function AppLayout() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="SEBM home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SEBM</span>
        </Link>
        <p className="sidebar-label">Workspace</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className={`connection-dot${isAuthenticated ? ' connected' : ''}`} aria-hidden="true" />
          <span>{isAuthenticated ? 'Signed in' : 'Authentication not connected'}</span>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div>
            <p className="eyebrow">Smart Expense &amp; Budget Management</p>
            <h1>Personal finance, in one place</h1>
          </div>
          <span className="environment-badge">Preview</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
