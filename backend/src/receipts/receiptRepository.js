const db = require('../db');

/**
 * Maps database snake_case row to camelCase receipt domain object.
 */
const mapRowToReceipt = (row) => {
  if (!row) return null;
  return {
    receiptId: row.receipt_id,
    transactionId: row.transaction_id,
    imageUrl: row.image_url,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
};

/**
 * ReceiptRepository
 * Handles database operations for receipts and verifies transaction ownership.
 */
class ReceiptRepository {
  constructor(dbClient = db) {
    this.db = dbClient;
  }

  /**
   * Find transaction owner by transactionId.
   * Joins transactions with accounts to retrieve the owning user_id.
   *
   * @param {string} transactionId
   * @returns {Promise<{ transactionId: string, userId: string } | null>}
   */
  async findTransactionOwner(transactionId) {
    const query = `
      SELECT t.transaction_id, a.user_id
      FROM transactions t
      INNER JOIN accounts a ON t.account_id = a.account_id
      WHERE t.transaction_id = $1
      LIMIT 1;
    `;
    const result = await this.db.query(query, [transactionId]);
    if (result.rows.length === 0) {
      return null;
    }
    return {
      transactionId: result.rows[0].transaction_id,
      userId: result.rows[0].user_id,
    };
  }

  /**
   * Find receipt by transactionId.
   *
   * @param {string} transactionId
   * @returns {Promise<{ receiptId: string, transactionId: string, imageUrl: string, createdAt: string } | null>}
   */
  async findReceiptByTransactionId(transactionId) {
    const query = `
      SELECT receipt_id, transaction_id, image_url, created_at
      FROM receipts
      WHERE transaction_id = $1
      LIMIT 1;
    `;
    const result = await this.db.query(query, [transactionId]);
    if (result.rows.length === 0) {
      return null;
    }
    return mapRowToReceipt(result.rows[0]);
  }

  /**
   * Insert or update receipt for a transaction.
   * Unique constraint on transaction_id handles upsert cleanly.
   *
   * @param {string} transactionId
   * @param {string} imageUrl
   * @returns {Promise<{ receiptId: string, transactionId: string, imageUrl: string, createdAt: string }>}
   */
  async upsertReceipt(transactionId, imageUrl) {
    const query = `
      INSERT INTO receipts (transaction_id, image_url)
      VALUES ($1, $2)
      ON CONFLICT (transaction_id)
      DO UPDATE SET image_url = EXCLUDED.image_url, created_at = CURRENT_TIMESTAMP
      RETURNING receipt_id, transaction_id, image_url, created_at;
    `;
    const result = await this.db.query(query, [transactionId, imageUrl]);
    return mapRowToReceipt(result.rows[0]);
  }
}

module.exports = ReceiptRepository;
module.exports.mapRowToReceipt = mapRowToReceipt;
