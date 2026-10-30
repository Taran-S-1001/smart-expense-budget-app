import { useEffect, useState } from 'react';

export function AdminCategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ name: '', type: 'expense' });
  const [status, setStatus] = useState('');

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const response = await fetch('/api/admin/categories', {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          setStatus('Could not load predefined categories.');
          return;
        }

        const data = await response.json();
        setCategories(data.categories || []);
      } catch (error) {
        setStatus('Could not load predefined categories.');
      }
    };

    loadCategories();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const response = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(form),
      });

      if (!response.ok) {
        setStatus('Unable to create predefined category.');
        return;
      }

      const nextCategory = await response.json();
      setCategories((current) => [...current, nextCategory.category]);
      setForm({ name: '', type: 'expense' });
      setStatus('Predefined category created.');
    } catch (error) {
      setStatus('Unable to create predefined category.');
    }
  };

  return (
    <section>
      <h2>Admin predefined categories</h2>
      <p>Manage the shared category catalog used across the app.</p>

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

        <button type="submit">Create category</button>
      </form>

      {status ? <p>{status}</p> : null}

      <ul>
        {categories.map((category) => (
          <li key={category.categoryId}>
            {category.name} ({category.type})
          </li>
        ))}
      </ul>
    </section>
  );
}
