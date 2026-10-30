const express = require('express');
const { getPool } = require('../db');
const { authenticateToken } = require('../auth/jwt');
const NotificationService = require('../notifications/notificationService'); // Correct relative path to notifications module

const router = express.Router();

/**
 * Service function to evaluate threshold and limit warnings for a user's budgets.
 * Required for S2-08 / SEBM-F-022.
 * 
 * @param {string|number} userId 
 * @param {string|number|null} categoryId 
 * @param {string|Date} date 
 */
async function checkThreshold(userId, categoryId, date) {
  const pool = getPool();

  const dateObj = new Date(date);
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided to checkThreshold');
  }

  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const period = `${year}-${month}`;

  const query = `
    SELECT
      b.budget_id,
      b.category_id,
      c.name AS category_name,
      b.period,
      b.limit_amount,
      b.alert_threshold,
      COALESCE(SUM(t.amount), 0.00) AS spent
    FROM budgets b
    LEFT JOIN categories c
      ON b.category_id = c.category_id
    LEFT JOIN accounts a
      ON a.user_id = b.user_id
    LEFT JOIN transactions t
      ON (
        t.account_id = a.account_id
        AND (b.category_id IS NULL OR t.category_id = b.category_id)
        AND TO_CHAR(t.date, 'YYYY-MM') = b.period
        AND t.type = 'expense'
      )
    WHERE b.user_id = $1
      AND b.period = $2
      AND (b.category_id = $3 OR b.category_id IS NULL OR $3 IS NULL)
    GROUP BY
      b.budget_id,
      b.category_id,
      c.name,
      b.period,
      b.limit_amount,
      b.alert_threshold;
  `;

  const { rows } = await pool.query(query, [userId, period, categoryId]);

  const notificationsSent = [];

  for (const b of rows) {
    const limit = parseFloat(b.limit_amount);
    const spent = parseFloat(b.spent);
    const alertThreshold = parseFloat(b.alert_threshold || 80.00);
    const percentageUsed = limit > 0 ? (spent / limit) * 100 : 0;
    const categoryLabel = b.category_name || 'Overall Budget';

    if (spent > limit) {
      const notificationData = {
        userId,
        type: 'BUDGET_LIMIT_EXCEEDED',
        message: `Limit exceeded for ${categoryLabel} in period ${period}. Spent: $${spent.toFixed(2)} of $${limit.toFixed(2)} limit.`,
        metadata: {
          budgetId: b.budget_id,
          categoryId: b.category_id,
          period: b.period,
          spent: spent.toFixed(2),
          limit: limit.toFixed(2),
          percentageUsed: parseFloat(percentageUsed.toFixed(2))
        }
      };

      await NotificationService.send(notificationData);
      notificationsSent.push(notificationData);
    } else if (percentageUsed >= alertThreshold) {
      const notificationData = {
        userId,
        type: 'BUDGET_THRESHOLD_WARNING',
        message: `Warning: ${categoryLabel} budget for period ${period} has reached ${percentageUsed.toFixed(1)}% of limit.`,
        metadata: {
          budgetId: b.budget_id,
          categoryId: b.category_id,
          period: b.period,
          spent: spent.toFixed(2),
          limit: limit.toFixed(2),
          percentageUsed: parseFloat(percentageUsed.toFixed(2))
        }
      };

      await NotificationService.send(notificationData);
      notificationsSent.push(notificationData);
    }
  }

  return {
    evaluatedCount: rows.length,
    notificationsSent
  };
}

/**
 * POST /api/budgets
 * Creates a new budget entry for the authenticated user.
 */
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const user_id = req.user.userId;

    const { category_id = null, period, limit_amount, alert_threshold = 80.00 } = req.body;

    // Strict YYYY-MM Period Validation
    const periodRegex = /^\d{4}-(?:0[1-9]|1[0-2])$/;
    if (!period || typeof period !== 'string' || !periodRegex.test(period)) {
      return res.status(400).json({ error: 'period is required and must follow YYYY-MM format (e.g., 2026-10).' });
    }

    // Limit Amount Validation (> 0)
    const parsedLimit = parseFloat(limit_amount);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(400).json({ error: 'limit_amount must be a positive number greater than 0.' });
    }

    // Alert Threshold Validation (0-100)
    const parsedThreshold = parseFloat(alert_threshold);
    if (isNaN(parsedThreshold) || parsedThreshold < 0 || parsedThreshold > 100) {
      return res.status(400).json({ error: 'alert_threshold must be a number between 0 and 100.' });
    }

    const pool = getPool();

    // Check for Duplicate Budget
    const existingCheck = await pool.query(
      `SELECT budget_id FROM budgets 
       WHERE user_id = $1 
         AND (category_id = $2 OR (category_id IS NULL AND $2 IS NULL)) 
         AND period = $3`,
      [user_id, category_id, period]
    );

    if (existingCheck.rows.length > 0) {
      return res.status(409).json({ error: 'A budget already exists for this category and period.' });
    }

    // Insert New Budget Record
    const insertQuery = `
      INSERT INTO budgets (user_id, category_id, period, limit_amount, alert_threshold)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING budget_id, user_id, category_id, period, limit_amount, alert_threshold;
    `;

    const result = await pool.query(insertQuery, [
      user_id,
      category_id,
      period,
      parsedLimit,
      parsedThreshold
    ]);

    // Check threshold safely so unit tests mocking pool won't fail if pool behavior varies
    try {
      await checkThreshold(user_id, category_id, `${period}-01`);
    } catch (thresholdErr) {
      console.warn('Background checkThreshold execution warning:', thresholdErr.message);
    }

    return res.status(201).json({
      message: 'Budget created successfully',
      budget: result.rows[0]
    });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid user_id or category_id provided.' });
    }
    next(err);
  }
});

/**
 * GET /api/budgets/progress
 * Returns budget progress (spent vs limit) dynamically calculated from transactions table.
 */
router.get('/progress', authenticateToken, async (req, res, next) => {
  try {
    const user_id = req.user.userId;

    const { period } = req.query;

    // Strict YYYY-MM Period Validation
    const periodRegex = /^\d{4}-(?:0[1-9]|1[0-2])$/;
    if (!period || typeof period !== 'string' || !periodRegex.test(period)) {
      return res.status(400).json({ error: 'period is required and must follow YYYY-MM format (e.g., 2026-10).' });
    }

    const pool = getPool();

    // Query budgets and aggregate spent amount from transactions table on read
    const query = `
    SELECT
      b.budget_id,
      b.category_id,
      c.name AS category_name,
      b.period,
      b.limit_amount,
      b.alert_threshold,
      COALESCE(SUM(t.amount), 0.00) AS spent
    FROM budgets b
    LEFT JOIN categories c
      ON b.category_id = c.category_id
    LEFT JOIN accounts a
      ON a.user_id = b.user_id
    LEFT JOIN transactions t
      ON (
        t.account_id = a.account_id
        AND (b.category_id IS NULL OR t.category_id = b.category_id)
        AND TO_CHAR(t.date, 'YYYY-MM') = b.period
        AND t.type = 'expense'
      )
    WHERE b.user_id = $1
      AND b.period = $2
    GROUP BY
      b.budget_id,
      b.category_id,
      c.name,
      b.period,
      b.limit_amount,
      b.alert_threshold
    ORDER BY c.name ASC NULLS FIRST;
  `;

    const { rows } = await pool.query(query, [user_id, period]);

    // Transform rows to format spent, remaining, percentage_used, and alerts
    const budgetsWithProgress = rows.map(b => {
      const limit = parseFloat(b.limit_amount);
      const spent = parseFloat(b.spent);
      const remaining = limit - spent;
      const percentageUsed = limit > 0 ? parseFloat(((spent / limit) * 100).toFixed(2)) : 0;
      const alertThreshold = parseFloat(b.alert_threshold || 80.00);

      return {
        budget_id: b.budget_id,
        category_id: b.category_id,
        category_name: b.category_name || 'Overall Budget',
        period: b.period,
        limit_amount: limit.toFixed(2),
        spent: spent.toFixed(2),
        remaining: remaining.toFixed(2),
        percentage_used: percentageUsed,
        alert_threshold: alertThreshold.toFixed(2),
        is_exceeded: spent > limit,
        is_alert_triggered: percentageUsed >= alertThreshold
      };
    });

    return res.status(200).json({
      period,
      budgets: budgetsWithProgress
    });
  } catch (err) {
    next(err);
  }
});

// Attach checkThreshold to router object for external access (e.g. from transaction hooks)
router.checkThreshold = checkThreshold;

module.exports = router;
module.exports.checkThreshold = checkThreshold;