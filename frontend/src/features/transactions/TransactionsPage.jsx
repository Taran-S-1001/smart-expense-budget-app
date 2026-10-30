import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const localDate = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const formatAmount = (amount) =>
  `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const sortTransactions = (transactions) =>
  [...transactions].sort((first, second) => {
    const dateOrder = second.date.localeCompare(first.date);
    return dateOrder || String(second.createdAt).localeCompare(String(first.createdAt));
  });

export function TransactionsPage() {
  const { accessToken } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dataToken, setDataToken] = useState(null);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDate);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestControllers = useRef(new Set());
  // Only one create/edit/delete runs at a time, so account balances from overlapping
  // responses can never be applied out of order. The ref blocks double clicks that land
  // before React re-renders the disabled buttons.
  const writeInFlight = useRef(false);

  const visibleCategories = dataToken === accessToken ? categories : [];
  const availableCategories = useMemo(
    () => visibleCategories.filter((category) => category.type === type),
    [visibleCategories, type],
  );
  const visibleAccounts = dataToken === accessToken ? accounts : [];
  const visibleTransactions = dataToken === accessToken ? transactions : [];
  const accountNames = useMemo(
    () => new Map(visibleAccounts.map((account) => [account.accountId, account.accountName])),
    [visibleAccounts],
  );
  const categoryNames = useMemo(
    () => new Map(visibleCategories.map((category) => [category.categoryId, category.name])),
    [visibleCategories],
  );

  useEffect(() => {
    if (!accessToken) {
      setAccounts([]);
      setCategories([]);
      setTransactions([]);
      setDataToken(null);
      setAccountId('');
      setCategoryId('');
      setLoading(false);
      setSubmitting(false);
      setDeletingId(null);
      setEditingId(null);
      return undefined;
    }

    const controller = new AbortController();
    requestControllers.current.add(controller);
    setLoading(true);
    setSubmitting(false);
    setDeletingId(null);
    setError('');

    const options = {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    };

    Promise.all([
      api.get('/accounts', options),
      api.get('/transactions/categories', options),
      api.get('/transactions', options),
    ])
      .then(([accountsResponse, categoriesResponse, transactionsResponse]) => {
        if (controller.signal.aborted) return;
        setAccounts(accountsResponse.accounts);
        setCategories(categoriesResponse.categories);
        setTransactions(transactionsResponse.transactions);
        setDataToken(accessToken);
        setAccountId((current) =>
          accountsResponse.accounts.some((account) => account.accountId === current)
            ? current
            : accountsResponse.accounts[0]?.accountId || '',
        );
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message);
      })
      .finally(() => {
        requestControllers.current.delete(controller);
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      for (const activeController of requestControllers.current) {
        activeController.abort();
      }
      requestControllers.current.clear();
    };
  }, [accessToken, refreshVersion]);

  useEffect(() => {
    if (!availableCategories.some((category) => category.categoryId === categoryId)) {
      setCategoryId(availableCategories[0]?.categoryId || '');
    }
  }, [availableCategories, categoryId]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!accessToken) {
      setError('Sign in before recording a transaction.');
      return;
    }

    if (writeInFlight.current) return;
    writeInFlight.current = true;
    setSubmitting(true);
    setError('');
    setNotice('');
    const controller = new AbortController();
    requestControllers.current.add(controller);

    try {
      const payload = {
        accountId,
        categoryId,
        amount: Number(amount),
        type,
        date,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const requestOptions = {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      };
      const transaction = editingId
        ? await api.put(`/transactions/${editingId}`, payload, requestOptions)
        : await api.post('/transactions', payload, requestOptions);
      if (controller.signal.aborted) return;

      setTransactions((current) =>
        sortTransactions([
          transaction,
          ...current.filter((item) => item.transactionId !== transaction.transactionId),
        ]),
      );
      setAccounts((current) =>
        current.map((account) => {
          if (account.accountId === transaction.accountId) {
            return { ...account, balance: transaction.newBalance };
          }
          if (account.accountId === transaction.previousAccountId) {
            return { ...account, balance: transaction.previousAccountBalance };
          }
          return account;
        }),
      );
      setAmount('');
      setNotes('');
      setNotice(editingId ? 'Transaction updated.' : 'Transaction recorded.');
      setEditingId(null);
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      writeInFlight.current = false;
      if (!controller.signal.aborted) setSubmitting(false);
    }
  };

  const startEditing = (transaction) => {
    setError('');
    setNotice('');
    setEditingId(transaction.transactionId);
    setType(transaction.type);
    setAccountId(transaction.accountId);
    setCategoryId(transaction.categoryId);
    setAmount(String(transaction.amount));
    setDate(transaction.date);
    setNotes(transaction.notes || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setAmount('');
    setNotes('');
    setDate(localDate());
  };

  const handleDelete = async (transaction) => {
    if (!accessToken || writeInFlight.current) return;
    if (!window.confirm('Delete this transaction? The account balance will be adjusted.')) return;

    writeInFlight.current = true;
    setDeletingId(transaction.transactionId);
    setError('');
    setNotice('');
    const controller = new AbortController();
    requestControllers.current.add(controller);

    try {
      const result = await api.delete(`/transactions/${transaction.transactionId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setTransactions((current) =>
        current.filter((item) => item.transactionId !== transaction.transactionId),
      );
      setAccounts((current) =>
        current.map((account) =>
          account.accountId === result.accountId
            ? { ...account, balance: result.newBalance }
            : account,
        ),
      );
      if (editingId === transaction.transactionId) cancelEditing();
      setNotice('Transaction deleted.');
    } catch (requestError) {
      if (!controller.signal.aborted) setError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      writeInFlight.current = false;
      if (!controller.signal.aborted) setDeletingId(null);
    }
  };

  const handleCreateCategory = async (event) => {
    event.preventDefault();
    if (!accessToken) {
      setCategoryError('Sign in before adding a category.');
      return;
    }

    const name = newCategoryName.trim();
    if (!name) return;

    setCreatingCategory(true);
    setCategoryError('');
    setError('');
    setNotice('');
    const controller = new AbortController();
    requestControllers.current.add(controller);

    try {
      const response = await api.post('/transactions/categories', { name, type }, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      setCategories((current) => [...current, response.category]);
      setCategoryId(response.category.categoryId);
      setNewCategoryName('');
      setNotice(`Category "${response.category.name}" added.`);
    } catch (requestError) {
      if (!controller.signal.aborted) setCategoryError(requestError.message);
    } finally {
      requestControllers.current.delete(controller);
      if (!controller.signal.aborted) setCreatingCategory(false);
    }
  };

  const rowActionsDisabled = submitting || deletingId !== null;

  const canSubmit = Boolean(
    accessToken &&
    accountId &&
    categoryId &&
    visibleAccounts.length > 0 &&
    availableCategories.length > 0,
  );

  return (
    <div className="transactions-page">
      <section className="content-panel" aria-labelledby="transactions-title">
        <div className="accounts-heading">
          <div>
            <p className="eyebrow">Income and spending</p>
            <h2 id="transactions-title">Transactions</h2>
          </div>
          <button
            className="secondary-button"
            disabled={loading || !accessToken}
            onClick={() => setRefreshVersion((version) => version + 1)}
            type="button"
          >
            Refresh
          </button>
        </div>

        {!accessToken && (
          <p className="inline-message" role="status">
            Sign in to view or record transactions. <Link to="/login">Sign in</Link>
          </p>
        )}
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {notice && <p className="form-message success-message" role="status">{notice}</p>}

        {accessToken && (
          <form aria-label={editingId ? 'Edit a transaction' : 'Record a transaction'} className="transaction-form" onSubmit={handleSubmit}>
            <h3>{editingId ? 'Edit transaction' : 'Record a transaction'}</h3>
            <div className="transaction-form-grid">
              <label>
                Type
                <select
                  name="type"
                  onChange={(event) => setType(event.target.value)}
                  value={type}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </label>
              <label>
                Account
                <select
                  name="accountId"
                  onChange={(event) => setAccountId(event.target.value)}
                  required
                  value={accountId}
                >
                  <option value="">Choose an account</option>
                  {visibleAccounts.map((account) => (
                    <option key={account.accountId} value={account.accountId}>
                      {account.accountName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  onChange={(event) => setCategoryId(event.target.value)}
                  required
                  value={categoryId}
                >
                  <option value="">Choose a category</option>
                  {availableCategories.map((category) => (
                    <option key={category.categoryId} value={category.categoryId}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Amount
                <input
                  min="0.01"
                  name="amount"
                  onChange={(event) => setAmount(event.target.value)}
                  required
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </label>
              <label>
                Date
                <input
                  name="date"
                  onChange={(event) => setDate(event.target.value)}
                  required
                  type="date"
                  value={date}
                />
              </label>
              <label>
                Notes <span className="field-note">(optional)</span>
                <input
                  maxLength={1000}
                  name="notes"
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </label>
            </div>
            {visibleAccounts.length === 0 && !loading && (
              <p className="empty-state">
                Create an account before recording transactions. <Link to="/accounts">Go to accounts</Link>
              </p>
            )}
            {availableCategories.length === 0 && !loading && (
              <p className="empty-state">No categories are available for this transaction type.</p>
            )}
            <button className="primary-button" disabled={!canSubmit || submitting || deletingId !== null || loading} type="submit">
              {submitting ? 'Saving…' : editingId ? 'Update transaction' : 'Save transaction'}
            </button>
            {editingId && (
              <button className="secondary-button" disabled={submitting || deletingId !== null} onClick={cancelEditing} type="button">
                Cancel edit
              </button>
            )}
          </form>
        )}

        {accessToken && (
          <form aria-label="Add a custom category" className="transaction-form" onSubmit={handleCreateCategory}>
            <h3>Add a custom category</h3>
            {categoryError && <p className="form-message error-message" role="alert">{categoryError}</p>}
            <div className="transaction-form-grid">
              <label>
                {type === 'income' ? 'New income category' : 'New expense category'}
                <input
                  maxLength={100}
                  name="newCategoryName"
                  onChange={(event) => setNewCategoryName(event.target.value)}
                  required
                  value={newCategoryName}
                />
              </label>
            </div>
            <button
              className="secondary-button"
              disabled={creatingCategory || loading || !newCategoryName.trim()}
              type="submit"
            >
              {creatingCategory ? 'Adding…' : 'Add category'}
            </button>
          </form>
        )}

        <div className="transaction-list">
          <div className="account-list-heading">
            <h3>Recent activity</h3>
            <span>{visibleTransactions.length} {visibleTransactions.length === 1 ? 'transaction' : 'transactions'}</span>
          </div>
          {!accessToken ? (
            <p className="empty-state">Your transactions will appear here after you sign in.</p>
          ) : loading ? (
            <p className="empty-state">Loading transactions…</p>
          ) : visibleTransactions.length === 0 ? (
            <p className="empty-state">No transactions yet. Record one above to get started.</p>
          ) : (
            <div className="transaction-table-wrapper">
              <table className="transaction-table">
                <thead>
                  <tr>
                    <th scope="col">Transaction</th>
                    <th scope="col">Account</th>
                    <th scope="col">Date</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTransactions.map((transaction) => (
                    <tr key={transaction.transactionId}>
                      <td>
                        <strong>{categoryNames.get(transaction.categoryId) || 'Category'}</strong>
                        {transaction.notes && <span className="transaction-notes">{transaction.notes}</span>}
                      </td>
                      <td>{accountNames.get(transaction.accountId) || 'Account'}</td>
                      <td>{transaction.date}</td>
                      <td className={`transaction-amount ${transaction.type}`}>
                        {transaction.type === 'income' ? '+' : '−'}{formatAmount(transaction.amount)}
                      </td>
                      <td className="transaction-actions">
                        <button
                          aria-label={`Edit ${categoryNames.get(transaction.categoryId) || 'transaction'} on ${transaction.date}`}
                          className="secondary-button"
                          disabled={rowActionsDisabled}
                          onClick={() => startEditing(transaction)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          aria-label={`Delete ${categoryNames.get(transaction.categoryId) || 'transaction'} on ${transaction.date}`}
                          className="secondary-button"
                          disabled={rowActionsDisabled}
                          onClick={() => handleDelete(transaction)}
                          type="button"
                        >
                          {deletingId === transaction.transactionId ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
