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
        `${index + 1}. [${dateStr}] ${t.type.toUpperCase()} - $${t.amount} | Category: ${t.category_name || 'N/A'} | Notes: ${t.notes || 'None'}`
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
    const { startDate, endDate, year } = req.query;

    let reportData;
    if (startDate && endDate) {
      reportData = await reportService.getWeeklyReportData(userId, startDate, endDate);
    } else {
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

    return res.status(400).json({
      error: {
        code: 'INVALID_FORMAT',
        message: 'Unsupported format. Supported export formats are csv and pdf.'
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;