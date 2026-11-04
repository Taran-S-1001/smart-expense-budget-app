import { Link } from 'react-router-dom';

const modules = [
  {
    title: 'Accounts',
    description: 'Manage your cash, bank, and wallet accounts.',
    to: '/accounts',
    symbol: 'A',
  },
  {
    title: 'Transactions',
    description: 'Record and review your income and expenses.',
    to: '/transactions',
    symbol: 'T',
  },
  {
    title: 'Budgets',
    description: 'Set monthly limits and track spending progress.',
    to: '/budgets',
    symbol: 'B',
  },
  {
    title: 'Bill Reminders',
    description: 'Schedule upcoming bill payments and reminders.',
    to: '/reminders',
    symbol: 'R',
  },
];

export function DashboardPage() {
  return (
    <>
      <section className="welcome-panel" aria-labelledby="welcome-title">
        <div>
          <p className="eyebrow">Your money, made clearer</p>
          <h2 id="welcome-title">Welcome to your finance workspace</h2>
          <p className="welcome-copy">
            A single place to organize accounts, track transactions, and build
            healthy spending habits.
          </p>
        </div>
        <span className="welcome-art" aria-hidden="true">₹</span>
      </section>

      <section className="section-block" aria-labelledby="modules-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Get started</p>
            <h2 id="modules-title">Your workspace</h2>
          </div>
          <span className="section-note">Core modules</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <Link className="module-card" key={module.title} to={module.to}>
              <span className="module-icon" aria-hidden="true">{module.symbol}</span>
              <span className="module-card-copy">
                <strong>{module.title}</strong>
                <span>{module.description}</span>
              </span>
              <span className="card-arrow" aria-hidden="true">↗</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
