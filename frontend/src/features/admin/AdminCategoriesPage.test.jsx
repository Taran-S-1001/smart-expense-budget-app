import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../../api/client';
import { AuthProvider, useAuth } from '../../auth/AuthContext';
import { AdminCategoriesPage } from './AdminCategoriesPage';

vi.mock('../../api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function AdminPageHarness() {
  const { setUser, setAccessToken } = useAuth();

  useEffect(() => {
    setUser({ userId: 'admin-1', name: 'Admin User', role: 'admin' });
    setAccessToken('admin-token');
  }, [setAccessToken, setUser]);

  return <AdminCategoriesPage />;
}

describe('AdminCategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('sends the admin auth token and supports editing a category', async () => {
    const user = userEvent.setup();
    api.get.mockResolvedValue({
      categories: [{ categoryId: 'cat-1', name: 'Groceries', type: 'expense' }],
    });
    api.put.mockResolvedValue({
      category: { categoryId: 'cat-1', name: 'Travel', type: 'income' },
    });

    render(
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <AuthProvider>
          <AdminPageHarness />
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(
        '/admin/categories',
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin-token' },
        }),
      );
    });

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Travel');
    await user.selectOptions(screen.getByLabelText('Type'), 'income');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        { name: 'Travel', type: 'income' },
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin-token' },
        }),
      );
    });
  });
});
