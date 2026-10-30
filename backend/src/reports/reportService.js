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

module.exports = {
  getWeeklyReportData,
  getMonthlyReportData,
};