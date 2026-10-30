const db = require('../db');

// node-postgres parses a DATE column as local midnight, so read the local calendar day.
// Using toISOString() here shifted dates by one day on servers east of UTC.
const formatDate = (value) => {
  if (!(value instanceof Date)) return value;
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
};

const mapTransaction = (row) => ({
  transactionId: row.transaction_id,
  accountId: row.account_id,
  categoryId: row.category_id,
  amount: Number(row.amount),
  date: formatDate(row.date),
  type: row.type,
  notes: row.notes,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const mapCategory = (row) => ({
  categoryId: row.category_id,
  name: row.name,
  type: row.type,
});

const notFound = (code, message) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = 404;
  return error;
};

const signedAmount = (type, amount) => (type === 'expense' ? -amount : amount);

const rollback = async (client, started, message) => {
  if (!started) return;
  try {
    await client.query('ROLLBACK');
  } catch (rollbackError) {
    console.error(message, rollbackError);
  }
};

class TransactionRepository {
  constructor(database = db) {
    this.db = database;
  }

  async findByUserId(userId) {
    const result = await this.db.query(
      `SELECT transactions.transaction_id, transactions.account_id, transactions.category_id,
              transactions.amount, transactions.date, transactions.type, transactions.notes,
              transactions.created_at
       FROM transactions
       INNER JOIN accounts ON accounts.account_id = transactions.account_id
       WHERE accounts.user_id = $1
       ORDER BY transactions.date DESC, transactions.created_at DESC`,
      [userId],
    );

    return result.rows.map(mapTransaction);
  }

  async findCategoriesByUserId(userId) {
    const result = await this.db.query(
      `SELECT category_id, name, type
       FROM categories
       WHERE user_id IS NULL OR user_id = $1
       ORDER BY type ASC, name ASC, category_id ASC`,
      [userId],
    );

    return result.rows.map(mapCategory);
  }

  async createCustomCategory({ userId, name, type }) {
    const client = await this.db.getClient();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // The unique constraint is case-sensitive, so serialise creates for the same
      // user, type and case-insensitive name to keep names unique ignoring case.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`custom-category:${userId}:${type}:${name.toLowerCase()}`],
      );

      const duplicate = await client.query(
        `SELECT category_id
         FROM categories
         WHERE type = $1
           AND LOWER(name) = LOWER($2)
           AND (user_id IS NULL OR user_id = $3)
         LIMIT 1`,
        [type, name, userId],
      );

      if (duplicate.rows.length > 0) {
        const error = new Error('A category with this name and type already exists.');
        error.code = 'CATEGORY_EXISTS';
        error.statusCode = 409;
        throw error;
      }

      const result = await client.query(
        `INSERT INTO categories (user_id, name, type, is_custom)
         VALUES ($1, $2, $3, TRUE)
         RETURNING category_id, name, type`,
        [userId, name, type],
      );

      await client.query('COMMIT');
      return mapCategory(result.rows[0]);
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to roll back custom category creation.', rollbackError);
        }
      }
      if (error.code === '23505') {
        const conflict = new Error('A category with this name and type already exists.');
        conflict.code = 'CATEGORY_EXISTS';
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async createAndUpdateBalance({ userId, accountId, categoryId, amount, type, date, notes }) {
    const client = await this.db.getClient();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const accountResult = await client.query(
        `SELECT account_id, balance
         FROM accounts
         WHERE account_id = $1 AND user_id = $2
         FOR UPDATE`,
        [accountId, userId],
      );

      if (accountResult.rows.length === 0) {
        const error = new Error('Account not found.');
        error.code = 'ACCOUNT_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      const categoryResult = await client.query(
        `SELECT category_id
         FROM categories
         WHERE category_id = $1
           AND type = $2
           AND (user_id IS NULL OR user_id = $3)`,
        [categoryId, type, userId],
      );

      if (categoryResult.rows.length === 0) {
        const error = new Error('Category not found or does not match the transaction type.');
        error.code = 'INVALID_CATEGORY';
        error.statusCode = 400;
        throw error;
      }

      const transactionResult = await client.query(
        `INSERT INTO transactions (account_id, category_id, amount, date, type, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING transaction_id, account_id, category_id, amount, date, type, notes, created_at`,
        [accountId, categoryId, amount, date, type, notes],
      );

      const balanceChange = type === 'expense' ? -amount : amount;
      const accountUpdate = await client.query(
        `UPDATE accounts
         SET balance = balance + $1
         WHERE account_id = $2 AND user_id = $3
         RETURNING balance`,
        [balanceChange, accountId, userId],
      );

      if (accountUpdate.rows.length === 0) {
        const error = new Error('Account not found.');
        error.code = 'ACCOUNT_NOT_FOUND';
        error.statusCode = 404;
        throw error;
      }

      await client.query('COMMIT');

      return {
        transaction: mapTransaction(transactionResult.rows[0]),
        newBalance: Number(accountUpdate.rows[0].balance),
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to roll back transaction creation.', rollbackError);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAndAdjustBalance({ userId, transactionId, accountId, categoryId, amount, type, date, notes }) {
    const client = await this.db.getClient();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // Lock the transaction row first. Ownership is checked right after through the account
      // lock below. Joining accounts here made a concurrent account move look like a missing
      // row (the join was re-checked against the old account), giving a false 404.
      const existingResult = await client.query(
        `SELECT transaction_id, account_id, category_id, amount, date, type, notes, created_at
         FROM transactions
         WHERE transaction_id = $1
         FOR UPDATE`,
        [transactionId],
      );

      if (existingResult.rows.length === 0) {
        throw notFound('TRANSACTION_NOT_FOUND', 'Transaction not found.');
      }

      const existing = mapTransaction(existingResult.rows[0]);

      // Lock both accounts in a stable order so concurrent edits cannot deadlock.
      const accountIds = [...new Set([existing.accountId, accountId])].sort();
      const accountResult = await client.query(
        `SELECT account_id, balance
         FROM accounts
         WHERE account_id = ANY($1::varchar[]) AND user_id = $2
         ORDER BY account_id
         FOR UPDATE`,
        [accountIds, userId],
      );

      if (accountResult.rows.length !== accountIds.length) {
        throw notFound('ACCOUNT_NOT_FOUND', 'Account not found.');
      }

      const categoryResult = await client.query(
        `SELECT category_id
         FROM categories
         WHERE category_id = $1
           AND type = $2
           AND (user_id IS NULL OR user_id = $3)`,
        [categoryId, type, userId],
      );

      if (categoryResult.rows.length === 0) {
        const error = new Error('Category not found or does not match the transaction type.');
        error.code = 'INVALID_CATEGORY';
        error.statusCode = 400;
        throw error;
      }

      const updated = await client.query(
        `UPDATE transactions
         SET account_id = $1, category_id = $2, amount = $3, date = $4, type = $5, notes = $6
         WHERE transaction_id = $7
         RETURNING transaction_id, account_id, category_id, amount, date, type, notes, created_at`,
        [accountId, categoryId, amount, date, type, notes, transactionId],
      );

      // Reverse the old effect, then apply the new one.
      const balances = {};
      const reversal = signedAmount(existing.type, existing.amount) * -1;
      const reversed = await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE account_id = $2 AND user_id = $3 RETURNING balance',
        [reversal, existing.accountId, userId],
      );
      balances[existing.accountId] = Number(reversed.rows[0].balance);

      const applied = await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE account_id = $2 AND user_id = $3 RETURNING balance',
        [signedAmount(type, amount), accountId, userId],
      );
      balances[accountId] = Number(applied.rows[0].balance);

      await client.query('COMMIT');

      return {
        previous: existing,
        transaction: mapTransaction(updated.rows[0]),
        newBalance: balances[accountId],
        previousAccountBalance: balances[existing.accountId],
      };
    } catch (error) {
      await rollback(client, transactionStarted, 'Failed to roll back transaction update.');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteAndReverseBalance({ userId, transactionId }) {
    const client = await this.db.getClient();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      const existingResult = await client.query(
        `SELECT transaction_id, account_id, category_id, amount, date, type, notes, created_at
         FROM transactions
         WHERE transaction_id = $1
         FOR UPDATE`,
        [transactionId],
      );

      if (existingResult.rows.length === 0) {
        throw notFound('TRANSACTION_NOT_FOUND', 'Transaction not found.');
      }

      const existing = mapTransaction(existingResult.rows[0]);

      // Same lock order as an edit (transaction row first, then account) so a delete and
      // an account-moving edit can never wait on each other.
      const ownerAccount = await client.query(
        'SELECT account_id FROM accounts WHERE account_id = $1 AND user_id = $2 FOR UPDATE',
        [existing.accountId, userId],
      );

      // Not the caller's account: report it as missing, exactly like an unknown id.
      if (ownerAccount.rows.length === 0) {
        throw notFound('TRANSACTION_NOT_FOUND', 'Transaction not found.');
      }

      await client.query('DELETE FROM transactions WHERE transaction_id = $1', [transactionId]);

      const reversed = await client.query(
        'UPDATE accounts SET balance = balance + $1 WHERE account_id = $2 AND user_id = $3 RETURNING balance',
        [signedAmount(existing.type, existing.amount) * -1, existing.accountId, userId],
      );

      await client.query('COMMIT');

      return { transaction: existing, newBalance: Number(reversed.rows[0].balance) };
    } catch (error) {
      await rollback(client, transactionStarted, 'Failed to roll back transaction deletion.');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = TransactionRepository;
module.exports.mapTransaction = mapTransaction;
module.exports.mapCategory = mapCategory;
