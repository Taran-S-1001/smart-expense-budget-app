import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const formatAmount = (amount) =>
  `₹${Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const toInputDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const rangeEndingToday = (days) => {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  return { start: toInputDate(start), end: toInputDate(end) };
};

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function ChangeCard({ label, change, current, previous }) {
  const direction = change.startsWith('+') ? 'up' : change.startsWith('-') ? 'down' : 'flat';
  return (
    <li className={`comparison-card change-${direction}`}>
      <span className="comparison-label">{label}</span>
      <strong className="comparison-change" aria-label={`${label} change ${change}`}>
        {change}
      </strong>
      <span className="comparison-detail">
        {formatAmount(current)} vs {formatAmount(previous)}
      </span>
    </li>
  );
}

export function ReportsPage() {
  const { accessToken } = useAuth();
  const currentYear = new Date().getFullYear();

  const [mode, setMode] = useState('weekly');
  const [startDate, setStartDate] = useState(() => rangeEndingToday(7).start);
  const [endDate, setEndDate] = useState(() => rangeEndingToday(7).end);
  const [year, setYear] = useState(String(currentYear));
  const [report, setReport] = useState(null);
  const [reportToken, setReportToken] = useState(null);
  const [reportParams, setReportParams] = useState(null);
  const [reportDescription, setReportDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const previousWeek = rangeEndingToday(7);
  const weekBefore = (() => {
    const end = new Date();
    end.setDate(end.getDate() - 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    return { start: toInputDate(start), end: toInputDate(end) };
  })();

  const [currentStart, setCurrentStart] = useState(previousWeek.start);
  const [currentEnd, setCurrentEnd] = useState(previousWeek.end);
  const [prevStart, setPrevStart] = useState(weekBefore.start);
  const [prevEnd, setPrevEnd] = useState(weekBefore.end);
  const [comparison, setComparison] = useState(null);
  const [comparisonToken, setComparisonToken] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState('');

  const runReport = async (event) => {
    if (event) event.preventDefault();
    if (!accessToken) {
      setError('Sign in before viewing reports.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');
    try {
      const path =
        mode === 'weekly'
          ? `/reports/weekly?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
          : `/reports/monthly?year=${encodeURIComponent(year)}`;
      const response = await api.get(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setReport(response);
      setReportToken(accessToken);
      // Remember the parameters that produced this report so a later export
      // downloads exactly what is on screen, even if the form was edited since.
      setReportParams({ mode, startDate, endDate, year });
      setReportDescription(
        mode === 'weekly'
          ? `Weekly report for ${startDate} to ${endDate}`
          : `Monthly report for ${year}`,
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) {
      setReport(null);
      setReportToken(null);
      setReportParams(null);
      setComparison(null);
      setComparisonToken(null);
      return;
    }
    runReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleExport = async (format) => {
    if (!accessToken) {
      setError('Sign in before exporting a report.');
      return;
    }

    if (!reportParams) {
      setError('Run a report before exporting it.');
      return;
    }

    setExporting(format);
    setError('');
    setNotice('');
    try {
      const params =
        reportParams.mode === 'weekly'
          ? `startDate=${encodeURIComponent(reportParams.startDate)}&endDate=${encodeURIComponent(reportParams.endDate)}`
          : `year=${encodeURIComponent(reportParams.year)}`;
      const response = await fetch(
        `${API_BASE_URL}/reports/export?format=${format}&${params}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!response.ok) {
        let message = `Export failed with status ${response.status}.`;
        try {
          const body = await response.json();
          if (body?.error?.message) message = body.error.message;
        } catch {
          // keep the status-based message
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download =
        reportParams.mode === 'weekly'
          ? `sebm-weekly-report-${reportParams.startDate}-to-${reportParams.endDate}.${format}`
          : `sebm-monthly-report-${reportParams.year}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`Report exported as ${format.toUpperCase()}.`);
    } catch (exportError) {
      setError(exportError.message);
    } finally {
      setExporting('');
    }
  };

  const runComparison = async (event) => {
    if (event) event.preventDefault();
    if (!accessToken) {
      setComparisonError('Sign in before comparing periods.');
      return;
    }

    setComparing(true);
    setComparisonError('');
    try {
      const path =
        `/reports/comparison?currentStart=${encodeURIComponent(currentStart)}` +
        `&currentEnd=${encodeURIComponent(currentEnd)}` +
        `&prevStart=${encodeURIComponent(prevStart)}` +
        `&prevEnd=${encodeURIComponent(prevEnd)}`;
      const response = await api.get(path, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setComparison(response);
      setComparisonToken(accessToken);
    } catch (requestError) {
      setComparisonError(requestError.message);
    } finally {
      setComparing(false);
    }
  };

  const visibleReport = reportToken === accessToken ? report : null;
  const visibleComparison = comparisonToken === accessToken ? comparison : null;

  const categoryBreakdown = useMemo(() => {
    if (!visibleReport?.transactions) return [];
    const byCategory = new Map();
    visibleReport.transactions.forEach((transaction) => {
      const name = transaction.category_name || 'Uncategorized';
      const entry = byCategory.get(name) || { name, income: 0, expense: 0 };
      const amount = Number(transaction.amount) || 0;
      if (transaction.type === 'income') entry.income += amount;
      else entry.expense += amount;
      byCategory.set(name, entry);
    });
    return [...byCategory.values()].sort(
      (a, b) => b.expense + b.income - (a.expense + a.income),
    );
  }, [visibleReport]);

  const categoryMax = useMemo(
    () =>
      categoryBreakdown.reduce(
        (max, entry) => Math.max(max, entry.income, entry.expense),
        0,
      ),
    [categoryBreakdown],
  );

  const monthlyMax = useMemo(() => {
    if (!visibleReport?.monthlyBreakdown) return 0;
    return visibleReport.monthlyBreakdown.reduce(
      (max, month) => Math.max(max, Number(month.income), Number(month.expense)),
      0,
    );
  }, [visibleReport]);

  return (
    <div className="reports-page">
      <section className="content-panel" aria-labelledby="reports-title">
        <div className="accounts-heading">
          <div>
            <p className="eyebrow">Spending insight</p>
            <h2 id="reports-title">Reports</h2>
          </div>
        </div>

        {!accessToken && (
          <p className="inline-message" role="status">
            <Link to="/login">Sign in</Link> to view and export your reports.
          </p>
        )}
        {error && <p className="form-message error-message" role="alert">{error}</p>}
        {notice && <p className="form-message success-message" role="status">{notice}</p>}

        <form className="account-form" onSubmit={runReport}>
          <h3>Choose a report</h3>
          <div className="report-mode-toggle" role="group" aria-label="Report type">
            <button
              className={mode === 'weekly' ? 'secondary-button active-toggle' : 'secondary-button'}
              onClick={() => setMode('weekly')}
              type="button"
            >
              Weekly
            </button>
            <button
              className={mode === 'monthly' ? 'secondary-button active-toggle' : 'secondary-button'}
              onClick={() => setMode('monthly')}
              type="button"
            >
              Monthly
            </button>
          </div>
          <div className="account-form-grid">
            {mode === 'weekly' ? (
              <>
                <label>
                  Start date
                  <input
                    name="startDate"
                    onChange={(event) => setStartDate(event.target.value)}
                    required
                    type="date"
                    value={startDate}
                  />
                </label>
                <label>
                  End date
                  <input
                    name="endDate"
                    onChange={(event) => setEndDate(event.target.value)}
                    required
                    type="date"
                    value={endDate}
                  />
                </label>
              </>
            ) : (
              <label>
                Year
                <input
                  max="2100"
                  min="2000"
                  name="year"
                  onChange={(event) => setYear(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={year}
                />
              </label>
            )}
          </div>
          <button className="primary-button" disabled={!accessToken || loading} type="submit">
            {loading ? 'Loading…' : 'Show report'}
          </button>
        </form>

        {visibleReport && (
          <div className="report-results" aria-live="polite">
            <div className="account-list-heading">
              <h3>{reportDescription}</h3>
              <div className="export-actions">
                <button
                  className="secondary-button"
                  disabled={exporting !== '' || !accessToken}
                  onClick={() => handleExport('csv')}
                  type="button"
                >
                  {exporting === 'csv' ? 'Exporting…' : 'Download CSV'}
                </button>
                <button
                  className="secondary-button"
                  disabled={exporting !== '' || !accessToken}
                  onClick={() => handleExport('pdf')}
                  type="button"
                >
                  {exporting === 'pdf' ? 'Exporting…' : 'Download PDF'}
                </button>
              </div>
            </div>
            <p className="field-note">
              The download contains the same selection shown on screen.
            </p>

            <ul className="report-summary-grid">
              <li className="report-stat">
                <span>Total income</span>
                <strong>{formatAmount(visibleReport.totalIncome)}</strong>
              </li>
              <li className="report-stat">
                <span>Total expense</span>
                <strong>{formatAmount(visibleReport.totalExpense)}</strong>
              </li>
              <li className="report-stat">
                <span>Net savings</span>
                <strong>{formatAmount(visibleReport.netSavings)}</strong>
              </li>
              <li className="report-stat">
                <span>Transactions</span>
                <strong>
                  {visibleReport.transactionCount ?? visibleReport.transactions?.length ?? 0}
                </strong>
              </li>
            </ul>

            <div className="report-chart">
              <h4>Spending by category</h4>
              {categoryBreakdown.length === 0 ? (
                <p className="empty-state">No transactions in this period.</p>
              ) : (
                <ul className="chart-rows">
                  {categoryBreakdown.map((entry) => (
                    <li className="chart-row" key={entry.name}>
                      <span className="chart-label">{entry.name}</span>
                      <span className="chart-bars">
                        <span
                          aria-label={`${entry.name} expenses ${formatAmount(entry.expense)}`}
                          className="chart-bar expense"
                          role="img"
                          style={{
                            width: categoryMax > 0 ? `${(entry.expense / categoryMax) * 100}%` : '0%',
                          }}
                        />
                        <span
                          aria-label={`${entry.name} income ${formatAmount(entry.income)}`}
                          className="chart-bar income"
                          role="img"
                          style={{
                            width: categoryMax > 0 ? `${(entry.income / categoryMax) * 100}%` : '0%',
                          }}
                        />
                      </span>
                      <span className="chart-value">
                        {formatAmount(entry.expense)} spent
                        {entry.income > 0 ? ` · ${formatAmount(entry.income)} earned` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="chart-legend">
                <span className="legend-swatch expense" aria-hidden="true" /> Expenses
                <span className="legend-swatch income" aria-hidden="true" /> Income
              </p>
            </div>

            {mode === 'monthly' && visibleReport.monthlyBreakdown && (
              <div className="report-chart">
                <h4>Month by month</h4>
                <ul className="month-chart">
                  {visibleReport.monthlyBreakdown.map((month) => (
                    <li className="month-column" key={month.month}>
                      <span className="month-bars">
                        <span
                          aria-label={`${MONTH_NAMES[month.month - 1]} income ${formatAmount(month.income)}`}
                          className="month-bar income"
                          role="img"
                          style={{
                            height:
                              monthlyMax > 0
                                ? `${(Number(month.income) / monthlyMax) * 100}%`
                                : '0%',
                          }}
                        />
                        <span
                          aria-label={`${MONTH_NAMES[month.month - 1]} expenses ${formatAmount(month.expense)}`}
                          className="month-bar expense"
                          role="img"
                          style={{
                            height:
                              monthlyMax > 0
                                ? `${(Number(month.expense) / monthlyMax) * 100}%`
                                : '0%',
                          }}
                        />
                      </span>
                      <span className="month-label">{MONTH_NAMES[month.month - 1]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <form className="account-form comparison-form" onSubmit={runComparison}>
          <h3>Compare two periods</h3>
          <div className="account-form-grid">
            <label>
              Current period start
              <input
                name="currentStart"
                onChange={(event) => setCurrentStart(event.target.value)}
                required
                type="date"
                value={currentStart}
              />
            </label>
            <label>
              Current period end
              <input
                name="currentEnd"
                onChange={(event) => setCurrentEnd(event.target.value)}
                required
                type="date"
                value={currentEnd}
              />
            </label>
            <label>
              Previous period start
              <input
                name="prevStart"
                onChange={(event) => setPrevStart(event.target.value)}
                required
                type="date"
                value={prevStart}
              />
            </label>
            <label>
              Previous period end
              <input
                name="prevEnd"
                onChange={(event) => setPrevEnd(event.target.value)}
                required
                type="date"
                value={prevEnd}
              />
            </label>
          </div>
          <button className="primary-button" disabled={!accessToken || comparing} type="submit">
            {comparing ? 'Comparing…' : 'Compare periods'}
          </button>
        </form>

        {comparisonError && (
          <p className="form-message error-message" role="alert">{comparisonError}</p>
        )}

        {visibleComparison && (
          <div className="comparison-results" aria-live="polite">
            <div className="account-list-heading">
              <h3>
                {visibleComparison.currentPeriod.startDate} to{' '}
                {visibleComparison.currentPeriod.endDate} vs{' '}
                {visibleComparison.previousPeriod.startDate} to{' '}
                {visibleComparison.previousPeriod.endDate}
              </h3>
            </div>
            <ul className="comparison-grid">
              <ChangeCard
                change={visibleComparison.comparison.incomeChange}
                current={visibleComparison.currentPeriod.totalIncome}
                label="Income"
                previous={visibleComparison.previousPeriod.totalIncome}
              />
              <ChangeCard
                change={visibleComparison.comparison.expenseChange}
                current={visibleComparison.currentPeriod.totalExpense}
                label="Expenses"
                previous={visibleComparison.previousPeriod.totalExpense}
              />
              <ChangeCard
                change={visibleComparison.comparison.netSavingsChange}
                current={visibleComparison.currentPeriod.netSavings}
                label="Net savings"
                previous={visibleComparison.previousPeriod.netSavings}
              />
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
