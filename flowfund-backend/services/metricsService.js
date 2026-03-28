const pool = require('../config/db');

/**
 * Calculates derived financial metrics for a user from their imported
 * transaction and account data, then writes results to financial_metrics
 * and investment_scores.
 *
 * Called automatically after each transaction import so downstream
 * features (dashboard, readiness score, alerts) always have fresh data.
 */
async function calculate(user_id) {
  const now       = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1; // 1-based

  // ── Monthly income & expenses (current calendar month) ──────────────────
  const [incomeRows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'INCOME'
       AND YEAR(t.transaction_date)  = ?
       AND MONTH(t.transaction_date) = ?`,
    [user_id, thisYear, thisMonth]
  );

  const [expenseRows] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND YEAR(t.transaction_date)  = ?
       AND MONTH(t.transaction_date) = ?`,
    [user_id, thisYear, thisMonth]
  );

  const monthly_income   = parseFloat(incomeRows[0].total)  || 0;
  const monthly_expenses = parseFloat(expenseRows[0].total) || 0;

  // ── Savings rate ─────────────────────────────────────────────────────────
  let savings_rate = 0;
  if (monthly_income > 0) {
    savings_rate = ((monthly_income - monthly_expenses) / monthly_income) * 100;
    savings_rate = Math.max(0, Math.min(100, savings_rate));
  }

  // ── Volatility score (std dev of monthly expenses, last 3 months) ────────
  const [monthlyExpRows] = await pool.query(
    `SELECT YEAR(t.transaction_date)  AS yr,
            MONTH(t.transaction_date) AS mo,
            SUM(t.amount)             AS total
     FROM transactions t
     JOIN bank_accounts b ON t.account_id = b.account_id
     WHERE b.user_id = ?
       AND t.transaction_type = 'EXPENSE'
       AND t.transaction_date >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
     GROUP BY yr, mo`,
    [user_id]
  );

  let volatility_score = 0;
  if (monthlyExpRows.length > 1) {
    const totals = monthlyExpRows.map(r => parseFloat(r.total));
    const mean   = totals.reduce((a, b) => a + b, 0) / totals.length;
    const variance = totals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / totals.length;
    volatility_score = Math.sqrt(variance);
  }

  // ── Cash buffer months (total balance ÷ monthly expenses) ────────────────
  const [balanceRows] = await pool.query(
    `SELECT COALESCE(SUM(balance), 0) AS total
     FROM bank_accounts
     WHERE user_id = ?`,
    [user_id]
  );

  const totalBalance = parseFloat(balanceRows[0].total) || 0;
  const cash_buffer_months = monthly_expenses > 0
    ? totalBalance / monthly_expenses
    : 0;

  // ── Persist financial_metrics ─────────────────────────────────────────────
  await pool.query(
    `INSERT INTO financial_metrics
       (user_id, monthly_income, monthly_expenses, savings_rate, volatility_score, cash_buffer_months)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [user_id, monthly_income, monthly_expenses,
     savings_rate.toFixed(2), volatility_score.toFixed(2), cash_buffer_months.toFixed(2)]
  );

  // ── Investment readiness score (rule-based, feeds investment_scores) ──────
  let score = 0;
  if (monthly_income   >   0) score += 20;
  if (savings_rate     >=  20) score += 30;
  if (cash_buffer_months >= 3) score += 30;
  if (volatility_score <=  100) score += 20;

  const risk_level = score >= 70 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW';

  const recommendations = {
    HIGH:   'Your financial profile shows strong readiness. Consider exploring low-risk index funds.',
    MEDIUM: 'You are making progress. Focus on growing your cash buffer and reducing expense volatility.',
    LOW:    'Build an emergency fund and reduce discretionary spending before investing.',
  };

  await pool.query(
    `INSERT INTO investment_scores (user_id, score_value, risk_level, recommendation)
     VALUES (?, ?, ?, ?)`,
    [user_id, score, risk_level, recommendations[risk_level]]
  );

  return { monthly_income, monthly_expenses, savings_rate, volatility_score, cash_buffer_months, score, risk_level };
}

module.exports = { calculate };
