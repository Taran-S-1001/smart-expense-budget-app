const path = require('path');
const PDFDocument = require('pdfkit');
const reportService = require('./reportService');

// Hind (SIL Open Font License, see assets/OFL.txt) includes the rupee sign
// that the app UI uses; pdfkit's built-in Helvetica cannot render it.
const PDF_FONT_PATH = path.join(__dirname, 'assets', 'Hind-Regular.ttf');

// Helper: Generate CSV format
const generateCsv = (transactions) => {
  let csv = 'Transaction ID,Date,Type,Amount,Category,Notes\n';
  transactions.forEach(t => {
    const dateStr = reportService.formatDateOnly(t.date);
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
  doc.font(PDF_FONT_PATH);

  doc.fontSize(20).text('Financial Expense Report', { align: 'center' });
  doc.moveDown();
  doc.fontSize(10).text(`Generated At: ${new Date().toISOString()}`, { align: 'right' });
  doc.moveDown();

  doc.fontSize(14).text('Summary Overview', { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(10).text(`Total Income: ${reportService.formatPdfAmount(reportData.totalIncome)}`);
  doc.text(`Total Expense: ${reportService.formatPdfAmount(reportData.totalExpense)}`);
  doc.text(`Net Savings: ${reportService.formatPdfAmount(reportData.netSavings)}`);
  doc.text(`Total Transactions: ${reportData.transactions.length}`);
  doc.moveDown();

  doc.fontSize(14).text('Transaction Details', { underline: true });
  doc.moveDown(0.5);

  if (reportData.transactions.length === 0) {
    doc.fontSize(10).text('No transactions found for the specified period.');
  } else {
    reportData.transactions.forEach((t, index) => {
      const dateStr = reportService.formatDateOnly(t.date) || 'N/A';
      doc.fontSize(9).text(
        `${index + 1}. [${dateStr}] ${t.type.toUpperCase()} ${reportService.formatPdfAmount(t.amount)} | Category: ${t.category_name || 'N/A'} | Notes: ${t.notes || 'None'}`
      );
    });
  }

  doc.end();
};

module.exports = {
  generateCsv,
  generatePdf,
};
