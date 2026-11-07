import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

export function AccountsPage() {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [accountsToken, setAccountsToken] = useState(null);
  const [accountType, setAccountType] = useState('cash');
  const [accountName, setAccountName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const requestControllers = useRef(new Set());
  const transferSelectionRef = useRef({ from: '', to: '' });
  transferSelectionRef.current = { from: fromAccountId, to: toAccountId };

  // Keep the transfer selectors pointing at real, different accounts in the list.
  const resolveTransferSelection = (accountsList, currentFrom, currentTo) => {
    const from = accountsList.some((account) => account.accountId === currentFrom)
      ? currentFrom
      : accountsList[0]?.accountId || '';
    const to =
      currentTo &&
      currentTo !== from &&
      accountsList.some((account) => account.accountId === currentTo)
        ? currentTo
        : accountsList.find((account) => account.accountId !== from)?.accountId || '';
    return { from, to };
  };

  const loadAccounts = useCallback(async () => {
    if (!accessToken) {
      setAccounts([]);
      setAccountsToken(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    requestControllers.current.add(controller);
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setAccounts(response.accounts);
        setAccountsToken(accessToken);
        const selection = resolveTransferSelection(
          response.accounts,
          transferSelectionRef.current.from,
          transferSelectionRef.current.to,
        );
        setFromAccountId(selection.from);
        setToAccountId(selection.to);
      }
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    setSubmitting(false);
    loadAccounts();
    return () => {
      for (const controller of requestControllers.current) {
        controller.abort();
      }
      requestControllers.current.clear();
    };
  }, [loadAccounts]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!accessToken) {
      setError('Sign in before creating an account.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    requestControllers.current.add(controller);
    try {
      const payload = { accountType, accountName };
      if (openingBalance !== '') payload.openingBalance = Number(openingBalance);

      const response = await api.post('/accounts', payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const nextAccounts = [response.account, ...accounts];
      setAccounts(nextAccounts);
      setAccountsToken(accessToken);
      // Creating an account can leave both selectors holding the same id (e.g. the
      // second account added while only one existed); retarget them on the new list.
      const selection = resolveTransferSelection(nextAccounts, fromAccountId, toAccountId);
      setFromAccountId(selection.from);
      setToAccountId(selection.to);
      setAccountName('');
      setOpeningBalance('');
      setNotice('Account created.');
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  const visibleAccounts = accountsToken === accessToken ? accounts : [];

  const handleFromAccountChange = (accountId) => {
    setFromAccountId(accountId);
    setToAccountId((current) => {
      if (current && current !== accountId) return current;
      const fallback = visibleAccounts.find((account) => account.accountId !== accountId);
      return fallback ? fallback.accountId : '';
    });
  };

  const handleTransfer = async (event) => {
    event.preventDefault();
    if (!accessToken) {
      setTransferError('Sign in before making a transfer.');
      return;
    }
    if (!fromAccountId || !toAccountId) {
      setTransferError('Choose a source and a destination account.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setTransferError('Source and destination accounts must be different.');
      return;
    }

    setTransferring(true);
    setTransferError('');
    setTransferNotice('');
    const controller = new AbortController();
    requestControllers.current.add(controller);
    try {
      await api.post(
        '/accounts/transfer',
        { fromAccountId, toAccountId, amount: Number(transferAmount) },
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        },
      );
      if (controller.signal.aborted) return;
      setTransferAmount('');
      setTransferNotice('Transfer complete. Balances updated.');
      loadAccounts();
    } catch (requestError) {
      if (!controller.signal.aborted) setTransferError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      if (!controller.signal.aborted) setTransferring(false);
    }
  };

  return (
    <div className="accounts-page">
      <section className="content-panel" aria-labelledby="accounts-title">
        <div className="accounts-heading">
          <div>
            <p className="eyebrow">Your money sources</p>
            <h2 id="accounts-title">Accounts</h2>
          </div>
          <button className="secondary-button" type="button" onClick={loadAccounts} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {!accessToken && (
          <p className="inline-message" role="status">
            <Link to="/login">Sign in</Link> to view or create your accounts.
          </p>
        )}
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {notice && <p className="form-message success-message" role="status">{notice}</p>}

        <form className="account-form" onSubmit={handleSubmit}>
          <h3>Add an account</h3>
          <div className="account-form-grid">
            <label>
              Account name
              <input
                autoComplete="organization"
                maxLength={100}
                name="accountName"
                onChange={(event) => setAccountName(event.target.value)}
                placeholder="e.g. Everyday checking"
                required
                value={accountName}
              />
            </label>
            <label>
              Account type
              <select
                name="accountType"
                onChange={(event) => setAccountType(event.target.value)}
                value={accountType}
              >
                <option value="cash">Cash</option>
                <option value="bank">Bank</option>
                <option value="digital wallet">Digital wallet</option>
              </select>
            </label>
            <label>
              Opening balance <span className="field-note">(optional)</span>
              <input
                inputMode="decimal"
                min="0"
                name="openingBalance"
                onChange={(event) => setOpeningBalance(event.target.value)}
                placeholder="0.00"
                step="0.01"
                type="number"
                value={openingBalance}
              />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={submitting || !accessToken}>
            {submitting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        {accessToken && (
          <form className="account-form transfer-form" onSubmit={handleTransfer}>
            <h3>Transfer between accounts</h3>
            {transferError && (
              <p className="form-message error-message" role="alert">{transferError}</p>
            )}
            {transferNotice && (
              <p className="form-message success-message" role="status">{transferNotice}</p>
            )}
            {visibleAccounts.length < 2 ? (
              <p className="empty-state">
                Create at least two accounts to transfer money between them.
              </p>
            ) : (
              <>
                <div className="account-form-grid">
                  <label>
                    From account
                    <select
                      name="fromAccountId"
                      onChange={(event) => handleFromAccountChange(event.target.value)}
                      value={fromAccountId}
                    >
                      {visibleAccounts.map((account) => (
                        <option key={account.accountId} value={account.accountId}>
                          {account.accountName} (₹
                          {Number(account.balance).toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                          )
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To account
                    <select
                      name="toAccountId"
                      onChange={(event) => setToAccountId(event.target.value)}
                      value={toAccountId}
                    >
                      {visibleAccounts
                        .filter((account) => account.accountId !== fromAccountId)
                        .map((account) => (
                          <option key={account.accountId} value={account.accountId}>
                            {account.accountName} (₹
                            {Number(account.balance).toLocaleString('en-IN', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                            )
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Amount
                    <input
                      inputMode="decimal"
                      min="0.01"
                      name="transferAmount"
                      onChange={(event) => setTransferAmount(event.target.value)}
                      placeholder="0.00"
                      required
                      step="0.01"
                      type="number"
                      value={transferAmount}
                    />
                  </label>
                </div>
                <button className="primary-button" disabled={transferring} type="submit">
                  {transferring ? 'Transferring…' : 'Transfer'}
                </button>
              </>
            )}
          </form>
        )}

        <div className="account-list" aria-live="polite">
          <div className="account-list-heading">
            <h3>Your accounts</h3>
            <span>{visibleAccounts.length} {visibleAccounts.length === 1 ? 'account' : 'accounts'}</span>
          </div>
          {!accessToken ? (
            <p className="empty-state">Your accounts will appear here after you sign in.</p>
          ) : loading ? (
            <p className="empty-state">Loading accounts…</p>
          ) : visibleAccounts.length === 0 ? (
            <p className="empty-state">
              No accounts yet. Create one above to get started.
            </p>
          ) : (
            <ul className="account-list-items">
              {visibleAccounts.map((account) => (
                <li className="account-list-item" key={account.accountId}>
                  <span className="account-avatar" aria-hidden="true">
                    {account.accountName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="account-details">
                    <strong>{account.accountName}</strong>
                    <span>{account.accountType}</span>
                  </span>
                  <strong className="account-balance">
                    ₹{Number(account.balance).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
