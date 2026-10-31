const reportRepository = require('./reportRepository');

async function getWeeklyReportData(userId, startDate, endDate) {
  const transactions = await reportRepository.getWeeklyTransactions(userId, startDate, endDate);
  
  let totalIncome = 0;
  let totalExpense = 0;

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0;
    if (tx.type === 'income') {
      totalIncome += amount;
    } else if (tx.type === 'expense') {
      totalExpense += amount;
    }
  });

  return {
    startDate,
    endDate,
    totalIncome: totalIncome.toFixed(2),
    totalExpense: totalExpense.toFixed(2),
    netSavings: (totalIncome - totalExpense).toFixed(2),
    transactionCount: transactions.length,
    transactions,
  };
}

async function getMonthlyReportData(userId, year) {
  const targetYear = year || new Date().getFullYear();
  const transactions = await reportRepository.getMonthlyTransactions(userId, targetYear);

  let totalIncome = 0;
  let totalExpense = 0;
  const monthlyBreakdown = Array(12).fill(0).map((_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
  }));

  transactions.forEach(tx => {
    const amount = parseFloat(tx.amount) || 0;
    const monthIndex = new Date(tx.date).getMonth();

    if (tx.type === 'income') {
      totalIncome += amount;
      if (monthlyBreakdown[monthIndex]) {
        monthlyBreakdown[monthIndex].income += amount;
      }
    } else if (tx.type === 'expense') {
      totalExpense += amount;
      if (monthlyBreakdown[monthIndex]) {
        monthlyBreakdown[monthIndex].expense += amount;
      }
    }
  });

  return {
    year: targetYear,
    totalIncome: totalIncome.toFixed(2),
    totalExpense: totalExpense.toFixed(2),
    netSavings: (totalIncome - totalExpense).toFixed(2),
    monthlyBreakdown: monthlyBreakdown.map(m => ({
      ...m,
      income: m.income.toFixed(2),
      expense: m.expense.toFixed(2),
    })),
    transactions,
  };
}

/**
 * Period-over-period comparison (SEBM-F-042 / S2-11)
 */
async function getPeriodComparisonData(userId, currentStart, currentEnd, prevStart, prevEnd) {
  const currentTransactions = await reportRepository.getWeeklyTransactions(userId, currentStart, currentEnd);
  const prevTransactions = await reportRepository.getWeeklyTransactions(userId, prevStart, prevEnd);

  const calculateTotals = (txs) => {
    let income = 0;
    let expense = 0;
    txs.forEach(t => {
      const amt = parseFloat(t.amount) || 0;
      if (t.type === 'income') income += amt;
      else if (t.type === 'expense') expense += amt;
    });
    return { income, expense, net: income - expense };
  };

  const current = calculateTotals(currentTransactions);
  const previous = calculateTotals(prevTransactions);

  const calcChange = (curr, prev) => {
    if (prev === 0) return curr === 0 ? '0.00%' : '+100.00%';
    const diff = curr - prev;
    const pct = (diff / Math.abs(prev)) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
  };

  return {
    currentPeriod: {
      startDate: currentStart,
      endDate: currentEnd,
      totalIncome: current.income.toFixed(2),
      totalExpense: current.expense.toFixed(2),
      netSavings: current.net.toFixed(2),
      transactionCount: currentTransactions.length,
    },
    previousPeriod: {
      startDate: prevStart,
      endDate: prevEnd,
      totalIncome: previous.income.toFixed(2),
      totalExpense: previous.expense.toFixed(2),
      netSavings: previous.net.toFixed(2),
      transactionCount: prevTransactions.length,
    },
    comparison: {
      incomeChange: calcChange(current.income, previous.income),
      expenseChange: calcChange(current.expense, previous.expense),
      netSavingsChange: calcChange(current.net, previous.net),
    },
  };
}

module.exports = {
  getWeeklyReportData,
  getMonthlyReportData,
  getPeriodComparisonData,
};