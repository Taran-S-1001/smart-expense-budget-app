import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const formatCurrency = (amount) =>
  `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const initialForm = {
  billName: '',
  amount: '',
  dueDate: '',
  reminderLeadDays: '1',
  status: 'active',
};

export function RemindersPage() {
  const { accessToken } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!accessToken) {
      setReminders([]);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');

    const query = filter !== 'all' ? `?status=${filter}` : '';
    api
      .get(`/reminders${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setReminders(data.reminders || []);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(err.message || 'Failed to load reminders.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [accessToken, filter, refreshVersion]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEdit = (reminder) => {
    setEditingId(reminder.reminderId);
    setForm({
      billName: reminder.billName,
      amount: reminder.amount,
      dueDate: reminder.dueDate,
      reminderLeadDays: String(reminder.reminderLeadDays),
      status: reminder.status,
    });
    setError('');
    setNotice('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(initialForm);
    setError('');
    setNotice('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accessToken) {
      setError('Sign in before managing reminders.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');

    try {
      const payload = {
        billName: form.billName.trim(),
        amount: Number(form.amount),
        dueDate: form.dueDate,
        reminderLeadDays: Number(form.reminderLeadDays),
      };

      if (editingId) {
        payload.status = form.status;
        await api.put(`/reminders/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setNotice('Bill reminder updated.');
      } else {
        await api.post('/reminders', payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setNotice('Bill reminder created.');
      }

      setForm(initialForm);
      setEditingId(null);
      setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleTogglePaid = async (reminder) => {
    if (!accessToken) return;
    const nextStatus = reminder.status === 'paid' ? 'active' : 'paid';

    setError('');
    setNotice('');
    try {
      await api.put(
        `/reminders/${reminder.reminderId}`,
        { status: nextStatus },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      setNotice(`Reminder marked as ${nextStatus}.`);
      setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || 'Failed to update status.');
    }
  };

  const handleDelete = async (reminderId) => {
    if (!accessToken) return;

    setError('');
    setNotice('');
    try {
      await api.delete(`/reminders/${reminderId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setNotice('Reminder deleted.');
      if (editingId === reminderId) {
        handleCancelEdit();
      }
      setRefreshVersion((v) => v + 1);
    } catch (err) {
      setError(err.message || 'Failed to delete reminder.');
    }
  };

  return (
    <div className="reminders-page">
      <section className="content-panel" aria-labelledby="reminders-title">
        <div className="accounts-heading">
          <div>
            <p className="eyebrow">Stay ahead of your bills</p>
            <h2 id="reminders-title">Bill Payment Reminders</h2>
          </div>
          <button
            className="secondary-button"
            disabled={loading || !accessToken}
            onClick={() => setRefreshVersion((v) => v + 1)}
            type="button"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        {!accessToken && (
          <p className="inline-message" role="status">
            <Link to="/login">Sign in</Link> to view or manage bill reminders.
          </p>
        )}
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-message success-message" role="status">
            {notice}
          </p>
        )}

        <form className="account-form" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit bill reminder' : 'Create a bill reminder'}</h3>
          <div className="account-form-grid">
            <label>
              Bill name
              <input
                name="billName"
                onChange={handleChange}
                placeholder="e.g. Electricity, Broadband"
                required
                type="text"
                value={form.billName}
              />
            </label>
            <label>
              Amount (₹)
              <input
                min="0.01"
                name="amount"
                onChange={handleChange}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={form.amount}
              />
            </label>
            <label>
              Due date
              <input
                name="dueDate"
                onChange={handleChange}
                required
                type="date"
                value={form.dueDate}
              />
            </label>
            <label>
              Remind before (days)
              <input
                max="30"
                min="1"
                name="reminderLeadDays"
                onChange={handleChange}
                required
                step="1"
                type="number"
                value={form.reminderLeadDays}
              />
            </label>
            {editingId && (
              <label>
                Status
                <select name="status" onChange={handleChange} value={form.status}>
                  <option value="active">Active</option>
                  <option value="paid">Paid</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <button
              className="primary-button"
              disabled={!accessToken || submitting || loading}
              type="submit"
            >
              {submitting
                ? editingId
                  ? 'Saving…'
                  : 'Creating…'
                : editingId
                ? 'Save changes'
                : 'Create reminder'}
            </button>
            {editingId && (
              <button
                className="secondary-button"
                onClick={handleCancelEdit}
                type="button"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="account-list">
          <div className="account-list-heading" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3>Scheduled reminders</h3>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {['all', 'active', 'paid', 'cancelled'].map((tab) => (
                <button
                  key={tab}
                  className={`secondary-button${filter === tab ? ' active' : ''}`}
                  onClick={() => setFilter(tab)}
                  style={{
                    padding: '0.25rem 0.6rem',
                    fontSize: '0.85rem',
                    fontWeight: filter === tab ? '600' : 'normal',
                  }}
                  type="button"
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {!accessToken ? (
            <p className="empty-state">Your reminders will appear here after you sign in.</p>
          ) : loading ? (
            <p className="empty-state">Loading bill reminders…</p>
          ) : reminders.length === 0 ? (
            <p className="empty-state">No bill reminders found. Create one above.</p>
          ) : (
            <ul className="budget-list" style={{ listStyle: 'none', padding: 0 }}>
              {reminders.map((reminder) => {
                const isPaid = reminder.status === 'paid';
                const isCancelled = reminder.status === 'cancelled';
                return (
                  <li
                    className="budget-item"
                    key={reminder.reminderId}
                    style={{
                      opacity: isPaid || isCancelled ? 0.75 : 1,
                      borderLeft: isPaid
                        ? '4px solid #10b981'
                        : isCancelled
                        ? '4px solid #6b7280'
                        : '4px solid #3b82f6',
                    }}
                  >
                    <div className="budget-item-heading">
                      <div>
                        <strong>{reminder.billName}</strong>
                        <span
                          style={{
                            marginLeft: '0.5rem',
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            background: isPaid ? '#d1fae5' : isCancelled ? '#e5e7eb' : '#dbeafe',
                            color: isPaid ? '#065f46' : isCancelled ? '#374151' : '#1e40af',
                            textTransform: 'uppercase',
                            fontWeight: '600',
                          }}
                        >
                          {reminder.status}
                        </span>
                      </div>
                      <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>
                        {formatCurrency(reminder.amount)}
                      </span>
                    </div>

                    <div
                      className="budget-item-footer"
                      style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}
                    >
                      <span>Due date: <strong>{reminder.dueDate}</strong></span>
                      <span>
                        Remind {reminder.reminderLeadDays} day(s) before
                      </span>
                    </div>

                    <div
                      style={{
                        marginTop: '0.25rem',
                        fontSize: '0.8rem',
                        color: reminder.lastNotifiedAt ? '#059669' : '#6b7280',
                      }}
                    >
                      {reminder.lastNotifiedAt
                        ? `✓ Notified on ${new Date(reminder.lastNotifiedAt).toLocaleDateString()}`
                        : '⏱ Notification pending'}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginTop: '0.75rem',
                        borderTop: '1px solid #f3f4f6',
                        paddingTop: '0.5rem',
                      }}
                    >
                      <button
                        className="secondary-button"
                        onClick={() => handleTogglePaid(reminder)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                        type="button"
                      >
                        {isPaid ? 'Reopen' : 'Mark as Paid'}
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => handleEdit(reminder)}
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => handleDelete(reminder.reminderId)}
                        style={{
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.8rem',
                          color: '#dc2626',
                        }}
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
