import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { RemindersPage } from './RemindersPage';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function SetAuthenticatedUser() {
  const { setAccessToken, setUser } = useAuth();

  useEffect(() => {
    setUser({ userId: 'user-1', name: 'Dev D Tester' });
    setAccessToken('demo-access-token');
  }, [setAccessToken, setUser]);

  return null;
}

function renderRemindersPage({ authenticated = true } = {}) {
  return render(
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <AuthProvider>
        {authenticated && <SetAuthenticatedUser />}
        <RemindersPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('RemindersPage (SEBM-F-051, TC-Notif-02)', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders sign-in prompt when unauthenticated', async () => {
    renderRemindersPage({ authenticated: false });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Sign in/i })).toBeTruthy();
      expect(screen.getByText(/to view or manage bill reminders/i)).toBeTruthy();
      expect(screen.getByText(/Your reminders will appear here after you sign in/i)).toBeTruthy();
    });
  });

  it('renders empty state when authenticated and no reminders exist', async () => {
    api.get.mockResolvedValueOnce({ reminders: [] });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText(/No bill reminders found\. Create one above\./i)).toBeTruthy();
    });
  });

  it('renders list of reminders with details, amounts, and badges', async () => {
    const mockReminders = [
      {
        reminderId: 'rem-1',
        billName: 'Broadband Fiber',
        amount: '899.00',
        dueDate: '2026-11-15',
        reminderLeadDays: 2,
        status: 'active',
        lastNotifiedAt: null,
      },
      {
        reminderId: 'rem-2',
        billName: 'Apartment Rent',
        amount: '15000.00',
        dueDate: '2026-11-01',
        reminderLeadDays: 3,
        status: 'paid',
        lastNotifiedAt: '2026-10-29T10:00:00.000Z',
      },
    ];

    api.get.mockResolvedValueOnce({ reminders: mockReminders });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText('Broadband Fiber')).toBeTruthy();
      expect(screen.getByText('₹899.00')).toBeTruthy();
      expect(screen.getByText('Apartment Rent')).toBeTruthy();
      expect(screen.getByText('₹15,000.00')).toBeTruthy();
      expect(screen.getByText(/Remind 2 day\(s\) before/i)).toBeTruthy();
      expect(screen.getByText(/⏱ Notification pending/i)).toBeTruthy();
      expect(screen.getByText(/✓ Notified on/i)).toBeTruthy();
    });
  });

  it('allows user to create a new bill reminder', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValueOnce({ reminders: [] });
    api.post.mockResolvedValueOnce({
      reminder: {
        reminderId: 'rem-new',
        billName: 'Water Utility',
        amount: '350.00',
        dueDate: '2026-11-20',
        reminderLeadDays: 1,
        status: 'active',
      },
    });
    // Secondary get on refresh
    api.get.mockResolvedValueOnce({
      reminders: [
        {
          reminderId: 'rem-new',
          billName: 'Water Utility',
          amount: '350.00',
          dueDate: '2026-11-20',
          reminderLeadDays: 1,
          status: 'active',
        },
      ],
    });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e\.g\. Electricity, Broadband/i)).toBeTruthy();
    });

    await user.type(screen.getByPlaceholderText(/e\.g\. Electricity, Broadband/i), 'Water Utility');
    await user.type(screen.getByPlaceholderText('0.00'), '350.00');

    const dateInput = screen.getByLabelText(/Due date/i);
    await user.type(dateInput, '2026-11-20');

    const submitBtn = screen.getByRole('button', { name: /Create reminder/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/reminders',
        {
          billName: 'Water Utility',
          amount: 350,
          dueDate: '2026-11-20',
          reminderLeadDays: 1,
        },
        expect.any(Object)
      );
      expect(screen.getByText(/Bill reminder created\./i)).toBeTruthy();
    });
  });

  it('allows user to mark a reminder as paid and toggle status', async () => {
    const user = userEvent.setup();
    const reminder = {
      reminderId: 'rem-toggle',
      billName: 'Gym Subscription',
      amount: '1200.00',
      dueDate: '2026-11-10',
      reminderLeadDays: 1,
      status: 'active',
    };

    api.get.mockResolvedValueOnce({ reminders: [reminder] });
    api.put.mockResolvedValueOnce({
      reminder: { ...reminder, status: 'paid' },
    });
    api.get.mockResolvedValueOnce({
      reminders: [{ ...reminder, status: 'paid' }],
    });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText('Gym Subscription')).toBeTruthy();
    });

    const markPaidBtn = screen.getByRole('button', { name: /Mark as Paid/i });
    await user.click(markPaidBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/reminders/rem-toggle',
        { status: 'paid' },
        expect.any(Object)
      );
      expect(screen.getByText(/Reminder marked as paid\./i)).toBeTruthy();
    });
  });

  it('allows user to edit a reminder', async () => {
    const user = userEvent.setup();
    const reminder = {
      reminderId: 'rem-edit',
      billName: 'Electricity',
      amount: '500.00',
      dueDate: '2026-11-05',
      reminderLeadDays: 2,
      status: 'active',
    };

    api.get.mockResolvedValueOnce({ reminders: [reminder] });
    api.put.mockResolvedValueOnce({
      reminder: { ...reminder, amount: '600.00' },
    });
    api.get.mockResolvedValueOnce({
      reminders: [{ ...reminder, amount: '600.00' }],
    });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText('Electricity')).toBeTruthy();
    });

    const editBtn = screen.getByRole('button', { name: 'Edit' });
    await user.click(editBtn);

    expect(screen.getByText('Edit bill reminder')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy();

    const saveBtn = screen.getByRole('button', { name: 'Save changes' });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/reminders/rem-edit',
        expect.objectContaining({
          billName: 'Electricity',
          status: 'active',
        }),
        expect.any(Object)
      );
      expect(screen.getByText(/Bill reminder updated\./i)).toBeTruthy();
    });
  });

  it('allows user to delete a reminder', async () => {
    const user = userEvent.setup();
    const reminder = {
      reminderId: 'rem-del',
      billName: 'Old Phone Bill',
      amount: '299.00',
      dueDate: '2026-11-01',
      reminderLeadDays: 1,
      status: 'active',
    };

    api.get.mockResolvedValueOnce({ reminders: [reminder] });
    api.delete.mockResolvedValueOnce({ ok: true });
    api.get.mockResolvedValueOnce({ reminders: [] });

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText('Old Phone Bill')).toBeTruthy();
    });

    const deleteBtn = screen.getByRole('button', { name: 'Delete' });
    await user.click(deleteBtn);

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith('/reminders/rem-del', expect.any(Object));
      expect(screen.getByText(/Reminder deleted\./i)).toBeTruthy();
    });
  });

  it('displays API error message when loading reminders fails', async () => {
    api.get.mockRejectedValueOnce(new Error('Network error loading reminders'));

    renderRemindersPage({ authenticated: true });

    await waitFor(() => {
      expect(screen.getByText('Network error loading reminders')).toBeTruthy();
    });
  });
});
