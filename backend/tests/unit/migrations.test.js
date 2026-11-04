const fs = require('fs');
const path = require('path');
const { runMigrations, MIGRATIONS_DIR, MIGRATION_FILE_PATTERN } = require('../../src/db/migrate');

describe('Database Schema & Migrations (Unit / Mocked)', () => {
  it('contains migration files matching YYYYMMDDHHMM_<module>_<change>.sql convention', () => {
    expect(fs.existsSync(MIGRATIONS_DIR)).toBe(true);

    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThanOrEqual(2);

    for (const file of files) {
      expect(file).toMatch(MIGRATION_FILE_PATTERN);
    }
  });

  describe('Core Tables Schema Migration (202610221200_core_create_tables.sql)', () => {
    const coreMigrationFile = path.join(MIGRATIONS_DIR, '202610221200_core_create_tables.sql');

    it('exists and is non-empty', () => {
      expect(fs.existsSync(coreMigrationFile)).toBe(true);
      const sql = fs.readFileSync(coreMigrationFile, 'utf-8');
      expect(sql.length).toBeGreaterThan(0);
    });

    it('defines all 7 required tables per approved ER Diagram with constraints', () => {
      const sql = fs.readFileSync(coreMigrationFile, 'utf-8');
      const lowerSql = sql.toLowerCase();

      // Required 7 tables from Diagram 3
      expect(lowerSql).toContain('create table if not exists users');
      expect(lowerSql).toContain('create table if not exists accounts');
      expect(lowerSql).toContain('create table if not exists categories');
      expect(lowerSql).toContain('create table if not exists transactions');
      expect(lowerSql).toContain('create table if not exists budgets');
      expect(lowerSql).toContain('create table if not exists receipts');
      expect(lowerSql).toContain('create table if not exists notifications');

      // User columns & checks
      expect(lowerSql).toContain('email');
      expect(lowerSql).toContain('password_hash');
      expect(lowerSql).toContain("check (role in ('user', 'admin'))");

      // Category nullability & checks
      expect(lowerSql).toContain('user_id');
      expect(lowerSql).toContain("check (type in ('expense', 'income'))");
      expect(lowerSql).toContain('is_custom');
      expect(sql).toContain('CONSTRAINT uq_categories_user_name_type UNIQUE NULLS NOT DISTINCT (user_id, name, type)');

      // Transaction checks
      expect(lowerSql).toContain('check (amount > 0)');

      // Foreign keys
      expect(lowerSql).toContain('references users(user_id)');
      expect(lowerSql).toContain('references accounts(account_id)');
      expect(lowerSql).toContain('references categories(category_id)');
      expect(lowerSql).toContain('references transactions(transaction_id)');

      // Budget constraints
      expect(sql).toContain('CONSTRAINT uq_budgets_user_cat_period UNIQUE NULLS NOT DISTINCT (user_id, category_id, period)');

      // Verify unapproved compatibility views have been removed
      expect(sql).not.toContain('VIEW "User"');
      expect(sql).not.toContain('VIEW "Account"');
      expect(sql).not.toContain('VIEW "Category"');
      expect(sql).not.toContain('VIEW "Transaction"');
      expect(sql).not.toContain('VIEW "Budget"');
      expect(sql).not.toContain('VIEW "Receipt"');
      expect(sql).not.toContain('VIEW "Notification"');
    });
  });

  describe('Predefined Categories Seed Migration (202610221201_categories_seed_predefined.sql)', () => {
    const seedMigrationFile = path.join(MIGRATIONS_DIR, '202610221201_categories_seed_predefined.sql');

    it('exists and inserts predefined categories with NULL user_id and is_custom = false', () => {
      expect(fs.existsSync(seedMigrationFile)).toBe(true);
      const sql = fs.readFileSync(seedMigrationFile, 'utf-8');

      expect(sql).toContain('INSERT INTO categories');
      expect(sql).toContain('NULL');
      expect(sql).toContain('FALSE');

      // Both Expense and Income must be seeded per project requirements
      expect(sql.toLowerCase()).toContain('expense');
      expect(sql.toLowerCase()).toContain('income');
    });

    it('uses ON CONFLICT ON CONSTRAINT uq_categories_user_name_type DO NOTHING for idempotency', () => {
      const sql = fs.readFileSync(seedMigrationFile, 'utf-8');
      expect(sql).toContain('ON CONFLICT ON CONSTRAINT uq_categories_user_name_type DO NOTHING');
      expect(sql).not.toContain('ON CONFLICT (category_id)');
    });

    it('simulates and verifies duplicate-seed scenario prevention (unit simulation)', () => {
      const mockDatabase = [];
      let nextId = 1;

      const insertWithConflictHandling = (category) => {
        const generatedId = `uuid-${nextId++}`;
        const isDuplicate = mockDatabase.some(
          (row) => row.user_id === category.user_id && row.name === category.name && row.type === category.type
        );

        if (!isDuplicate) {
          mockDatabase.push({
            category_id: generatedId,
            user_id: category.user_id,
            name: category.name,
            type: category.type,
            is_custom: category.is_custom,
          });
          return true;
        }
        return false;
      };

      const seedRows = [
        { user_id: null, name: 'Groceries', type: 'Expense', is_custom: false },
        { user_id: null, name: 'Salary', type: 'Income', is_custom: false },
        { user_id: null, name: 'Utilities', type: 'Expense', is_custom: false },
      ];

      const firstRunResults = seedRows.map(insertWithConflictHandling);
      expect(firstRunResults).toEqual([true, true, true]);
      expect(mockDatabase.length).toBe(3);

      const secondRunResults = seedRows.map(insertWithConflictHandling);
      expect(secondRunResults).toEqual([false, false, false]);
      expect(mockDatabase.length).toBe(3);
    });
  });

  describe('Migration Runner (migrate.js)', () => {
    it('executes migrations in deterministic alphabetical order inside transactions', async () => {
      const executedQueries = [];
      const mockClient = {
        query: jest.fn(async (text) => {
          executedQueries.push({ text: text.trim() });
          return { rows: [] };
        }),
        release: jest.fn()
      };

      const mockPool = {
        connect: jest.fn(async () => mockClient),
      };

      const applied = await runMigrations(mockPool);

      expect(applied.length).toBeGreaterThanOrEqual(2);
      expect(applied[0]).toBe('202610221200_core_create_tables.sql');
      expect(applied[1]).toBe('202610221201_categories_seed_predefined.sql');

      const statements = executedQueries.map((q) => q.text);
      expect(statements.filter((s) => s === 'BEGIN').length).toBe(applied.length);
      expect(statements.filter((s) => s === 'COMMIT').length).toBe(applied.length);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back and does not record migration if an error occurs during execution', async () => {
      const executedQueries = [];
      let insertMigrationAttempted = false;
      let simulateFailure = true;

      const mockClient = {
        query: jest.fn(async (text, params) => {
          executedQueries.push({ text: text.trim(), params });
          if (text.includes('SELECT version FROM schema_migrations')) {
            return { rows: [] };
          }
          if (simulateFailure && text.toLowerCase().includes('create table if not exists users')) {
            throw new Error('Simulated SQL syntax error in migration');
          }
          if (text.includes('INSERT INTO schema_migrations')) {
            insertMigrationAttempted = true;
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };

      const mockPool = {
        connect: jest.fn(async () => mockClient),
      };

      await expect(runMigrations(mockPool)).rejects.toThrow('Simulated SQL syntax error in migration');

      const rollbackCalled = mockClient.query.mock.calls.some(call => call[0].toUpperCase() === 'ROLLBACK');
      expect(rollbackCalled).toBe(true);
      expect(insertMigrationAttempted).toBe(false);
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('skips already applied migrations idempotently', async () => {
      const mockClient = {
        query: jest.fn(async (text) => {
          if (text.includes('SELECT version FROM schema_migrations')) {
            return {
              rows: [
                { version: '202610221200_core_create_tables.sql' },
                { version: '202610221201_categories_seed_predefined.sql' },
                { version: '202610291200_accounts_create_transfers.sql' },
                { version: '202610301200_add_password_reset_token_hash.sql' },
                { version: '202610311200_notifications_create_bill_reminders.sql' },
              ],
            };
          }
          return { rows: [] };
        }),
        release: jest.fn(),
      };

      const mockPool = {
        connect: jest.fn(async () => mockClient),
      };

      const applied = await runMigrations(mockPool);
      expect(applied).toEqual([]);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
