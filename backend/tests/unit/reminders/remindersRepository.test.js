const RemindersRepository = require('../../../src/reminders/remindersRepository');

const fakeRow = {
  reminder_id: 'rem-001',
  user_id: 'usr-001',
  bill_name: 'Internet Fiber',
  amount: '999.50',
  due_date: new Date('2026-11-15T00:00:00Z'),
  reminder_lead_days: 2,
  status: 'cancelled',
  last_notified_at: null,
  last_notified_due_date: null,
  created_at: new Date('2026-11-01T00:00:00Z'),
  updated_at: new Date('2026-11-10T00:00:00Z'),
};

/**
 * Count how many times a column is assigned in the SET clause of the
 * generated UPDATE. Postgres rejects an UPDATE that assigns the same
 * column twice ("multiple assignments to same column"), so every column
 * must appear exactly once.
 */
const setAssignments = (sql) => {
  const setClause = sql.slice(sql.indexOf('SET'), sql.indexOf('WHERE'));
  return setClause
    .split(',')
    .map((part) => part.trim().split(/\s*=\s*/)[0].trim())
    .filter(Boolean);
};

describe('RemindersRepository.updateReminder (Unit — SEBM-F-051, TC-Notif-02)', () => {
  let mockDb;
  let repository;

  beforeEach(() => {
    mockDb = {
      query: jest.fn().mockResolvedValue({ rows: [fakeRow] }),
    };
    repository = new RemindersRepository(mockDb);
  });

  it('assigns each column exactly once when the edit form saves all fields together', async () => {
    // This is the exact payload the frontend edit form sends (RemindersPage):
    // due date and lead days are always included, plus the chosen status.
    await repository.updateReminder('rem-001', {
      billName: 'Internet Fiber',
      amount: '999.50',
      dueDate: '2026-11-20',
      reminderLeadDays: 3,
      status: 'cancelled',
    });

    const sql = mockDb.query.mock.calls[0][0];
    const columns = setAssignments(sql);
    const duplicates = columns.filter((col, i) => columns.indexOf(col) !== i);

    expect(duplicates).toEqual([]);
    expect(columns.filter((col) => col === 'last_notified_at')).toHaveLength(1);
    expect(columns.filter((col) => col === 'last_notified_due_date')).toHaveLength(1);
  });

  it('resets notification tracking once when both due date and lead days change', async () => {
    await repository.updateReminder('rem-001', {
      dueDate: '2026-11-20',
      reminderLeadDays: 3,
    });

    const sql = mockDb.query.mock.calls[0][0];
    const nullResets = sql.match(/last_notified_at = NULL/g) || [];
    expect(nullResets).toHaveLength(1);
    expect(sql).toContain('last_notified_due_date = NULL');
  });

  it('still resets notification tracking when only the due date changes', async () => {
    await repository.updateReminder('rem-001', { dueDate: '2026-11-20' });

    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('last_notified_at = NULL');
    expect(sql).toContain('last_notified_due_date = NULL');
  });

  it('still resets notification tracking when only the lead days change', async () => {
    await repository.updateReminder('rem-001', { reminderLeadDays: 5 });

    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toContain('last_notified_at = NULL');
    expect(sql).toContain('last_notified_due_date = NULL');
  });

  it('does not reset notification tracking for a status-only update', async () => {
    await repository.updateReminder('rem-001', { status: 'paid' });

    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).not.toContain('last_notified_at = NULL');
    expect(sql).toContain('status = $1');
  });

  it('an explicit notification-state value wins over the schedule reset', async () => {
    await repository.updateReminder('rem-001', {
      dueDate: '2026-11-20',
      lastNotifiedAt: '2026-11-10T09:00:00.000Z',
    });

    const sql = mockDb.query.mock.calls[0][0];
    const columns = setAssignments(sql);
    const duplicates = columns.filter((col, i) => columns.indexOf(col) !== i);

    expect(duplicates).toEqual([]);
    expect(sql).not.toContain('last_notified_at = NULL');
    expect(sql).toContain('last_notified_at = $');
  });
});
