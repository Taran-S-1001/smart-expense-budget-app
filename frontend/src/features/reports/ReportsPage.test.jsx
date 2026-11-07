import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { ReportsPage } from './ReportsPage';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const weeklyReport = {
  startDate: '2026-11-01',
  endDate: '2026-11-07',
  totalIncome: '5000.00',
  totalExpense: '1250.50',
  netSavings: '3749.50',
  transactionCount: 3,
  transactions: [
    {
      transaction_id: 't1',
      type: 'expense',
      amount: '1000.00',
      category_name: 'Food',
      date: '2026-11-02',
      notes: 'Groceries',
    },
    {
      transaction_id: 't2',
      type: 'expense',
      amount: '250.50',
      category_name: 'Travel',
      date: '2026-11-03',
      notes: '',
    },
    {
      transaction_id: 't3',
      type: 'income',
      amount: '5000.00',
      category_name: 'Salary',
      date: '2026-11-01',
      notes: '',
    },
  ],
};

const monthlyReport = {
  year: 2026,
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  totalIncome: '60000.00',
  totalExpense: '15000.00',
  netSavings: '45000.00',
  monthlyBreakdown: Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    income: index === 0 ? '5000.00' : '0.00',
    expense: index === 0 ? '1200.00' : '0.00',
  })),
  transactions: weeklyReport.transactions,
};

const comparisonReport = {
  currentPeriod: {
    startDate: '2026-11-01',
    endDate: '2026-11-07',
    totalIncome: '5000.00',
    totalExpense: '1250.50',
    netSavings: '3749.50',
    transactionCount: 3,
  },
  previousPeriod: {
    startDate: '2026-10-25',
    endDate: '2026-10-31',
    totalIncome: '2500.00',
    totalExpense: '2501.00',
    netSavings: '-1.00',
    transactionCount: 4,
  },
  comparison: {
    incomeChange: '+100.00%',
    expenseChange: '-50.00%',
    netSavingsChange: '+375050.00%',
  },
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

function renderReportsPage() {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        <AuthControls />
        <ReportsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function signIn(user) {
  await act(async () => {
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
  });
}

describe('ReportsPage (SEBM-F-040, TC-Rep-01)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path.startsWith('/reports/weekly')) return Promise.resolve(weeklyReport);
      if (path.startsWith('/reports/monthly')) return Promise.resolve(monthlyReport);
      if (path.startsWith('/reports/comparison')) return Promise.resolve(comparisonReport);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
  });

  it('shows the weekly report totals and a spending-by-category chart', async () => {
    const user = userEvent.setup();
    renderReportsPage();
    await signIn(user);

    expect(await screen.findByText('Spending by category')).toBeTruthy();
    expect(screen.getByText('Total income')).toBeTruthy();
    expect(screen.getByText('₹5,000.00')).toBeTruthy();
    expect(screen.getByText('₹1,250.50')).toBeTruthy();
    expect(screen.getByText('₹3,749.50')).toBeTruthy();

    expect(
      screen.getByRole('img', { name: 'Food expenses ₹1,000.00' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Travel expenses ₹250.50' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Salary income ₹5,000.00' }),
    ).toBeTruthy();
  });

  it('shows the month-by-month chart for a monthly report', async () => {
    const user = userEvent.setup();
    renderReportsPage();
    await signIn(user);
    await screen.findByText('Spending by category');

    await user.click(screen.getByRole('button', { name: 'Monthly' }));
    await user.clear(screen.getByLabelText('Year'));
    await user.type(screen.getByLabelText('Year'), '2026');
    await user.click(screen.getByRole('button', { name: 'Show report' }));

    expect(await screen.findByText('Month by month')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      '/reports/monthly?year=2026',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
    expect(
      screen.getByRole('img', { name: 'Jan expenses ₹1,200.00' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Jan income ₹5,000.00' }),
    ).toBeTruthy();
  });
});

describe('ReportsPage export (SEBM-F-041, TC-Rep-02)', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path.startsWith('/reports/weekly')) return Promise.resolve(weeklyReport);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
  });

  it('downloads a CSV export for the exact date range shown on screen', async () => {
    const blob = new Blob(['csv-data'], { type: 'text/csv' });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(blob),
    });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    const user = userEvent.setup();
    renderReportsPage();
    await signIn(user);
    await screen.findByText('Spending by category');

    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/reports/export?format=csv');
    expect(url).toContain('startDate=');
    expect(url).toContain('endDate=');
    expect(options.headers.Authorization).toBe('Bearer test-token');
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(
      await screen.findByText('Report exported as CSV.'),
    ).toBeTruthy();

    clickSpy.mockRestore();
  });

  it('surfaces an export error instead of downloading when the API rejects', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () =>
        Promise.resolve({ error: { message: 'Unsupported format. Supported export formats are csv and pdf.' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderReportsPage();
    await signIn(user);
    await screen.findByText('Spending by category');

    await user.click(screen.getByRole('button', { name: 'Download PDF' }));

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Unsupported format. Supported export formats are csv and pdf.',
    );
  });
});

describe('ReportsPage comparison (SEBM-F-042, TC-Rep-03)', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockImplementation((path) => {
      if (path.startsWith('/reports/weekly')) return Promise.resolve(weeklyReport);
      if (path.startsWith('/reports/comparison')) return Promise.resolve(comparisonReport);
      return Promise.reject(new Error(`Unexpected GET ${path}`));
    });
  });

  it('shows the percentage change between two periods', async () => {
    const user = userEvent.setup();
    renderReportsPage();
    await signIn(user);
    await screen.findByText('Spending by category');

    await user.click(screen.getByRole('button', { name: 'Compare periods' }));

    expect(await screen.findByText('+100.00%')).toBeTruthy();
    expect(screen.getByText('-50.00%')).toBeTruthy();
    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('Expenses')).toBeTruthy();
    expect(screen.getAllByText('Net savings').length).toBeGreaterThan(0);
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/reports/comparison?currentStart='),
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }),
    );
  });
});
