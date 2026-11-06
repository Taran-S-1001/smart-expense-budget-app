const express = require('express');
const router = express.Router();
const reportService = require('./reportService');
const { authenticateToken } = require('../auth/jwt');
const PDFDocument = require('pdfkit');

// Scaffold for Reports module (SEBM-F-040..042)
// Owner: Dev C (Sujay P Nayak) - Stories S2-09, S2-10, S2-11

// Helper: Generate CSV format
const generateCsv = (transactions) => {
  let csv = 'Transaction ID,Date,Type,Amount,Category,Notes\n';
  transactions.forEach(t => {
    const dateStr = t.date ? new Date(t.date).toISOString().split('T')[0] : '';
    const notes = (t.notes || '').replace(/"/g, '""');
    const category = (t.category_name || 'Uncategorized').replace(/"/g, '""');
    csv += `${t.transaction_id},${dateStr},${t.type},${t.amount},"${category}","${notes}"\n`;
  });
  return csv;
};

// Helper: Generate PDF format using pdfkit
const generatePdf = (reportData, res) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(20).text('Financial Expense Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated At: ${new Date().toISOString()}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(14).text('Summary Overview', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Total Income: $${reportData.totalIncome}`);
  doc.text(`Total Expense: $${reportData.totalExpense}`);
  doc.text(`Net Savings: $${reportData.netSavings}`);
  doc.text(`Total Transactions: ${reportData.transactions.length}`);
  doc.moveDown();

  doc.fontSize(14).text('Transaction Details', { underline: true });
  doc.moveDown(0.5);

  if (reportData.transactions.length === 0) {
    doc.fontSize(10).text('No transactions found for the specified period.');
  } else {
    reportData.transactions.forEach((t, index) => {
      const dateStr = t.date ? new Date(t.date).toISOString().split('T')[0] : 'N/A';
      doc.fontSize(9).text(
        `${index + 1}. [${dateStr}] ${t.type.toUpperCase()} $${t.amount} | Category: ${t.category_name || 'N/A'} | Notes: ${t.notes || 'None'}`
      );
    });
  }

  doc.end();
};

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
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'startDate and endDate are required query parameters.'
        }
      });
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

    const { year, startDate, endDate } = req.query;
    const targetYear = year || new Date().getFullYear();

    if (year && !/^\d{4}$/.test(String(year))) {
      return res.status(400).json({
        error: {
          code: 'INVALID_YEAR_FORMAT',
          message: 'Invalid year format. Must be a valid 4-digit year.'
        }
      });
    }

    const report = await reportService.getMonthlyReportData(userId, targetYear);

    // Ensure start and end dates are populated for both date-range and year-based paths
    const resolvedStartDate = startDate || `${targetYear}-01-01`;
    const resolvedEndDate = endDate || `${targetYear}-12-31`;

    res.status(200).json({
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      ...report
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/reports/summary
 * @desc Alias for black-box test expectations (TC-Rep-01)
 * @access Private
 */
router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { start, end, year } = req.query;
    let report;
    const targetYear = year || new Date().getFullYear();

    if (start && end) {
      report = await reportService.getWeeklyReportData(userId, start, end);
    } else {
      report = await reportService.getMonthlyReportData(userId, targetYear);
    }

    // Build category breakdown to satisfy TC-Rep-01 expectations
    const breakdownMap = {};
    (report.transactions || []).forEach(t => {
      const cat = t.category_name || 'Uncategorized';
      if (!breakdownMap[cat]) {
        breakdownMap[cat] = { category_name: cat, total: 0, income: 0, expenses: 0 };
      }
      const amt = parseFloat(t.amount || 0);
      if (t.type === 'income') {
        breakdownMap[cat].income += amt;
      } else {
        breakdownMap[cat].expenses += amt;
      }
      breakdownMap[cat].total += (t.type === 'income' ? amt : -amt);
    });

    const breakdown = Object.values(breakdownMap).map(b => ({
      ...b,
      income: b.income.toFixed(2),
      expenses: b.expenses.toFixed(2),
      total: b.total.toFixed(2)
    }));

    // Ensure resolved period dates are always populated for both start/end and year-based requests
    const resolvedStartDate = start || report.startDate || `${targetYear}-01-01`;
    const resolvedEndDate = end || report.endDate || `${targetYear}-12-31`;

    // Transform to match black-box test suite shape (period object, totals object, breakdown array)
    const transformedReport = {
      period: {
        startDate: resolvedStartDate,
        endDate: resolvedEndDate
      },
      totals: {
        income: report.totalIncome || report.totals?.income || '0.00',
        expenses: report.totalExpense || report.totals?.expenses || '0.00',
        netSavings: report.netSavings || report.totals?.netSavings || '0.00'
      },
      breakdown,
      transactionCount: report.transactionCount || (report.transactions ? report.transactions.length : 0),
      transactions: report.transactions || []
    };

    res.status(200).json(transformedReport);
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/reports/export
 * @desc Export report as CSV or PDF (SEBM-F-041 / TC-Rep-02)
 * @access Private
 */
router.get('/export', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const format = (req.query.format || 'csv').toLowerCase();
    if (!['csv', 'pdf'].includes(format)) {
      return res.status(400).json({
        error: {
          code: 'INVALID_FORMAT',
          message: 'Unsupported format. Supported export formats are csv and pdf.'
        }
      });
    }

    const startDate = req.query.startDate || req.query.start;
    const endDate = req.query.endDate || req.query.end;
    const { year } = req.query;

    let reportData;
    if (startDate || endDate) {
      if (!startDate || !endDate) {
        return res.status(400).json({
          error: {
            code: 'MISSING_PARAMETERS',
            message: 'Both start/startDate and end/endDate query parameters are required for date-range exports.'
          }
        });
      }
      reportData = await reportService.getWeeklyReportData(userId, startDate, endDate);
    } else {
      if (year && !/^\d{4}$/.test(String(year))) {
        return res.status(400).json({
          error: {
            code: 'INVALID_YEAR_FORMAT',
            message: 'Invalid year format. Must be a valid 4-digit year.'
          }
        });
      }
      reportData = await reportService.getMonthlyReportData(userId, year);
    }

    if (format === 'csv') {
      const csvString = generateCsv(reportData.transactions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="financial-report.csv"');
      return res.status(200).send(csvString);
    }

    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="financial-report.pdf"');
      return generatePdf(reportData, res);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/reports/comparison
 * @desc Get period-over-period comparison report (SEBM-F-042 / TC-Rep-03)
 * @access Private
 */
router.get('/comparison', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentStart, currentEnd, prevStart, prevEnd } = req.query;

    if (!currentStart || !currentEnd || !prevStart || !prevEnd) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'currentStart, currentEnd, prevStart, and prevEnd query parameters are required.',
        },
      });
    }

    const comparisonReport = await reportService.getPeriodComparisonData(
      userId, currentStart, currentEnd, prevStart, prevEnd
    );
    res.json(comparisonReport);
  } catch (err) {
    next(err);
  }
});

/**
 * @route GET /api/reports/compare
 * @desc Alias for black-box test expectations (TC-Rep-03) using start/end/previousStart/previousEnd
 * @access Private
 */
router.get('/compare', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const start = req.query.start || req.query.currentStart;
    const end = req.query.end || req.query.currentEnd;
    const previousStart = req.query.previousStart || req.query.prevStart;
    const previousEnd = req.query.previousEnd || req.query.prevEnd;
    const metric = req.query.metric || 'expenses';

    if (!start || !end || !previousStart || !previousEnd) {
      return res.status(400).json({
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'start, end, previousStart, and previousEnd query parameters are required.',
        },
      });
    }

    const comparisonReport = await reportService.getPeriodComparisonData(
      userId, start, end, previousStart, previousEnd
    );

    // Extract numeric percentage change from comparisonReport.comparison properly
    let rawPercentage = 0;
    const compObj = comparisonReport.comparison || {};

    let targetChangeStr;
    if (metric === 'income') {
      targetChangeStr = compObj.incomeChange;
    } else if (metric === 'netSavings' || metric === 'savings') {
      targetChangeStr = compObj.netSavingsChange;
    } else {
      targetChangeStr = compObj.expenseChange;
    }

    if (targetChangeStr) {
      rawPercentage = parseFloat(String(targetChangeStr).replace('%', '').replace('+', '')) || 0;
    }

    const transformedComparison = {
      ...comparisonReport,
      comparison: {
        ...compObj,
        metric,
        percentageChange: rawPercentage,
      }
    };

    res.status(200).json(transformedComparison);
  } catch (err) {
    next(err);
  }
});

module.exports = router;