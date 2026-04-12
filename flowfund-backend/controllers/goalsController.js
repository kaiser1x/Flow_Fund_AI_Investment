'use strict';

const pool = require('../config/db');

// ── Progress & status helpers ─────────────────────────────────────────────────
function computeProgress(goal) {
  const pct = goal.target_amount > 0
    ? Math.min(100, Math.round((goal.current_amount / goal.target_amount) * 100))
    : 0;
  return pct;
}

function computeStatus(goal) {
  const pct = computeProgress(goal);
  if (pct >= 100) return 'Completed';

  const now = new Date();
  const target = new Date(goal.target_date);
  if (target < now) return 'Behind';

  const created = goal.created_at ? new Date(goal.created_at) : now;
  const totalMs = target - created;
  const elapsedMs = now - created;
  const expectedPct = totalMs > 0 ? Math.round((elapsedMs / totalMs) * 100) : 0;

  if (pct >= expectedPct - 10) return 'On Track';
  if (pct >= expectedPct - 25) return 'At Risk';
  return 'Behind';
}

function statusColor(status) {
  if (status === 'On Track' || status === 'Completed') return 'green';
  if (status === 'At Risk') return 'yellow';
  return 'red';
}

function enrichGoal(goal) {
  const progress_pct = computeProgress(goal);
  const status_label = goal.status === 'completed' ? 'Completed' : computeStatus(goal);
  return {
    ...goal,
    target_amount:  parseFloat(goal.target_amount)  || 0,
    current_amount: parseFloat(goal.current_amount) || 0,
    progress_pct,
    status_label,
    status_color: statusColor(status_label),
  };
}

// ── Auto-track: pull current_amount from existing data sources ───────────────
async function autoTrackAmount(goal, user_id) {
  if (!goal.auto_track) return parseFloat(goal.current_amount) || 0;

  try {
    const now = new Date();
    const d30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    if (goal.type === 'savings') {
      // Use total balance across all bank accounts
      const [rows] = await pool.query(
        `SELECT COALESCE(SUM(balance), 0) AS total FROM bank_accounts WHERE user_id = ?`,
        [user_id]
      );
      const amount = parseFloat(rows[0].total) || 0;
      console.log(`[GOALS_TRACK] goal_id=${goal.goal_id} type=savings auto_amount=${amount}`);
      return amount;
    }

    if (goal.type === 'spending_limit') {
      // Use last 30 days of expenses
      const [rows] = await pool.query(
        `SELECT COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t
         JOIN bank_accounts b ON t.account_id = b.account_id
         WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
           AND t.transaction_date >= ? AND t.transaction_date <= ?`,
        [user_id, d30, today]
      );
      const amount = parseFloat(rows[0].total) || 0;
      console.log(`[GOALS_TRACK] goal_id=${goal.goal_id} type=spending_limit auto_amount=${amount}`);
      return amount;
    }
  } catch (err) {
    console.error(`[GOALS_TRACK_ERROR] goal_id=${goal.goal_id}`, err.message);
  }

  return parseFloat(goal.current_amount) || 0;
}

// ── Growth insights from existing snapshot data ───────────────────────────────
async function computeInsights(user_id) {
  try {
    const now = new Date();
    const d30 = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const d60 = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
    const today = now.toISOString().slice(0, 10);

    // Spending: last 30d vs prior 30d
    const [spendRows] = await pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.transaction_date >= ? THEN t.amount ELSE 0 END), 0) AS spend_recent,
         COALESCE(SUM(CASE WHEN t.transaction_date < ? AND t.transaction_date >= ? THEN t.amount ELSE 0 END), 0) AS spend_prior
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'EXPENSE'
         AND t.transaction_date >= ?`,
      [d30, d30, d60, user_id, d60]
    );
    const spendRecent = parseFloat(spendRows[0].spend_recent) || 0;
    const spendPrior  = parseFloat(spendRows[0].spend_prior)  || 0;

    // Balance: current vs 30d ago (approximate via transactions delta)
    const [balRows] = await pool.query(
      `SELECT COALESCE(SUM(balance), 0) AS total FROM bank_accounts WHERE user_id = ?`,
      [user_id]
    );
    const currentBalance = parseFloat(balRows[0].total) || 0;

    const [incomeRows] = await pool.query(
      `SELECT COALESCE(SUM(t.amount), 0) AS total
       FROM transactions t
       JOIN bank_accounts b ON t.account_id = b.account_id
       WHERE b.user_id = ? AND t.transaction_type = 'INCOME'
         AND t.transaction_date >= ?`,
      [user_id, d30]
    );
    const income30 = parseFloat(incomeRows[0].total) || 0;

    let spending_trend = 'stable';
    if (spendPrior > 0) {
      const delta = (spendRecent - spendPrior) / spendPrior;
      if (delta > 0.05) spending_trend = 'up';
      else if (delta < -0.05) spending_trend = 'down';
    }

    const net30 = income30 - spendRecent;
    const balance_trend = net30 > 0 ? 'up' : net30 < -50 ? 'down' : 'stable';

    const spendDirStr = spending_trend === 'up'
      ? `spending increased by $${(spendRecent - spendPrior).toFixed(0)} compared to last month`
      : spending_trend === 'down'
      ? `spending decreased by $${(spendPrior - spendRecent).toFixed(0)} compared to last month`
      : 'spending remained stable compared to last month';

    const balDirStr = balance_trend === 'up'
      ? `Your net cash flow is positive (+$${net30.toFixed(0)}), which means your balance is growing`
      : balance_trend === 'down'
      ? `Your net cash flow is negative ($${net30.toFixed(0)}), which is putting pressure on your balance`
      : 'Your income and spending are nearly balanced this month';

    const summary = `This month, your ${spendDirStr}. ${balDirStr}. Current total balance is $${currentBalance.toFixed(2)}.${income30 > 0 ? ` You brought in $${income30.toFixed(2)} in income over the last 30 days.` : ''}`;

    console.log(`[GOALS_INSIGHTS] user_id=${user_id} spending_trend=${spending_trend} balance_trend=${balance_trend} source=db`);
    return { spending_trend, balance_trend, summary, source: 'db' };

  } catch (err) {
    console.error('[GOALS_INSIGHTS_ERROR]', err.message);
    return {
      spending_trend: 'stable',
      balance_trend: 'stable',
      summary:
        'Connect a bank account and sync transactions to see spending and balance trends here.',
      source: 'none',
    };
  }
}

// ── GET /api/goals ─────────────────────────────────────────────────────────────
exports.getGoals = async (req, res) => {
  const uid = req.user?.user_id;
  const filter = req.query.filter || 'all'; // all | active | completed
  console.log(`[GOALS_GET] user_id=${uid} filter=${filter}`);

  try {
    let statusClause = '';
    if (filter === 'active')    statusClause = `AND g.status = 'active'`;
    if (filter === 'completed') statusClause = `AND g.status = 'completed'`;

    const [rows] = await pool.query(
      `SELECT * FROM goals WHERE user_id = ? ${statusClause} ORDER BY created_at DESC`,
      [uid]
    );

    if (rows.length === 0 && filter === 'all') {
      console.log(`[GOALS_GET] no goals → empty`);
      return res.json({ goals: [], source: 'empty' });
    }

    // Auto-track supported goal types
    const enriched = await Promise.all(rows.map(async g => {
      const tracked = await autoTrackAmount(g, uid);
      return enrichGoal({ ...g, current_amount: tracked });
    }));

    console.log(`[GOALS_GET] source=db count=${enriched.length}`);
    res.json({ goals: enriched, source: 'db' });

  } catch (err) {
    console.error('[GOALS_GET_ERROR]', err.message);
    res.json({ goals: [], source: 'empty' });
  }
};

// ── GET /api/goals/summary ─────────────────────────────────────────────────────
exports.getGoalsSummary = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[GOALS_SUMMARY] user_id=${uid}`);

  try {
    const [rows] = await pool.query(
      `SELECT * FROM goals WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC`,
      [uid]
    );

    if (rows.length === 0) {
      return res.json({
        goals: [],
        total: 0,
        on_track: 0,
        at_risk: 0,
        completed: 0,
        source: 'empty',
      });
    }

    const enriched = await Promise.all(rows.map(async g => {
      const tracked = await autoTrackAmount(g, uid);
      return enrichGoal({ ...g, current_amount: tracked });
    }));

    const [completedRows] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM goals WHERE user_id = ? AND status = 'completed'`,
      [uid]
    );

    const top3 = enriched.slice(0, 3);
    console.log(`[GOALS_SUMMARY] source=db active=${enriched.length} top3=${top3.length}`);
    res.json({
      goals: top3,
      total: enriched.length,
      on_track: enriched.filter(g => g.status_label === 'On Track').length,
      at_risk: enriched.filter(g => g.status_label === 'At Risk').length,
      completed: parseInt(completedRows[0].cnt, 10) || 0,
      source: 'db',
    });

  } catch (err) {
    console.error('[GOALS_SUMMARY_ERROR]', err.message);
    res.json({ goals: [], total: 0, on_track: 0, at_risk: 0, completed: 0, source: 'empty' });
  }
};

// ── GET /api/goals/insights ────────────────────────────────────────────────────
exports.getGoalsInsights = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[GOALS_INSIGHTS_REQ] user_id=${uid}`);
  const insights = await computeInsights(uid);
  res.json(insights);
};

// ── POST /api/goals ────────────────────────────────────────────────────────────
exports.createGoal = async (req, res) => {
  const uid = req.user?.user_id;
  const { name, type, target_amount, current_amount, target_date, notes, auto_track } = req.body;
  console.log(`[GOALS_CREATE] user_id=${uid} name="${name}" type=${type}`);

  // Validation
  if (!name || !name.trim()) return res.status(400).json({ error: 'Goal name is required.' });
  if (name.trim().length > 100) return res.status(400).json({ error: 'Goal name must be 100 characters or less.' });
  const VALID_TYPES = ['savings', 'debt_payoff', 'spending_limit', 'investment_target'];
  if (!type || !VALID_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid goal type.' });
  const tAmount = parseFloat(target_amount);
  if (!target_amount || isNaN(tAmount) || tAmount <= 0) return res.status(400).json({ error: 'Target amount must be a positive number.' });
  const cAmount = parseFloat(current_amount) || 0;
  if (cAmount < 0) return res.status(400).json({ error: 'Current amount must be zero or positive.' });
  if (!target_date) return res.status(400).json({ error: 'Target date is required.' });
  if (new Date(target_date) <= new Date()) return res.status(400).json({ error: 'Target date must be in the future.' });
  if (notes && notes.length > 500) return res.status(400).json({ error: 'Notes must be 500 characters or less.' });

  try {
    const [result] = await pool.query(
      `INSERT INTO goals (user_id, name, type, target_amount, current_amount, target_date, notes, auto_track)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uid, name.trim(), type, tAmount, cAmount, target_date, notes || null, auto_track ? 1 : 0]
    );
    const [rows] = await pool.query(`SELECT * FROM goals WHERE goal_id = ?`, [result.insertId]);
    const goal = enrichGoal(rows[0]);
    console.log(`[GOALS_CREATE] created goal_id=${result.insertId}`);
    res.status(201).json({ goal });
  } catch (err) {
    console.error('[GOALS_CREATE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to create goal.' });
  }
};

// ── PATCH /api/goals/:id ───────────────────────────────────────────────────────
exports.updateGoal = async (req, res) => {
  const uid = req.user?.user_id;
  const goalId = parseInt(req.params.id, 10);
  console.log(`[GOALS_UPDATE] user_id=${uid} goal_id=${goalId}`);

  // Verify ownership
  const [existing] = await pool.query(`SELECT * FROM goals WHERE goal_id = ? AND user_id = ?`, [goalId, uid]);
  if (existing.length === 0) return res.status(404).json({ error: 'Goal not found.' });

  const { name, type, target_amount, current_amount, target_date, notes, auto_track, status } = req.body;

  const VALID_TYPES = ['savings', 'debt_payoff', 'spending_limit', 'investment_target'];
  const VALID_STATUS = ['active', 'completed', 'archived'];

  if (name !== undefined && (!name.trim() || name.trim().length > 100))
    return res.status(400).json({ error: 'Goal name must be 1–100 characters.' });
  if (type !== undefined && !VALID_TYPES.includes(type))
    return res.status(400).json({ error: 'Invalid goal type.' });
  if (target_amount !== undefined && (isNaN(parseFloat(target_amount)) || parseFloat(target_amount) <= 0))
    return res.status(400).json({ error: 'Target amount must be a positive number.' });
  if (current_amount !== undefined && parseFloat(current_amount) < 0)
    return res.status(400).json({ error: 'Current amount must be zero or positive.' });
  if (status !== undefined && !VALID_STATUS.includes(status))
    return res.status(400).json({ error: 'Invalid status.' });
  if (notes !== undefined && notes && notes.length > 500)
    return res.status(400).json({ error: 'Notes must be 500 characters or less.' });

  try {
    const cur = existing[0];
    await pool.query(
      `UPDATE goals SET
         name           = ?,
         type           = ?,
         target_amount  = ?,
         current_amount = ?,
         target_date    = ?,
         notes          = ?,
         auto_track     = ?,
         status         = ?
       WHERE goal_id = ? AND user_id = ?`,
      [
        name !== undefined ? name.trim() : cur.name,
        type !== undefined ? type : cur.type,
        target_amount !== undefined ? parseFloat(target_amount) : parseFloat(cur.target_amount),
        current_amount !== undefined ? parseFloat(current_amount) : parseFloat(cur.current_amount),
        target_date !== undefined ? target_date : cur.target_date,
        notes !== undefined ? (notes || null) : cur.notes,
        auto_track !== undefined ? (auto_track ? 1 : 0) : cur.auto_track,
        status !== undefined ? status : cur.status,
        goalId, uid,
      ]
    );
    const [rows] = await pool.query(`SELECT * FROM goals WHERE goal_id = ?`, [goalId]);
    const goal = enrichGoal(rows[0]);
    console.log(`[GOALS_UPDATE] updated goal_id=${goalId} status=${goal.status}`);
    res.json({ goal });
  } catch (err) {
    console.error('[GOALS_UPDATE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to update goal.' });
  }
};

// ── DELETE /api/goals/:id ──────────────────────────────────────────────────────
exports.deleteGoal = async (req, res) => {
  const uid = req.user?.user_id;
  const goalId = parseInt(req.params.id, 10);
  console.log(`[GOALS_DELETE] user_id=${uid} goal_id=${goalId}`);

  try {
    const [existing] = await pool.query(`SELECT goal_id FROM goals WHERE goal_id = ? AND user_id = ?`, [goalId, uid]);
    if (existing.length === 0) return res.status(404).json({ error: 'Goal not found.' });

    await pool.query(`DELETE FROM goals WHERE goal_id = ? AND user_id = ?`, [goalId, uid]);
    console.log(`[GOALS_DELETE] deleted goal_id=${goalId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[GOALS_DELETE_ERROR]', err.message);
    res.status(500).json({ error: 'Failed to delete goal.' });
  }
};
