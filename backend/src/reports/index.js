const express = require('express');
const router = express.Router();
const reportService = require('./reportService');
const { authenticateToken } = require('../auth/jwt');

// Scaffold for Reports module (SEBM-F-040..042)
// Owner: Dev C (Sujay P Nayak) - Stories S2-09, S2-10, S2-11

/**
 * @route GET /api/reports/weekly
 * @desc Get weekly aggregated transaction reports
 * @access Private
 */
router.get('/weekly', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required query parameters.' });
    }

    const report = await reportService.getWeeklyReportData(userId, startDate, endDate);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/reports/monthly
 * @desc Get monthly aggregated transaction reports
 * @access Private
 */
router.get('/monthly', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { year } = req.query;
    const report = await reportService.getMonthlyReportData(userId, year);
    res.json(report);
  } catch (err) {
    next(err);
  }
});

module.exports = router;