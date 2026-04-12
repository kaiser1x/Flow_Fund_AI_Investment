'use strict';

const pool = require('../config/db');

// ══════════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE — all math is server-side
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Scenario 1 — Compound Interest / Savings Growth
 * FV = PV*(1+r/12)^(12t) + PMT*[((1+r/12)^(12t)-1)/(r/12)]
 */
function runCompoundInterest({ initial_amount, monthly_contribution, annual_rate, years }) {
  const PV  = parseFloat(initial_amount)      || 0;
  const PMT = parseFloat(monthly_contribution) || 0;
  const r   = parseFloat(annual_rate) / 100;   // accept % input, convert to decimal
  const t   = parseInt(years, 10);

  const projection = [];
  let totalContributed = PV;

  for (let yr = 1; yr <= t; yr++) {
    const n = 12 * yr;
    const factor = Math.pow(1 + r / 12, n);
    let fv;
    if (r === 0) {
      fv = PV + PMT * n;
    } else {
      fv = PV * factor + PMT * ((factor - 1) / (r / 12));
    }
    totalContributed = PV + PMT * n;
    projection.push({
      year: yr,
      projected_value:   Math.round(fv * 100) / 100,
      total_contributed: Math.round(totalContributed * 100) / 100,
      total_interest:    Math.round((fv - totalContributed) * 100) / 100,
    });
  }

  const final = projection[projection.length - 1];
  return {
    result_summary: {
      final_value:       final.projected_value,
      total_contributed: final.total_contributed,
      total_interest:    final.total_interest,
      years: t,
    },
    projection_data: projection,
  };
}

/**
 * Scenario 2 — Stock Market Investment
 * Base = compound interest; optimistic/pessimistic vary by volatility multiplier
 */
function runStockMarket({ initial_amount, monthly_contribution, annual_rate, years, volatility }) {
  const PV  = parseFloat(initial_amount)      || 0;
  const PMT = parseFloat(monthly_contribution) || 0;
  const r   = parseFloat(annual_rate) / 100;
  const t   = parseInt(years, 10);
  const vol = volatility || 'medium';

  const OPTIMISTIC_MULT  = { low: 1.20, medium: 1.35, high: 1.50 };
  const PESSIMISTIC_MULT = { low: 0.85, medium: 0.70, high: 0.55 };
  const optMult  = OPTIMISTIC_MULT[vol]  || 1.35;
  const pestMult = PESSIMISTIC_MULT[vol] || 0.70;

  function fvAt(rate, n) {
    if (rate === 0) return PV + PMT * n;
    const factor = Math.pow(1 + rate / 12, n);
    return PV * factor + PMT * ((factor - 1) / (rate / 12));
  }

  const projection = [];
  for (let yr = 1; yr <= t; yr++) {
    const n = 12 * yr;
    projection.push({
      year:        yr,
      base:        Math.round(fvAt(r, n) * 100) / 100,
      optimistic:  Math.round(fvAt(r * optMult,  n) * 100) / 100,
      pessimistic: Math.round(fvAt(r * pestMult, n) * 100) / 100,
    });
  }

  const final = projection[projection.length - 1];
  return {
    result_summary: {
      base_value:        final.base,
      optimistic_value:  final.optimistic,
      pessimistic_value: final.pessimistic,
      years: t,
      volatility: vol,
    },
    projection_data: projection,
  };
}

/**
 * Scenario 3 — Debt Payoff (standard amortization)
 * Monthly rate = annual_rate/12
 * Months = -log(1 - P*mr/M) / log(1+mr)  where mr = monthly_rate, M = monthly_payment
 */
function runDebtPayoff({ principal, annual_rate, monthly_payment }) {
  const P  = parseFloat(principal)       || 0;
  const mr = (parseFloat(annual_rate) / 100) / 12;  // monthly rate (decimal)
  const M  = parseFloat(monthly_payment) || 0;

  if (M <= 0) throw new Error('Monthly payment must be positive.');
  if (mr > 0 && M <= P * mr) throw new Error('Monthly payment is too low to cover interest. Increase it.');

  const projection = [];
  let balance      = P;
  let totalInterest = 0;
  let month        = 0;

  while (balance > 0.01 && month < 600) {
    month++;
    const interestCharge = balance * mr;
    const principalPaid  = Math.min(M - interestCharge, balance);
    totalInterest += interestCharge;
    balance       -= principalPaid;

    if (month <= 120 || month % 12 === 0) {  // store monthly for first 10y, then yearly
      projection.push({
        month,
        remaining_balance: Math.max(0, Math.round(balance * 100) / 100),
        interest_paid:     Math.round(totalInterest * 100) / 100,
        principal_paid:    Math.round((P - Math.max(0, balance)) * 100) / 100,
      });
    }
  }

  return {
    result_summary: {
      months_to_payoff: month,
      total_interest:   Math.round(totalInterest * 100) / 100,
      total_paid:       Math.round((M * month) * 100) / 100,
      principal,
    },
    projection_data: projection,
  };
}

/**
 * Scenario 4 — Emergency Fund Builder
 * target = monthly_expenses * target_months
 * months_to_goal = ceil((target - current_savings) / monthly_contribution)
 */
function runEmergencyFund({ monthly_expenses, target_months, current_savings, monthly_contribution }) {
  const expenses    = parseFloat(monthly_expenses)      || 0;
  const targetMo    = parseInt(target_months, 10)       || 6;
  const savings     = parseFloat(current_savings)       || 0;
  const contribution= parseFloat(monthly_contribution)  || 0;

  if (contribution <= 0) throw new Error('Monthly contribution must be positive.');

  const target    = expenses * targetMo;
  const remaining = Math.max(0, target - savings);
  const monthsToGoal = remaining <= 0 ? 0 : Math.ceil(remaining / contribution);

  const completionDate = new Date();
  completionDate.setMonth(completionDate.getMonth() + monthsToGoal);

  const projection = [];
  let balance = savings;
  for (let mo = 1; mo <= Math.min(monthsToGoal, 120); mo++) {
    balance = Math.min(target, balance + contribution);
    projection.push({
      month:   mo,
      balance: Math.round(balance * 100) / 100,
      target:  Math.round(target * 100) / 100,
    });
  }
  // Ensure goal point is in projection
  if (monthsToGoal > 0 && (projection.length === 0 || projection[projection.length - 1].balance < target)) {
    projection.push({ month: monthsToGoal, balance: Math.round(target * 100) / 100, target: Math.round(target * 100) / 100 });
  }

  return {
    result_summary: {
      target_amount:     Math.round(target * 100) / 100,
      months_to_goal:    monthsToGoal,
      completion_date:   completionDate.toISOString().slice(0, 10),
      current_savings:   savings,
      monthly_contribution: contribution,
    },
    projection_data: projection,
  };
}

// ── Dispatch simulation by type ───────────────────────────────────────────────
function computeSimulation(scenario_type, inputs) {
  switch (scenario_type) {
    case 'compound_interest': return runCompoundInterest(inputs);
    case 'stock_market':      return runStockMarket(inputs);
    case 'debt_payoff':       return runDebtPayoff(inputs);
    case 'emergency_fund':    return runEmergencyFund(inputs);
    default: throw new Error(`Unknown scenario type: ${scenario_type}`);
  }
}

// ── Validation ────────────────────────────────────────────────────────────────
const VALID_TYPES = ['compound_interest', 'stock_market', 'debt_payoff', 'emergency_fund'];

function validateInputs(scenario_type, inputs) {
  const errs = [];
  if (!VALID_TYPES.includes(scenario_type)) errs.push('Invalid scenario_type.');

  if (scenario_type === 'compound_interest') {
    if (inputs.initial_amount == null || parseFloat(inputs.initial_amount) < 0) errs.push('initial_amount must be non-negative.');
    if (!inputs.monthly_contribution || parseFloat(inputs.monthly_contribution) < 0) errs.push('monthly_contribution must be non-negative.');
    if (inputs.annual_rate == null || parseFloat(inputs.annual_rate) < 0 || parseFloat(inputs.annual_rate) > 100) errs.push('annual_rate must be 0–100.');
    if (!inputs.years || parseInt(inputs.years) < 1 || parseInt(inputs.years) > 50) errs.push('years must be 1–50.');
  }
  if (scenario_type === 'stock_market') {
    if (inputs.initial_amount == null || parseFloat(inputs.initial_amount) < 0) errs.push('initial_amount must be non-negative.');
    if (!inputs.monthly_contribution || parseFloat(inputs.monthly_contribution) < 0) errs.push('monthly_contribution must be non-negative.');
    if (inputs.annual_rate == null || parseFloat(inputs.annual_rate) < 0 || parseFloat(inputs.annual_rate) > 100) errs.push('annual_rate must be 0–100.');
    if (!inputs.years || parseInt(inputs.years) < 1 || parseInt(inputs.years) > 50) errs.push('years must be 1–50.');
    if (inputs.volatility && !['low','medium','high'].includes(inputs.volatility)) errs.push('volatility must be low|medium|high.');
  }
  if (scenario_type === 'debt_payoff') {
    if (!inputs.principal || parseFloat(inputs.principal) <= 0) errs.push('principal must be positive.');
    if (inputs.annual_rate == null || parseFloat(inputs.annual_rate) < 0) errs.push('annual_rate must be non-negative.');
    if (!inputs.monthly_payment || parseFloat(inputs.monthly_payment) <= 0) errs.push('monthly_payment must be positive.');
  }
  if (scenario_type === 'emergency_fund') {
    if (!inputs.monthly_expenses || parseFloat(inputs.monthly_expenses) <= 0) errs.push('monthly_expenses must be positive.');
    if (!inputs.target_months || parseInt(inputs.target_months) < 1) errs.push('target_months must be at least 1.');
    if (inputs.current_savings == null || parseFloat(inputs.current_savings) < 0) errs.push('current_savings must be non-negative.');
    if (!inputs.monthly_contribution || parseFloat(inputs.monthly_contribution) <= 0) errs.push('monthly_contribution must be positive.');
  }
  return errs;
}

// ── Pre-fill data from existing services ──────────────────────────────────────
async function getPreFillData(user_id) {
  const now   = new Date();
  const d30   = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
  const d90   = new Date(now - 90 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  let current_balance = 0, avg_monthly_spending = 0, avg_monthly_savings = 0, investment_readiness_score = null;

  try {
    const [balRows] = await pool.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM bank_accounts WHERE user_id = ?`, [user_id]
    );
    current_balance = parseFloat(balRows[0].total) || 0;
  } catch (_) {}

  try {
    const [spendRows] = await pool.query(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= ? AND t.transaction_date <= ?`,
      [user_id, d90, today]
    );
    avg_monthly_spending = Math.round((parseFloat(spendRows[0].total) || 0) / 3 * 100) / 100;
  } catch (_) {}

  try {
    const [incRows] = await pool.query(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'INCOME'
         AND t.transaction_date >= ?`,
      [user_id, d30]
    );
    const income30 = parseFloat(incRows[0].total) || 0;
    avg_monthly_savings = Math.max(0, Math.round((income30 - avg_monthly_spending) * 100) / 100);
  } catch (_) {}

  try {
    const [scoreRows] = await pool.query(
      `SELECT score_value FROM investment_scores WHERE user_id = ? ORDER BY generated_at DESC LIMIT 1`, [user_id]
    );
    if (scoreRows.length > 0) investment_readiness_score = parseInt(scoreRows[0].score_value, 10);
  } catch (_) {}

  console.log(`[SIM_PREFILL] user_id=${user_id} balance=${current_balance} spending=${avg_monthly_spending} savings=${avg_monthly_savings} ir_score=${investment_readiness_score}`);
  return { current_balance, avg_monthly_spending, avg_monthly_savings, investment_readiness_score };
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ══════════════════════════════════════════════════════════════════════════════

const DISCLAIMER = 'These projections are estimates only based on the inputs provided. They do not constitute financial advice. Actual results will vary based on market conditions, taxes, fees, and other factors.';

// POST /api/simulations/run ────────────────────────────────────────────────────
exports.runSimulation = (req, res) => {
  const { scenario_type, inputs } = req.body;
  console.log(`[SIM_RUN] scenario_type=${scenario_type} inputs=${JSON.stringify(inputs)}`);

  const errs = validateInputs(scenario_type, inputs || {});
  if (errs.length > 0) return res.status(400).json({ error: errs[0], all_errors: errs });

  try {
    const { result_summary, projection_data } = computeSimulation(scenario_type, inputs);
    console.log(`[SIM_RUN] done scenario=${scenario_type} summary=${JSON.stringify(result_summary)}`);
    res.json({ scenario_type, inputs, result_summary, projection_data, disclaimer: DISCLAIMER });
  } catch (err) {
    console.error('[SIM_RUN_ERROR]', err.message);
    res.status(400).json({ error: err.message });
  }
};

// GET /api/simulations/prefill ─────────────────────────────────────────────────
exports.getPreFill = async (req, res) => {
  const uid = req.user?.user_id;
  try {
    const data = await getPreFillData(uid);
    res.json(data);
  } catch (err) {
    console.error('[SIM_PREFILL_ERROR]', err.message);
    res.json({ current_balance: 0, avg_monthly_spending: 0, avg_monthly_savings: 0, investment_readiness_score: null });
  }
};

// GET /api/simulations ─────────────────────────────────────────────────────────
exports.getSnapshots = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[SIM_GET] user_id=${uid}`);
  try {
    const [rows] = await pool.query(
      `SELECT sim_id, user_id, name, scenario_type, inputs, result_summary, created_at, updated_at
       FROM simulations WHERE user_id = ? ORDER BY created_at DESC`,
      [uid]
    );
    if (rows.length === 0) {
      console.log(`[SIM_GET] no snapshots → empty`);
      return res.json({ snapshots: [], source: 'empty' });
    }
    // Parse JSON fields
    const snapshots = rows.map(r => ({
      ...r,
      inputs:         typeof r.inputs === 'string'         ? JSON.parse(r.inputs)         : r.inputs,
      result_summary: typeof r.result_summary === 'string' ? JSON.parse(r.result_summary) : r.result_summary,
    }));
    console.log(`[SIM_GET] source=db count=${snapshots.length}`);
    res.json({ snapshots, source: 'db' });
  } catch (err) {
    console.error('[SIM_GET_ERROR]', err.message);
    res.json({ snapshots: [], source: 'empty' });
  }
};

// GET /api/simulations/summary ─────────────────────────────────────────────────
exports.getSnapshotsSummary = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[SIM_SUMMARY] user_id=${uid}`);
  try {
    const [rows] = await pool.query(
      `SELECT sim_id, name, scenario_type, result_summary, created_at
       FROM simulations WHERE user_id = ? ORDER BY created_at DESC LIMIT 3`,
      [uid]
    );
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM simulations WHERE user_id = ?`, [uid]
    );
    const total = parseInt(countRows[0].cnt, 10) || 0;

    if (total === 0) {
      return res.json({ snapshots: [], total_count: 0, source: 'empty' });
    }
    const snapshots = rows.map(r => ({
      ...r,
      result_summary: typeof r.result_summary === 'string' ? JSON.parse(r.result_summary) : r.result_summary,
    }));
    console.log(`[SIM_SUMMARY] source=db count=${snapshots.length} total=${total}`);
    res.json({ snapshots, total_count: total, source: 'db' });
  } catch (err) {
    console.error('[SIM_SUMMARY_ERROR]', err.message);
    res.json({ snapshots: [], total_count: 0, source: 'empty' });
  }
};

// POST /api/simulations/save ───────────────────────────────────────────────────
exports.saveSnapshot = async (req, res) => {
  const uid = req.user?.user_id;
  const { name, scenario_type, inputs, result_summary, projection_data } = req.body;
  console.log(`[SIM_SAVE] user_id=${uid} name="${name}" type=${scenario_type}`);

  if (!name || !name.trim()) return res.status(400).json({ error: 'Simulation name is required.' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or less.' });
  if (!VALID_TYPES.includes(scenario_type)) return res.status(400).json({ error: 'Invalid scenario_type.' });
  if (!inputs || !result_summary) return res.status(400).json({ error: 'inputs and result_summary are required.' });

  try {
    const [result] = await pool.query(
      `INSERT INTO simulations (user_id, name, scenario_type, inputs, result_summary, projection_data)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [uid, name.trim(), scenario_type,
        JSON.stringify(inputs),
        JSON.stringify(result_summary),
        JSON.stringify(projection_data || [])]
    );
    const [rows] = await pool.query(
      `SELECT sim_id, name, scenario_type, inputs, result_summary, created_at FROM simulations WHERE sim_id = ?`,
      [result.insertId]
    );
    const snap = rows[0];
    snap.inputs         = typeof snap.inputs === 'string' ? JSON.parse(snap.inputs) : snap.inputs;
    snap.result_summary = typeof snap.result_summary === 'string' ? JSON.parse(snap.result_summary) : snap.result_summary;
    console.log(`[SIM_SAVE] saved sim_id=${result.insertId}`);
    res.status(201).json({ snapshot: snap });
  } catch (err) {
    console.error('[SIM_SAVE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to save simulation.' });
  }
};

// PATCH /api/simulations/:id ───────────────────────────────────────────────────
exports.updateSnapshot = async (req, res) => {
  const uid   = req.user?.user_id;
  const simId = parseInt(req.params.id, 10);
  const { name } = req.body;
  console.log(`[SIM_UPDATE] user_id=${uid} sim_id=${simId}`);

  const [existing] = await pool.query(`SELECT sim_id FROM simulations WHERE sim_id = ? AND user_id = ?`, [simId, uid]);
  if (existing.length === 0) return res.status(404).json({ error: 'Simulation not found.' });

  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'Name cannot be empty.' });
    if (name.trim().length > 100) return res.status(400).json({ error: 'Name must be 100 characters or less.' });
  }

  try {
    await pool.query(`UPDATE simulations SET name = ? WHERE sim_id = ? AND user_id = ?`,
      [(name || '').trim() || existing[0].name, simId, uid]);
    const [rows] = await pool.query(
      `SELECT sim_id, name, scenario_type, result_summary, created_at FROM simulations WHERE sim_id = ?`, [simId]
    );
    const snap = rows[0];
    snap.result_summary = typeof snap.result_summary === 'string' ? JSON.parse(snap.result_summary) : snap.result_summary;
    res.json({ snapshot: snap });
  } catch (err) {
    console.error('[SIM_UPDATE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to update simulation.' });
  }
};

// DELETE /api/simulations/:id ──────────────────────────────────────────────────
exports.deleteSnapshot = async (req, res) => {
  const uid   = req.user?.user_id;
  const simId = parseInt(req.params.id, 10);
  console.log(`[SIM_DELETE] user_id=${uid} sim_id=${simId}`);
  try {
    const [existing] = await pool.query(`SELECT sim_id FROM simulations WHERE sim_id = ? AND user_id = ?`, [simId, uid]);
    if (existing.length === 0) return res.status(404).json({ error: 'Simulation not found.' });
    await pool.query(`DELETE FROM simulations WHERE sim_id = ? AND user_id = ?`, [simId, uid]);
    console.log(`[SIM_DELETE] deleted sim_id=${simId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[SIM_DELETE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to delete simulation.' });
  }
};

// Expose engine for tests
exports._engine = { runCompoundInterest, runStockMarket, runDebtPayoff, runEmergencyFund };
