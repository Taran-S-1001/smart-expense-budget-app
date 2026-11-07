/**
 * Regression tests for the PDF export currency (SEBM-F-041 / TC-Rep-02).
 * The app UI shows amounts in rupees; the generated PDF must use the same
 * currency instead of a hard-coded dollar sign, and must embed a font that
 * can actually render the rupee symbol.
 */

jest.mock('pdfkit', () =>
  jest.fn().mockImplementation(() => {
    const doc = {
      lines: [],
      font: jest.fn(() => doc),
      fontSize: jest.fn(() => doc),
      moveDown: jest.fn(() => doc),
      pipe: jest.fn(() => doc),
      text: jest.fn((value) => {
        doc.lines.push(String(value));
        return doc;
      }),
      end: jest.fn(),
    };
    return doc;
  }),
);

const PDFDocument = require('pdfkit');
const { generatePdf } = require('../../../src/reports/exportGenerators');
const { formatPdfAmount } = require('../../../src/reports/reportService');

describe('PDF export currency (SEBM-F-041 / TC-Rep-02)', () => {
  const reportData = {
    totalIncome: '5000.00',
    totalExpense: '1250.50',
    netSavings: '3749.50',
    transactions: [
      {
        transaction_id: 't1',
        type: 'income',
        amount: '5000.00',
        category_name: 'Salary',
        date: '2026-11-01',
        notes: '',
      },
      {
        transaction_id: 't2',
        type: 'expense',
        amount: '1000.00',
        category_name: 'Food',
        date: '2026-11-02',
        notes: 'Groceries',
      },
    ],
  };

  const lastDoc = () => PDFDocument.mock.results[PDFDocument.mock.results.length - 1].value;

  it('formats amounts with the rupee symbol and Indian grouping used across the app', () => {
    expect(formatPdfAmount('5000.00')).toBe('₹5,000.00');
    expect(formatPdfAmount(1250.5)).toBe('₹1,250.50');
    expect(formatPdfAmount('0')).toBe('₹0.00');
  });

  it('writes rupee amounts, never dollars, into the PDF summary and rows', () => {
    generatePdf(reportData, { write: jest.fn(), end: jest.fn() });
    const text = lastDoc().lines.join('\n');

    expect(text).toContain('Total Income: ₹5,000.00');
    expect(text).toContain('Total Expense: ₹1,250.50');
    expect(text).toContain('Net Savings: ₹3,749.50');
    expect(text).toContain('INCOME ₹5,000.00');
    expect(text).toContain('EXPENSE ₹1,000.00');
    expect(text).not.toContain('$');
  });

  it('embeds a font that can render the rupee symbol', () => {
    generatePdf(reportData, { write: jest.fn(), end: jest.fn() });
    expect(lastDoc().font).toHaveBeenCalledWith(
      expect.stringMatching(/Hind-Regular\.ttf$/),
    );
  });
});
