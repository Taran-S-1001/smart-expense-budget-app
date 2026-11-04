import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const emptyForm = { name: '', type: 'expense' };

export function AdminCategoriesPage() {
  const { accessToken, user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [status, setStatus] = useState('');

  const loadCategories = useCallback(async () => {
    if (!accessToken) {
      setCategories([]);
      setStatus('');
      return;
    }

    try {
      const response = await api.get('/admin/categories', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      setCategories(response.categories || []);
      setStatus('');
    } catch (error) {
      setStatus('Could not load predefined categories.');
    }
  }, [accessToken]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!accessToken) {
      setStatus('Sign in as an admin to manage predefined categories.');
      return;
    }

    try {
      const payload = { name: form.name.trim(), type: form.type };
      if (!payload.name) {
        setStatus('Category name is required.');
        return;
      }

      let response;
      if (editingCategoryId) {
        response = await api.put(`/admin/categories/${editingCategoryId}`, payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setStatus('Predefined category updated.');
      } else {
        response = await api.post('/admin/categories', payload, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        setStatus('Predefined category created.');
      }

      const nextCategory = response.category;
      setCategories((current) => {
        if (editingCategoryId) {
          return current.map((category) => (category.categoryId === editingCategoryId ? nextCategory : category));
        }
        return [...current, nextCategory];
      });
      setForm(emptyForm);
      setEditingCategoryId(null);
    } catch (error) {
      setStatus(error.message || 'Unable to save predefined category.');
    }
  };

  const handleEdit = (category) => {
    setEditingCategoryId(category.categoryId);
    setForm({ name: category.name, type: category.type });
    setStatus('');
  };

  const handleDelete = async (categoryId) => {
    if (!accessToken) {
      setStatus('Sign in as an admin to delete predefined categories.');
      return;
    }

    try {
      await api.delete(`/admin/categories/${categoryId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setCategories((current) => current.filter((category) => category.categoryId !== categoryId));
      if (editingCategoryId === categoryId) {
        setEditingCategoryId(null);
        setForm(emptyForm);
      }
      setStatus('Predefined category deleted.');
    } catch (error) {
      setStatus(error.message || 'Unable to delete predefined category.');
    }
  };

  return (
    <section>
      <h2>Admin predefined categories</h2>
      <p>Manage the shared category catalog used across the app.</p>

      {!accessToken || user?.role !== 'admin' ? (
        <p className="inline-message" role="status">Sign in as an admin to manage predefined categories.</p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label>
            Name
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Groceries"
            />
          </label>

          <label>
            Type
            <select
              value={form.type}
              onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <button type="submit">{editingCategoryId ? 'Save changes' : 'Create category'}</button>
          {editingCategoryId ? (
            <button
              type="button"
              onClick={() => {
                setEditingCategoryId(null);
                setForm(emptyForm);
                setStatus('');
              }}
            >
              Cancel
            </button>
          ) : null}
        </form>
      )}

      {status ? <p>{status}</p> : null}

      <ul>
        {categories.map((category) => (
          <li key={category.categoryId}>
            <span>{category.name} ({category.type})</span>
            {user?.role === 'admin' && accessToken ? (
              <>
                <button type="button" onClick={() => handleEdit(category)}>Edit</button>
                <button type="button" onClick={() => handleDelete(category.categoryId)}>Delete</button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
