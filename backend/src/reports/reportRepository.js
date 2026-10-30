const { getPool } = require('../db');

async function getWeeklyTransactions(userId, startDate, endDate) {
  const pool = getPool();
  const query = `
    SELECT t.transaction_id, t.account_id, t.category_id, t.amount, t.type, t.notes, t.date,
           c.name AS category_name
    FROM transactions t
    JOIN accounts a ON t.account_id = a.account_id
    LEFT JOIN categories c ON t.category_id = c.category_id
    WHERE a.user_id = $1 
      AND t.date >= $2 
      AND t.date <= $3
    ORDER BY t.date DESC;
  `;
  const result = await pool.query(query, [userId, startDate, endDate]);
  return result.rows;
}

async function getMonthlyTransactions(userId, year) {
  const pool = getPool();
  const targetYear = year || new Date().getFullYear();
  const query = `
    SELECT t.transaction_id, t.account_id, t.category_id, t.amount, t.type, t.notes, t.date,
           c.name AS category_name
    FROM transactions t
    JOIN accounts a ON t.account_id = a.account_id
    LEFT JOIN categories c ON t.category_id = c.category_id
    WHERE a.user_id = $1 
      AND EXTRACT(YEAR FROM t.date) = $2
    ORDER BY t.date DESC;
  `;
  const result = await pool.query(query, [userId, targetYear]);
  return result.rows;
}

module.exports = {
  getWeeklyTransactions,
  getMonthlyTransactions,
};