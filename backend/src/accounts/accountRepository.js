const db = require('../db');

const mapAccount = (row) => ({
  accountId: row.account_id,
  userId: row.user_id,
  accountType: row.account_type,
  accountName: row.account_name,
  balance: Number(row.balance),
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
});

const transferError = (code, message, statusCode) => {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
};

class AccountRepository {
  constructor(database = db) {
    this.db = database;
  }

  async findByUserId(userId) {
    const result = await this.db.query(
      `SELECT account_id, user_id, account_type, account_name, balance, created_at
       FROM accounts
       WHERE user_id = $1
       ORDER BY created_at DESC, account_id ASC`,
      [userId],
    );

    return result.rows.map(mapAccount);
  }

  async create({ userId, accountType, accountName, openingBalance }) {
    const result = await this.db.query(
      `INSERT INTO accounts (user_id, account_type, account_name, balance)
       VALUES ($1, $2, $3, $4)
       RETURNING account_id, user_id, account_type, account_name, balance, created_at`,
      [userId, accountType, accountName, openingBalance],
    );

    return mapAccount(result.rows[0]);
  }

  async transfer({ userId, fromAccountId, toAccountId, amount }) {
    const client = await this.db.getClient();
    let transactionStarted = false;

    try {
      await client.query('BEGIN');
      transactionStarted = true;

      // Lock both accounts in a fixed order so concurrent opposite transfers cannot deadlock.
      const lockResult = await client.query(
        `SELECT account_id, balance
         FROM accounts
         WHERE account_id = ANY($1::text[]) AND user_id = $2
         ORDER BY account_id ASC
         FOR UPDATE`,
        [[fromAccountId, toAccountId], userId],
      );

      const source = lockResult.rows.find((row) => row.account_id === fromAccountId);
      const destination = lockResult.rows.find((row) => row.account_id === toAccountId);
      if (!source || !destination) {
        throw transferError('ACCOUNT_NOT_FOUND', 'Source or destination account not found.', 404);
      }

      // Compare in integer cents to avoid floating-point errors.
      if (Math.round(Number(source.balance) * 100) < Math.round(amount * 100)) {
        throw transferError('INSUFFICIENT_FUNDS', 'Source account balance is insufficient for this transfer.', 422);
      }

      const debit = await client.query(
        `UPDATE accounts SET balance = balance - $1 WHERE account_id = $2 AND user_id = $3 RETURNING balance`,
        [amount, fromAccountId, userId],
      );
      const credit = await client.query(
        `UPDATE accounts SET balance = balance + $1 WHERE account_id = $2 AND user_id = $3 RETURNING balance`,
        [amount, toAccountId, userId],
      );
      const record = await client.query(
        `INSERT INTO transfers (user_id, from_account_id, to_account_id, amount)
         VALUES ($1, $2, $3, $4)
         RETURNING transfer_id`,
        [userId, fromAccountId, toAccountId, amount],
      );

      await client.query('COMMIT');

      return {
        transferId: record.rows[0].transfer_id,
        fromAccountBalance: Number(debit.rows[0].balance),
        toAccountBalance: Number(credit.rows[0].balance),
      };
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          console.error('Failed to roll back account transfer.', rollbackError);
        }
      }
      throw error;
    } finally {
      client.release();
    }
  }
}


module.exports = AccountRepository;
module.exports.mapAccount = mapAccount;
