import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { TransactionsPage } from './TransactionsPage';

vi.mock('../../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const accounts = {
  accounts: [
    { accountId: 'account-1', accountName: 'Daily account', balance: 500, accountType: 'bank' },
    { accountId: 'account-2', accountName: 'Savings', balance: 50, accountType: 'bank' },
  ],
};
const categories = {
  categories: [
    { categoryId: 'category-groceries', name: 'Groceries', type: 'expense' },
    { categoryId: 'category-salary', name: 'Salary', type: 'income' },
  ],
};
const transactions = {
  transactions: [{
    transactionId: 'transaction-existing',
    accountId: 'account-1',
    categoryId: 'category-groceries',
    amount: 12.5,
    type: 'expense',
    date: '2026-10-27',
    notes: 'Coffee',
    createdAt: '2026-10-27T09:00:00.000Z',
  }],
};

function SignIn() {
  const { setUser, setAccessToken } = useAuth();
  return (
    <button onClick={() => { setUser({ userId: 'user-1' }); setAccessToken('test-token'); }} type="button">
      Sign in
    </button>
  );
}

async function openPage() {
  const user = userEvent.setup();
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve(accounts);
    if (path === '/transactions/categories') return Promise.resolve(categories);
    if (path === '/transactions') return Promise.resolve(transactions);
    throw new Error(`Unexpected API path: ${path}`);
  });
  render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider><SignIn /><TransactionsPage /></AuthProvider>
    </MemoryRouter>,
  );
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Coffee')).toBeTruthy();
  return user;
}

describe('TransactionsPage edit and delete (SEBM-F-011, TC-Exp-02)', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  it('loads a transaction into the form and saves the edit with PUT', async () => {
    const user = await openPage();
    api.put.mockResolvedValue({
      ...transactions.transactions[0],
      amount: 20,
      notes: 'Coffee',
      newBalance: 492.5,
    });

    await user.click(screen.getByRole('button', { name: 'Edit Groceries on 2026-10-27' }));
    expect(screen.getByLabelText('Amount').value).toBe('12.5');
    await user.clear(screen.getByLabelText('Amount'));
    await user.type(screen.getByLabelText('Amount'), '20');
    await user.click(screen.getByRole('button', { name: 'Update transaction' }));

    expect(await screen.findByText('Transaction updated.')).toBeTruthy();
    expect(api.put).toHaveBeenCalledWith(
      '/transactions/transaction-existing',
      {
        accountId: 'account-1', categoryId: 'category-groceries', amount: 20,
        type: 'expense', date: '2026-10-27', notes: 'Coffee',
      },
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('−₹20.00')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel edit' })).toBeNull();
  });

  it('updates both balances when a transaction moves to another account', async () => {
    const user = await openPage();
    api.put.mockResolvedValue({
      ...transactions.transactions[0],
      accountId: 'account-2',
      newBalance: 37.5,
      previousAccountId: 'account-1',
      previousAccountBalance: 512.5,
    });
    await user.click(screen.getByRole('button', { name: 'Edit Groceries on 2026-10-27' }));
    await user.selectOptions(screen.getByLabelText('Account'), 'account-2');
    await user.click(screen.getByRole('button', { name: 'Update transaction' }));
    expect(await screen.findByText('Transaction updated.')).toBeTruthy();
    expect(api.put).toHaveBeenCalledWith(
      '/transactions/transaction-existing',
      expect.objectContaining({ accountId: 'account-2' }),
      expect.anything(),
    );
    expect(screen.getByText('Savings', { selector: 'td' })).toBeTruthy();
  });

  it('cancels an edit without calling the API', async () => {
    const user = await openPage();
    await user.click(screen.getByRole('button', { name: 'Edit Groceries on 2026-10-27' }));
    await user.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(api.put).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save transaction' })).toBeTruthy();
  });

  it('shows the server error when an edit is rejected', async () => {
    const user = await openPage();
    api.put.mockRejectedValue(new Error('Transaction not found.'));
    await user.click(screen.getByRole('button', { name: 'Edit Groceries on 2026-10-27' }));
    await user.click(screen.getByRole('button', { name: 'Update transaction' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Transaction not found.');
  });

  it('deletes after confirmation and removes the row', async () => {
    const user = await openPage();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockResolvedValue({ transactionId: 'transaction-existing', accountId: 'account-1', newBalance: 512.5 });

    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-27' }));

    expect(await screen.findByText('Transaction deleted.')).toBeTruthy();
    expect(api.delete).toHaveBeenCalledWith(
      '/transactions/transaction-existing',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    await waitFor(() => expect(screen.queryByText('Coffee')).toBeNull());
  });

  it('does nothing when the delete is not confirmed', async () => {
    const user = await openPage();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-27' }));
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByText('Coffee')).toBeTruthy();
  });
});

describe('TransactionsPage overlapping writes (PR review: stale balance)', () => {
  afterEach(() => cleanup());
  beforeEach(() => vi.clearAllMocks());

  const twoTransactions = {
    transactions: [
      { ...transactions.transactions[0] },
      { ...transactions.transactions[0], transactionId: 'transaction-second', amount: 7, notes: 'Tea', date: '2026-10-26' },
    ],
  };

  async function openWithTwo() {
    const user = userEvent.setup();
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve(accounts);
      if (path === '/transactions/categories') return Promise.resolve(categories);
      if (path === '/transactions') return Promise.resolve(twoTransactions);
      throw new Error(`Unexpected API path: ${path}`);
    });
    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider><SignIn /><TransactionsPage /></AuthProvider>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Tea')).toBeTruthy();
    return user;
  }

  it('disables every Edit, Delete and save control while a delete is in flight', async () => {
    const user = await openWithTwo();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish;
    api.delete.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-27' }));

    for (const button of screen.getAllByRole('button', { name: /^(Edit|Delete) / })) {
      expect(button.disabled).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Save transaction' }).disabled).toBe(true);

    // A second delete attempt does not reach the API.
    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-26' }));
    expect(api.delete).toHaveBeenCalledTimes(1);

    finish({ transactionId: 'transaction-existing', accountId: 'account-1', newBalance: 512.5 });
    expect(await screen.findByText('Transaction deleted.')).toBeTruthy();
    await waitFor(() => {
      for (const button of screen.getAllByRole('button', { name: /^(Edit|Delete) / })) {
        expect(button.disabled).toBe(false);
      }
    });
  });

  it('applies two deletes one after the other so the last balance shown is the latest', async () => {
    const user = await openWithTwo();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete
      .mockResolvedValueOnce({ transactionId: 'transaction-existing', accountId: 'account-1', newBalance: 512.5 })
      .mockResolvedValueOnce({ transactionId: 'transaction-second', accountId: 'account-1', newBalance: 519.5 });

    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-27' }));
    await waitFor(() => expect(screen.queryByText('Coffee')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-26' }));
    await waitFor(() => expect(screen.queryByText('Tea')).toBeNull());
    expect(api.delete).toHaveBeenCalledTimes(2);
  });

  it('does not start a delete while an edit is being saved', async () => {
    const user = await openWithTwo();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish;
    api.put.mockReturnValue(new Promise((resolve) => { finish = resolve; }));

    await user.click(screen.getByRole('button', { name: 'Edit Groceries on 2026-10-27' }));
    await user.click(screen.getByRole('button', { name: 'Update transaction' }));
    expect(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-26' }).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Delete Groceries on 2026-10-26' }));
    expect(api.delete).not.toHaveBeenCalled();

    finish({ ...twoTransactions.transactions[0], newBalance: 487.5 });
    expect(await screen.findByText('Transaction updated.')).toBeTruthy();
  });
});
