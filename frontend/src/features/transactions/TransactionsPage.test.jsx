import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { TransactionsPage } from './TransactionsPage';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const accountsResponse = {
  accounts: [{
    accountId: 'account-1',
    accountName: 'Daily account',
    balance: 500,
    accountType: 'bank',
  }],
};

const categoriesResponse = {
  categories: [
    { categoryId: 'category-groceries', name: 'Groceries', type: 'expense' },
    { categoryId: 'category-salary', name: 'Salary', type: 'income' },
  ],
};

const transactionsResponse = {
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

function AuthControls() {
  const { setUser, setAccessToken, clearUser } = useAuth();

  return (
    <div>
      <button
        onClick={() => {
          setUser({ userId: 'user-1' });
          setAccessToken('test-token');
        }}
        type="button"
      >
        Sign in
      </button>
      <button onClick={clearUser} type="button">Sign out</button>
    </div>
  );
}

function renderTransactionsPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <AuthControls />
        <TransactionsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

function resolveInitialRequests() {
  api.get.mockImplementation((path) => {
    if (path === '/accounts') return Promise.resolve(accountsResponse);
    if (path === '/transactions/categories') return Promise.resolve(categoriesResponse);
    if (path === '/transactions') return Promise.resolve(transactionsResponse);
    throw new Error(`Unexpected API path: ${path}`);
  });
}

describe('TransactionsPage (SEBM-F-010, TC-Exp-01)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists activity and records an expense with the bearer token', async () => {
    const user = userEvent.setup();
    resolveInitialRequests();
    api.post.mockResolvedValue({
      transactionId: 'transaction-new',
      accountId: 'account-1',
      categoryId: 'category-groceries',
      amount: 15.75,
      type: 'expense',
      date: '2026-10-28',
      notes: 'Lunch',
      newBalance: 484.25,
      createdAt: '2026-10-28T12:00:00.000Z',
    });
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Coffee')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Daily account' })).toBeTruthy();
    for (const path of ['/accounts', '/transactions/categories', '/transactions']) {
      expect(api.get).toHaveBeenCalledWith(
        path,
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
          signal: expect.any(AbortSignal),
        }),
      );
    }

    await user.type(screen.getByLabelText('Amount'), '15.75');
    await user.type(screen.getByLabelText('Notes (optional)'), 'Lunch');
    await user.click(screen.getByRole('button', { name: 'Save transaction' }));

    expect(await screen.findByText('Transaction recorded.')).toBeTruthy();
    expect(screen.getByText('Lunch')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith(
      '/transactions',
      {
        accountId: 'account-1',
        categoryId: 'category-groceries',
        amount: 15.75,
        type: 'expense',
        date: expect.any(String),
        notes: 'Lunch',
      },
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('filters categories by transaction type and records income', async () => {
    const user = userEvent.setup();
    resolveInitialRequests();
    api.post.mockResolvedValue({
      transactionId: 'transaction-income',
      accountId: 'account-1',
      categoryId: 'category-salary',
      amount: 100,
      type: 'income',
      date: '2026-10-28',
      notes: null,
      newBalance: 600,
      createdAt: '2026-10-28T12:00:00.000Z',
    });
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Coffee');
    await user.selectOptions(screen.getByLabelText('Type'), 'income');

    expect(screen.getByRole('option', { name: 'Salary' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Groceries' })).toBeNull();
    await user.type(screen.getByLabelText('Amount'), '100');
    await user.click(screen.getByRole('button', { name: 'Save transaction' }));

    expect(await screen.findByText('Transaction recorded.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith(
      '/transactions',
      expect.objectContaining({
        categoryId: 'category-salary',
        amount: 100,
        type: 'income',
      }),
      expect.any(Object),
    );
  });

  it('does not make requests or enable entry without a token', async () => {
    renderTransactionsPage();

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('form', { name: 'Record a transaction' })).toBeNull();
    expect(screen.getByText('Sign in to view or record transactions.')).toBeTruthy();
  });

  it('aborts pending account, category, and transaction requests on logout', async () => {
    const user = userEvent.setup();
    const pending = [];
    api.get.mockImplementation((_path, options) => new Promise((resolve) => {
      pending.push({ resolve, signal: options.signal });
    }));
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(pending.every(({ signal }) => signal.aborted)).toBe(true);
    await act(async () => {
      pending.forEach(({ resolve }, index) => {
        resolve(index === 0 ? accountsResponse : index === 1 ? categoriesResponse : transactionsResponse);
      });
    });
    expect(screen.queryByText('Coffee')).toBeNull();
    expect(screen.getByText('Your transactions will appear here after you sign in.')).toBeTruthy();
  });

  it('adds a custom category and makes it selectable for the next transaction (SEBM-F-013, TC-Exp-04)', async () => {
    const user = userEvent.setup();
    resolveInitialRequests();
    api.post.mockResolvedValue({
      category: { categoryId: 'category-pets', name: 'Pets', type: 'expense' },
    });
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Coffee')).toBeTruthy();

    await user.type(screen.getByLabelText('New expense category'), '  Pets ');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect(await screen.findByText('Category "Pets" added.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith(
      '/transactions/categories',
      { name: 'Pets', type: 'expense' },
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(screen.getByRole('option', { name: 'Pets' }).selected).toBe(true);
  });

  it('shows the server message when a duplicate category is rejected', async () => {
    const user = userEvent.setup();
    resolveInitialRequests();
    api.post.mockRejectedValue(new Error('A category with this name and type already exists.'));
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Coffee')).toBeTruthy();
    await user.type(screen.getByLabelText('New expense category'), 'Groceries');
    await user.click(screen.getByRole('button', { name: 'Add category' }));

    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
  });
});

describe('TransactionsPage receipt section (SEBM-F-012, TC-Exp-03)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function resolveWithNoReceipt() {
    api.get.mockImplementation((path) => {
      if (path === '/accounts') return Promise.resolve(accountsResponse);
      if (path === '/transactions/categories') return Promise.resolve(categoriesResponse);
      if (path === '/transactions') return Promise.resolve(transactionsResponse);
      if (path === '/receipts/transaction-existing') {
        return Promise.reject({
          status: 404,
          code: 'RECEIPT_NOT_FOUND',
          message: 'No receipt found for this transaction.',
        });
      }
      throw new Error(`Unexpected API path: ${path}`);
    });
  }

  it('mounts the receipt section on demand and attaches, views and replaces a receipt', async () => {
    const user = userEvent.setup();
    resolveWithNoReceipt();
    renderTransactionsPage();

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Coffee')).toBeTruthy();

    // The receipt section is only mounted when the transaction's Receipt button is clicked
    expect(screen.queryByTestId('receipt-section')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith(
      '/receipts/transaction-existing',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Receipt for Groceries on 2026-10-27' }));

    expect(await screen.findByText('No receipt attached yet.')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      '/receipts/transaction-existing',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
        signal: expect.any(AbortSignal),
      }),
    );

    // Attach a receipt photo
    const receiptFile = new File(['fake-image-bytes'], 'receipt.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('receipt-file-input'), receiptFile);
    expect(await screen.findByTestId('receipt-preview')).toBeTruthy();
    expect(screen.getByTestId('attach-receipt-button').textContent).toBe('Attach Receipt');

    api.post.mockResolvedValueOnce({
      receipt: {
        receiptId: 'receipt-1',
        transactionId: 'transaction-existing',
        imageUrl: 'data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==',
        createdAt: '2026-10-28T10:00:00.000Z',
      },
    });
    await user.click(screen.getByTestId('attach-receipt-button'));

    expect(await screen.findByText('Receipt attached successfully!')).toBeTruthy();
    expect(api.post).toHaveBeenCalledWith(
      '/receipts/transaction-existing',
      { imageUrl: expect.stringMatching(/^data:image\/png;base64,/) },
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
    expect(screen.getByTestId('receipt-image').getAttribute('src')).toBe(
      'data:image/png;base64,ZmFrZS1pbWFnZS1ieXRlcw==',
    );

    // Replace it with a new photo
    const replacementFile = new File(['other-bytes'], 'receipt-2.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('receipt-file-input'), replacementFile);
    expect(await screen.findByTestId('receipt-preview')).toBeTruthy();
    expect(screen.getByTestId('attach-receipt-button').textContent).toBe('Replace Receipt');

    api.post.mockResolvedValueOnce({
      receipt: {
        receiptId: 'receipt-1',
        transactionId: 'transaction-existing',
        imageUrl: 'data:image/png;base64,b3RoZXItYnl0ZXM=',
        createdAt: '2026-10-28T11:00:00.000Z',
      },
    });
    await user.click(screen.getByTestId('attach-receipt-button'));

    expect(await screen.findByText('Receipt attached successfully!')).toBeTruthy();
    expect(screen.getByTestId('receipt-image').getAttribute('src')).toBe(
      'data:image/png;base64,b3RoZXItYnl0ZXM=',
    );

    // Hide the section again
    await user.click(screen.getByRole('button', { name: 'Hide receipt for Groceries on 2026-10-27' }));
    expect(screen.queryByTestId('receipt-section')).toBeNull();
  });
});
