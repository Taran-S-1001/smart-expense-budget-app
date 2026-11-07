import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { AccountsPage } from './AccountsPage';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const twoAccounts = {
  accounts: [
    {
      accountId: 'account-everyday',
      accountName: 'Everyday checking',
      accountType: 'bank',
      balance: '1000.00',
    },
    {
      accountId: 'account-savings',
      accountName: 'Savings',
      accountType: 'bank',
      balance: '500.00',
    },
  ],
};

function AuthControls() {
  const { setUser, setAccessToken } = useAuth();

  return (
    <button
      onClick={() => {
        setUser({ userId: 'user-1' });
        setAccessToken('test-token');
      }}
      type="button"
    >
      Sign in
    </button>
  );
}

function renderAccountsPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <AuthControls />
        <AccountsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AccountsPage transfer form (SEBM-F-031, TC-Acc-02)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue(twoAccounts);
    api.post.mockResolvedValue({ transferId: 'transfer-1' });
  });

  it('transfers between two accounts and refreshes balances', async () => {
    const user = userEvent.setup();
    renderAccountsPage();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
    });
    await screen.findByText('Everyday checking');

    await user.selectOptions(screen.getByLabelText('From account'), 'account-everyday');
    await user.selectOptions(screen.getByLabelText('To account'), 'account-savings');
    await user.type(screen.getByLabelText('Amount'), '200');
    await user.click(screen.getByRole('button', { name: 'Transfer' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/accounts/transfer',
        {
          fromAccountId: 'account-everyday',
          toAccountId: 'account-savings',
          amount: 200,
        },
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        }),
      );
    });
    expect(await screen.findByText('Transfer complete. Balances updated.')).toBeTruthy();
    await waitFor(() => {
      expect(api.get.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows the insufficient balance message when the transfer is rejected', async () => {
    api.post.mockRejectedValue(
      new Error('Source account balance is insufficient for this transfer.'),
    );

    const user = userEvent.setup();
    renderAccountsPage();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
    });
    await screen.findByText('Everyday checking');

    await user.selectOptions(screen.getByLabelText('From account'), 'account-savings');
    await user.selectOptions(screen.getByLabelText('To account'), 'account-everyday');
    await user.type(screen.getByLabelText('Amount'), '999999');
    await user.click(screen.getByRole('button', { name: 'Transfer' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Source account balance is insufficient for this transfer.',
    );
  });

  it('keeps the source account out of the destination choices', async () => {
    const user = userEvent.setup();
    renderAccountsPage();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Sign in' }));
    });
    await screen.findByText('Everyday checking');

    await user.selectOptions(screen.getByLabelText('From account'), 'account-savings');

    const toSelect = screen.getByLabelText('To account');
    const optionValues = [...toSelect.querySelectorAll('option')].map(
      (option) => option.value,
    );
    expect(optionValues).toEqual(['account-everyday']);
    // Changing the source away from the current destination moves the destination.
    expect(toSelect.value).toBe('account-everyday');
  });
});
