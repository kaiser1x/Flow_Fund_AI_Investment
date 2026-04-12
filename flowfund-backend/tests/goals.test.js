/**
 * Regression tests for Goals API
 * Run with: node tests/goals.test.js
 * No external test framework — uses Node built-in assert.
 */
'use strict';

const assert = require('assert');

// ── Mock factory ──────────────────────────────────────────────────────────────
function makeMockPool(responses) {
  let i = 0;
  return {
    query: async () => {
      if (i >= responses.length) throw new Error(`Unexpected query #${i}`);
      const r = responses[i++];
      if (r instanceof Error) throw r;
      return [r];
    },
  };
}

function loadController(mockPool) {
  const cKey = require.resolve('../controllers/goalsController');
  const dKey = require.resolve('../config/db');
  delete require.cache[cKey];
  delete require.cache[dKey];
  require.cache[dKey] = { id: dKey, filename: dKey, loaded: true, exports: mockPool };
  const ctrl = require('../controllers/goalsController');
  delete require.cache[cKey];
  delete require.cache[dKey];
  return ctrl;
}

function mockReqRes(overrides = {}) {
  const captured = {};
  const req = {
    user: { user_id: 42 },
    query: {},
    params: {},
    body: {},
    ...overrides,
  };
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(data)   { captured.data = data; captured.status = this._status; return this; },
  };
  return { req, res, captured };
}

let passed = 0, failed = 0;
async function test(name, fn) {
  try   { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

// ── Demo goal rows ────────────────────────────────────────────────────────────
function noRows()     { return []; }
function goalRow(o = {}) {
  const future = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  return [{
    goal_id:        o.id          ?? 1,
    user_id:        42,
    name:           o.name        ?? 'Test Goal',
    type:           o.type        ?? 'savings',
    target_amount:  o.target      ?? 1000,
    current_amount: o.current     ?? 500,
    target_date:    o.date        ?? future,
    notes:          o.notes       ?? null,
    status:         o.status      ?? 'active',
    auto_track:     o.auto_track  ?? 0,
    created_at:     new Date(Date.now() - 10 * 86400000).toISOString(),
  }];
}

function countRow(n) { return [{ cnt: n }]; }
function insertResult(id) { return { insertId: id }; }

// ── Suite ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[goals] regression tests\n');

  // ── GROUP 1: GET /api/goals — empty when no rows ─────────────────────────────
  console.log('Group 1 — Empty list (no DB rows)');

  await test('No goals in DB → returns empty array, source=empty', async () => {
    const { getGoals } = loadController(makeMockPool([noRows()]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.source, 'empty');
    assert.ok(Array.isArray(captured.data.goals), 'goals must be array');
    assert.strictEqual(captured.data.goals.length, 0);
  });

  await test('DB error → graceful empty response, never throws', async () => {
    const { getGoals } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.source, 'empty');
    assert.strictEqual(captured.data.goals.length, 0);
  });

  // ── GROUP 2: Progress computation ───────────────────────────────────────────
  console.log('\nGroup 2 — Progress computation');

  await test('progress_pct = current/target * 100 (rounded)', async () => {
    const row = goalRow({ target: 1000, current: 250 });
    // auto_track=0 so no extra balance query needed
    const { getGoals } = loadController(makeMockPool([row]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.goals[0].progress_pct, 25);
  });

  await test('progress_pct capped at 100 when current > target', async () => {
    const row = goalRow({ target: 100, current: 150 });
    const { getGoals } = loadController(makeMockPool([row]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.goals[0].progress_pct, 100);
  });

  await test('status_label = "Completed" when current >= target', async () => {
    const row = goalRow({ target: 1000, current: 1000, status: 'active' });
    const { getGoals } = loadController(makeMockPool([row]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.goals[0].status_label, 'Completed');
  });

  await test('status_label = "Behind" when target_date passed', async () => {
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const row = goalRow({ target: 1000, current: 100, date: past, status: 'active' });
    const { getGoals } = loadController(makeMockPool([row]));
    const { req, res, captured } = mockReqRes({ query: { filter: 'all' } });
    await getGoals(req, res);
    assert.strictEqual(captured.data.goals[0].status_label, 'Behind');
  });

  // ── GROUP 3: GET /api/goals/summary ─────────────────────────────────────────
  console.log('\nGroup 3 — GET /api/goals/summary');

  await test('Summary returns top3 goals when DB has rows', async () => {
    const rows = [
      goalRow({ id: 1, name: 'G1' })[0],
      goalRow({ id: 2, name: 'G2' })[0],
      goalRow({ id: 3, name: 'G3' })[0],
      goalRow({ id: 4, name: 'G4' })[0],
    ];
    const { getGoalsSummary } = loadController(makeMockPool([rows, countRow(0)]));
    const { req, res, captured } = mockReqRes();
    await getGoalsSummary(req, res);
    assert.strictEqual(captured.data.goals.length, 3);
    assert.strictEqual(captured.data.source, 'db');
  });

  await test('Summary has on_track, at_risk, completed counts', async () => {
    const { getGoalsSummary } = loadController(makeMockPool([noRows()]));
    const { req, res, captured } = mockReqRes();
    await getGoalsSummary(req, res);
    assert.ok('on_track'  in captured.data, 'missing on_track');
    assert.ok('at_risk'   in captured.data, 'missing at_risk');
    assert.ok('completed' in captured.data, 'missing completed');
    assert.ok('total'     in captured.data, 'missing total');
  });

  // ── GROUP 4: POST /api/goals (create) ───────────────────────────────────────
  console.log('\nGroup 4 — POST /api/goals (create validation)');

  await test('Missing name → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    const { req, res, captured } = mockReqRes({
      body: { name: '', type: 'savings', target_amount: 1000, target_date: future }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
    assert.ok(captured.data.error, 'should have error message');
  });

  await test('Zero target_amount → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', type: 'savings', target_amount: 0, target_date: future }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Negative target_amount → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', type: 'savings', target_amount: -500, target_date: future }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Missing target_date → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', type: 'savings', target_amount: 1000 }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Past target_date → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const past = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', type: 'savings', target_amount: 1000, target_date: past }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Invalid type → 400 error', async () => {
    const { createGoal } = loadController(makeMockPool([]));
    const future = new Date(Date.now() + 86400000 * 30).toISOString().slice(0, 10);
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', type: 'lottery', target_amount: 1000, target_date: future }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Valid goal → 201 with goal object', async () => {
    const future = new Date(Date.now() + 86400000 * 60).toISOString().slice(0, 10);
    const newRow = goalRow({ id: 99, name: 'My Savings', target: 2000, current: 0, date: future });
    const { createGoal } = loadController(makeMockPool([insertResult(99), newRow]));
    const { req, res, captured } = mockReqRes({
      body: { name: 'My Savings', type: 'savings', target_amount: 2000, target_date: future }
    });
    await createGoal(req, res);
    assert.strictEqual(captured.status, 201);
    assert.ok(captured.data.goal, 'response must have goal');
    assert.strictEqual(captured.data.goal.name, 'My Savings');
  });

  // ── GROUP 5: DELETE scoping ──────────────────────────────────────────────────
  console.log('\nGroup 5 — DELETE /api/goals/:id scoping');

  await test('Delete non-existent goal → 404', async () => {
    const { deleteGoal } = loadController(makeMockPool([noRows()]));
    const { req, res, captured } = mockReqRes({ params: { id: '999' } });
    await deleteGoal(req, res);
    assert.strictEqual(captured.status, 404);
  });

  await test('Delete own goal → success', async () => {
    const row = [{ goal_id: 1 }];
    const { deleteGoal } = loadController(makeMockPool([row, {}]));
    const { req, res, captured } = mockReqRes({ params: { id: '1' } });
    await deleteGoal(req, res);
    assert.strictEqual(captured.data.success, true);
  });

  // ── GROUP 6: GET /api/goals/insights ────────────────────────────────────────
  console.log('\nGroup 6 — GET /api/goals/insights');

  await test('Insights returns spending_trend, balance_trend, summary', async () => {
    const { getGoalsInsights } = loadController(makeMockPool([
      [{ spend_recent: 400, spend_prior: 500 }],  // spending query
      [{ total: 1200 }],                           // balance query
      [{ total: 600 }],                            // income query
    ]));
    const { req, res, captured } = mockReqRes();
    await getGoalsInsights(req, res);
    assert.ok('spending_trend' in captured.data, 'missing spending_trend');
    assert.ok('balance_trend'  in captured.data, 'missing balance_trend');
    assert.ok('summary'        in captured.data, 'missing summary');
    assert.ok(typeof captured.data.summary === 'string' && captured.data.summary.length > 0, 'summary must be non-empty string');
  });

  await test('Insights DB error → graceful fallback with source=none', async () => {
    const { getGoalsInsights } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes();
    await getGoalsInsights(req, res);
    assert.strictEqual(captured.data.source, 'none');
    assert.ok(captured.data.summary, 'fallback must include summary');
  });

  await test('Spending down → spending_trend = "down"', async () => {
    // recent=300 < prior=500 → down
    const { getGoalsInsights } = loadController(makeMockPool([
      [{ spend_recent: 300, spend_prior: 500 }],
      [{ total: 2000 }],
      [{ total: 1000 }],
    ]));
    const { req, res, captured } = mockReqRes();
    await getGoalsInsights(req, res);
    assert.strictEqual(captured.data.spending_trend, 'down');
  });

  await test('Spending up → spending_trend = "up"', async () => {
    // recent=600 > prior=400 → up
    const { getGoalsInsights } = loadController(makeMockPool([
      [{ spend_recent: 600, spend_prior: 400 }],
      [{ total: 2000 }],
      [{ total: 1000 }],
    ]));
    const { req, res, captured } = mockReqRes();
    await getGoalsInsights(req, res);
    assert.strictEqual(captured.data.spending_trend, 'up');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
