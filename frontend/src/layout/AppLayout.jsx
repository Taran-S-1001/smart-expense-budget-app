import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const navigation = [
  { to: '/', label: 'Overview', end: true },
  { to: '/accounts', label: 'Accounts' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/budgets', label: 'Budgets' },
  { to: '/admin/categories', label: 'Admin' },
];

export function AppLayout() {
  const { isAuthenticated, user, clearUser } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="SEBM home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SEBM</span>
        </Link>
        <p className="sidebar-label">Workspace</p>
        <nav aria-label="Main navigation">
          {navigation
            .filter(({ to }) => to !== '/admin/categories' || user?.role === 'admin')
            .map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {label}
              </NavLink>
            ))}
          {!isAuthenticated && (
            <>
              <NavLink
                to="/login"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                Sign in
              </NavLink>
              <NavLink
                to="/register"
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                Create account
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className={`connection-dot${isAuthenticated ? ' connected' : ''}`} aria-hidden="true" />
          {isAuthenticated ? (
            <>
              <span>{user?.name || 'Signed in'}</span>
              <button className="logout-button" onClick={clearUser} type="button">Sign out</button>
            </>
          ) : (
            <span>Sign in to connect</span>
          )}
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
