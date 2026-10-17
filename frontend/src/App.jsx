import { useEffect, useState } from 'react';

const API_BASE_URL = 'http://localhost:4000/api';

function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [accountRes, transactionRes] = await Promise.all([
          fetch(`${API_BASE_URL}/accounts?user_id=user_1`),
          fetch(`${API_BASE_URL}/transactions`),
        ]);

        if (!accountRes.ok || !transactionRes.ok) {
          throw new Error('The API is not reachable yet.');
        }

        const accountData = await accountRes.json();
        const transactionData = await transactionRes.json();

        setAccounts(accountData);
        setTransactions(transactionData);
        setStatus('Connected to the API');
      } catch (error) {
        setStatus(error.message || 'Unable to load app data.');
      }
    };

    loadData();
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Smart Expense Budget App</p>
          <h1>Dashboard</h1>
        </div>
        <span className="status-pill">{status}</span>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Accounts</h2>
          {accounts.length === 0 ? (
            <p>No accounts available.</p>
          ) : (
            <ul>
              {accounts.map((account) => (
                <li key={account.account_id}>
                  <strong>{account.account_name}</strong>
                  <span>{account.account_type}</span>
                  <em>₹{Number(account.balance).toFixed(2)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Transactions</h2>
          {transactions.length === 0 ? (
            <p>No transactions available.</p>
          ) : (
            <ul>
              {transactions.map((transaction) => (
                <li key={transaction.transaction_id}>
                  <span>{transaction.type}</span>
                  <strong>{transaction.notes || 'No notes'}</strong>
                  <em>₹{Number(transaction.amount).toFixed(2)}</em>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
