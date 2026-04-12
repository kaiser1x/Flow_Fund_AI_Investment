'use strict';

const pool = require('../config/db');
const alphaVantageService = require('../services/alphaVantageService');

// ── Threshold helpers (spec-defined) ─────────────────────────────────────────
function colorBand(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

function riskLabel(score) {
  if (score >= 80) return 'LOW';
  if (score >= 50) return 'MEDIUM';
  return 'HIGH';
}

function verdict(score) {
  if (score >= 80) return 'Ready to Invest';
  if (score >= 50) return 'Investable with Risk';
  return 'Not Ready to Invest';
}

function recommendation(score) {
  if (score >= 80) {
    return 'Your financial profile supports investing. You have sufficient income, a healthy savings rate, and an adequate cash buffer. Consider starting with diversified, low-risk index funds while continuing to monitor your monthly spending.';
  }
  if (score >= 50) {
    return 'You can begin investing, but proceed with caution. Focus on growing your cash buffer to at least 3 months of expenses and maintaining your savings rate above 20% before increasing investment contributions.';
  }
  return 'We recommend you stabilize your finances before investing. Build an emergency fund covering at least 3 months of expenses, reduce discretionary spending, and establish a consistent savings rate of at least 20% of your income.';
}

// ── Factor breakdown from raw metric values ──────────────────────────────────
function buildFactors(m) {
  const {
    monthly_income, monthly_expenses, savings_rate,
    volatility_score, cash_buffer_months, score,
  } = m;

  const hasIncome = monthly_income > 0;
  const goodSavings = savings_rate >= 20;
  const goodBuffer = cash_buffer_months >= 3;
  const lowVolatility = volatility_score <= 100;

  return [
    {
      label: 'Monthly Income',
      value: hasIncome ? `$${parseFloat(monthly_income).toFixed(2)}/mo` : 'Not detected',
      contribution: hasIncome ? '+20 pts' : '+0 pts',
      explanation: hasIncome
        ? 'Verified income detected. This is a prerequisite for any investment readiness score.'
        : 'No income transactions found this month. Income is required to begin investing.',
    },
    {
      label: 'Savings Rate',
      value: `${parseFloat(savings_rate).toFixed(1)}%`,
      contribution: goodSavings ? '+30 pts' : '+0 pts',
      explanation: goodSavings
        ? `Your savings rate of ${parseFloat(savings_rate).toFixed(1)}% exceeds the 20% threshold — strong position.`
        : `Your savings rate of ${parseFloat(savings_rate).toFixed(1)}% is below 20%. Increasing this is the highest-impact improvement you can make.`,
    },
    {
      label: 'Cash Buffer',
      value: `${parseFloat(cash_buffer_months).toFixed(1)} months`,
      contribution: goodBuffer ? '+30 pts' : '+0 pts',
      explanation: goodBuffer
        ? `You have ${parseFloat(cash_buffer_months).toFixed(1)} months of expenses covered by your balance — above the 3-month safety threshold.`
        : `Your balance covers ${parseFloat(cash_buffer_months).toFixed(1)} months of expenses. Reaching 3 months is the next priority before investing.`,
    },
    {
      label: 'Spending Stability',
      value: lowVolatility
        ? 'Stable'
        : `Volatile (σ=$${parseFloat(volatility_score).toFixed(0)})`,
      contribution: lowVolatility ? '+20 pts' : '+0 pts',
      explanation: lowVolatility
        ? 'Your monthly spending is consistent with low variance — a sign of financial discipline.'
        : 'Your spending varies significantly month to month. Stabilising expenses will unlock 20 additional points.',
    },
  ];
}

function buildNoDataResult() {
  return {
    score: null,
    risk_level: null,
    color_band: null,
    verdict: null,
    factors: [],
    recommendation:
      'Connect your bank on the dashboard and sync transactions to generate your investment readiness score.',
    computed_at: null,
    source: 'none',
    message: 'No accounts connected. Connect your bank to start.',
  };
}

// ── GET /api/investment-readiness ─────────────────────────────────────────────
exports.getReadiness = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[INVEST_GET] user_id=${uid}`);

  try {
    // 1. Try latest stored score + metrics from DB
    const [scoreRows] = await pool.query(
      `SELECT score_value, risk_level, recommendation, generated_at
       FROM investment_scores
       WHERE user_id = ?
       ORDER BY generated_at DESC
       LIMIT 1`,
      [uid]
    );

    const [metricRows] = await pool.query(
      `SELECT monthly_income, monthly_expenses, savings_rate, volatility_score, cash_buffer_months
       FROM financial_metrics
       WHERE user_id = ?
       ORDER BY calculated_at DESC
       LIMIT 1`,
      [uid]
    );

    const hasScore   = scoreRows.length > 0;
    const hasMetrics = metricRows.length > 0;

    if (!hasScore || !hasMetrics) {
      console.log(`[INVEST_GET] no db data → none (hasScore=${hasScore} hasMetrics=${hasMetrics})`);
      return res.json(buildNoDataResult());
    }

    const score = parseInt(scoreRows[0].score_value, 10);
    const metrics = {
      monthly_income:     parseFloat(metricRows[0].monthly_income)     || 0,
      monthly_expenses:   parseFloat(metricRows[0].monthly_expenses)   || 0,
      savings_rate:       parseFloat(metricRows[0].savings_rate)       || 0,
      volatility_score:   parseFloat(metricRows[0].volatility_score)   || 0,
      cash_buffer_months: parseFloat(metricRows[0].cash_buffer_months) || 0,
      score,
    };

    console.log(`[INVEST_GET] source=db score=${score} band=${colorBand(score)} income=${metrics.monthly_income} buffer=${metrics.cash_buffer_months}`);

    res.json({
      score,
      risk_level:    riskLabel(score),
      color_band:    colorBand(score),
      verdict:       verdict(score),
      factors:       buildFactors(metrics),
      recommendation: recommendation(score),
      computed_at:   scoreRows[0].generated_at,
      source:        'db',
    });
  } catch (err) {
    console.error('[INVEST_GET_ERROR]', err.message);
    console.log('[INVEST_GET] db error → none fallback');
    return res.json(buildNoDataResult());
  }
};

const STOCK_IDEAS_DISCLAIMER =
  'Educational only — not financial advice. Prices and movers change quickly; verify any trade with your own research and risk tolerance.';

/** GET /api/investment-readiness/stock-ideas — top 3 names from Alpha Vantage movers (cached) or static ETFs. */
exports.getStockIdeas = async (req, res) => {
  try {
    const result = await alphaVantageService.getSuggestedStocksForReadiness(3);
    res.json({
      stocks: result.stocks,
      source: result.source,
      last_updated: result.last_updated,
      notice: result.notice,
      disclaimer: STOCK_IDEAS_DISCLAIMER,
    });
  } catch (err) {
    console.error('[INVEST_STOCK_IDEAS]', err.message);
    res.status(500).json({ error: 'Failed to load stock ideas' });
  }
};
