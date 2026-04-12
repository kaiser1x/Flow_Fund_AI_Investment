/**
 * Regression tests for Investment Simulations
 * Run with: node tests/simulations.test.js
 * No external test framework — uses Node built-in assert.
 */
'use strict';

const assert = require('assert');

// ── Load engine directly (no DB needed for math tests) ────────────────────────
const { _engine } = require('../controllers/simulationsController');
const { runCompoundInterest, runStockMarket, runDebtPayoff, runEmergencyFund } = _engine;

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
  const cKey = require.resolve('../controllers/simulationsController');
  const dKey = require.resolve('../config/db');
  delete require.cache[cKey];
  delete require.cache[dKey];
  require.cache[dKey] = { id: dKey, filename: dKey, loaded: true, exports: mockPool };
  const ctrl = require('../controllers/simulationsController');
  delete require.cache[cKey];
  delete require.cache[dKey];
  return ctrl;
}

function mockReqRes(overrides = {}) {
  const captured = {};
  const req = { user: { user_id: 42 }, query: {}, params: {}, body: {}, ...overrides };
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function approxEqual(actual, expected, tolerance = 0.5) {
  return Math.abs(actual - expected) <= tolerance;
}

function noRows()        { return []; }
function countRow(n)     { return [{ cnt: n }]; }
function insertResult(id){ return { insertId: id }; }

// ══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log('\n[simulations] regression tests\n');

  // ── GROUP 1: Compound Interest math ─────────────────────────────────────────
  console.log('Group 1 — Compound Interest formula correctness');

  await test('$10k initial, $500/mo, 7% annual, 10 years → final value ~$105k', async () => {
    // FV = 10000*(1+0.07/12)^120 + 500*[((1+0.07/12)^120-1)/(0.07/12)]
    // = 10000*2.0097 + 500*(144.83) ≈ 20097 + 72415 = ~104,888
    const { result_summary, projection_data } = runCompoundInterest({
      initial_amount: 10000, monthly_contribution: 500, annual_rate: 7, years: 10,
    });
    // Actual FV with monthly compounding ≈ 106,639 (not 104,888 which uses annual compounding)
    assert.ok(approxEqual(result_summary.final_value, 106639, 200), `Expected ~106639, got ${result_summary.final_value}`);
    assert.strictEqual(projection_data.length, 10, 'Should have 10 year entries');
  });

  await test('Zero rate → simple addition (no interest)', async () => {
    const { result_summary } = runCompoundInterest({
      initial_amount: 1000, monthly_contribution: 100, annual_rate: 0, years: 5,
    });
    // Expected: 1000 + 100*60 = 7000
    assert.ok(approxEqual(result_summary.final_value, 7000, 1));
  });

  await test('total_interest = final_value - total_contributed', async () => {
    const { result_summary } = runCompoundInterest({
      initial_amount: 5000, monthly_contribution: 200, annual_rate: 6, years: 8,
    });
    const check = result_summary.final_value - result_summary.total_contributed;
    assert.ok(approxEqual(result_summary.total_interest, check, 1));
  });

  await test('Projection array grows each year', async () => {
    const { projection_data } = runCompoundInterest({
      initial_amount: 1000, monthly_contribution: 100, annual_rate: 5, years: 5,
    });
    for (let i = 1; i < projection_data.length; i++) {
      assert.ok(
        projection_data[i].projected_value > projection_data[i - 1].projected_value,
        `Year ${projection_data[i].year} value should exceed year ${projection_data[i-1].year}`
      );
    }
  });

  // ── GROUP 2: Stock Market math ───────────────────────────────────────────────
  console.log('\nGroup 2 — Stock Market formula correctness');

  await test('$5k initial, $200/mo, 8% base, medium volatility, 5 years → 3 distinct lines', async () => {
    const { result_summary, projection_data } = runStockMarket({
      initial_amount: 5000, monthly_contribution: 200, annual_rate: 8, years: 5, volatility: 'medium',
    });
    assert.ok(result_summary.optimistic_value  > result_summary.base_value,        'optimistic > base');
    assert.ok(result_summary.base_value        > result_summary.pessimistic_value,  'base > pessimistic');
    assert.strictEqual(projection_data.length, 5);
  });

  await test('All 5 year entries have base, optimistic, pessimistic', async () => {
    const { projection_data } = runStockMarket({
      initial_amount: 1000, monthly_contribution: 100, annual_rate: 10, years: 5, volatility: 'low',
    });
    for (const row of projection_data) {
      assert.ok('base'        in row, 'missing base');
      assert.ok('optimistic'  in row, 'missing optimistic');
      assert.ok('pessimistic' in row, 'missing pessimistic');
    }
  });

  await test('High volatility has wider spread than low volatility', async () => {
    const inputs = { initial_amount: 10000, monthly_contribution: 500, annual_rate: 8, years: 10 };
    const high = runStockMarket({ ...inputs, volatility: 'high' });
    const low  = runStockMarket({ ...inputs, volatility: 'low'  });
    const spreadHigh = high.result_summary.optimistic_value - high.result_summary.pessimistic_value;
    const spreadLow  = low.result_summary.optimistic_value  - low.result_summary.pessimistic_value;
    assert.ok(spreadHigh > spreadLow, `High volatility spread (${spreadHigh.toFixed(0)}) should exceed low (${spreadLow.toFixed(0)})`);
  });

  // ── GROUP 3: Debt Payoff math ────────────────────────────────────────────────
  console.log('\nGroup 3 — Debt Payoff formula correctness');

  await test('$20k debt, 5% annual, $400/mo → ~56 months to payoff', async () => {
    // Monthly rate = 0.05/12 = 0.004167
    // Months = -log(1 - 20000*0.004167/400) / log(1.004167)
    //        = -log(1 - 0.2083) / log(1.004167) ≈ -log(0.7917)/0.004158 ≈ 55.7 → 56
    const { result_summary } = runDebtPayoff({ principal: 20000, annual_rate: 5, monthly_payment: 400 });
    assert.ok(approxEqual(result_summary.months_to_payoff, 56, 2), `Expected ~56 months, got ${result_summary.months_to_payoff}`);
  });

  await test('Total paid = monthly_payment * months (within rounding)', async () => {
    const { result_summary } = runDebtPayoff({ principal: 10000, annual_rate: 12, monthly_payment: 300 });
    const expected = result_summary.months_to_payoff * 300;
    assert.ok(approxEqual(result_summary.total_paid, expected, 300), `total_paid mismatch: ${result_summary.total_paid} vs ${expected}`);
  });

  await test('Total interest ≈ total_paid - principal (within one payment)', async () => {
    // total_paid uses M*months which slightly overstates the last partial payment
    const { result_summary } = runDebtPayoff({ principal: 8000, annual_rate: 18, monthly_payment: 250 });
    const check = result_summary.total_paid - result_summary.principal;
    assert.ok(approxEqual(result_summary.total_interest, check, 250), `diff=${Math.abs(result_summary.total_interest - check).toFixed(2)}`);
  });

  await test('Zero rate debt → months = ceil(principal/payment)', async () => {
    const { result_summary } = runDebtPayoff({ principal: 1200, annual_rate: 0, monthly_payment: 100 });
    assert.ok(approxEqual(result_summary.months_to_payoff, 12, 1));
  });

  await test('Payment too low throws error', async () => {
    // $10k at 24% annual = $200/mo interest; payment of $100 can't cover it
    assert.throws(
      () => runDebtPayoff({ principal: 10000, annual_rate: 24, monthly_payment: 100 }),
      /too low/i
    );
  });

  // ── GROUP 4: Emergency Fund math ─────────────────────────────────────────────
  console.log('\nGroup 4 — Emergency Fund formula correctness');

  await test('$3k expenses, 6 months target, $1k savings, $500/mo → 9 months to goal', async () => {
    // target = 3000*6 = 18000; remaining = 18000-1000 = 17000; months = ceil(17000/500) = 34
    // Wait, re-read: monthly_expenses=3000 target_months=6 → target=18000. current=1000 → remaining=17000. contrib=500 → 34 months
    // The spec example says: $3k expenses, 6mo target, $1k savings, $500/mo → months to goal
    // Let me verify: ceil(17000/500) = 34. The spec says "9 months" but that was a different example.
    // Using the actual formula:
    const { result_summary } = runEmergencyFund({
      monthly_expenses: 3000, target_months: 6, current_savings: 1000, monthly_contribution: 500,
    });
    // target=18000, remaining=17000, months=ceil(17000/500)=34
    assert.ok(approxEqual(result_summary.months_to_goal, 34, 1), `Expected 34 months, got ${result_summary.months_to_goal}`);
  });

  await test('Already at target → 0 months to goal', async () => {
    const { result_summary } = runEmergencyFund({
      monthly_expenses: 500, target_months: 3, current_savings: 1500, monthly_contribution: 100,
    });
    assert.strictEqual(result_summary.months_to_goal, 0);
  });

  await test('target_amount = monthly_expenses * target_months', async () => {
    const { result_summary } = runEmergencyFund({
      monthly_expenses: 600, target_months: 4, current_savings: 0, monthly_contribution: 200,
    });
    assert.ok(approxEqual(result_summary.target_amount, 2400, 1));
  });

  await test('Projection array reaches target value', async () => {
    const { projection_data, result_summary } = runEmergencyFund({
      monthly_expenses: 500, target_months: 3, current_savings: 0, monthly_contribution: 250,
    });
    const last = projection_data[projection_data.length - 1];
    assert.ok(approxEqual(last.balance, result_summary.target_amount, 1));
  });

  // ── GROUP 5: POST /api/simulations/run endpoint ──────────────────────────────
  console.log('\nGroup 5 — POST /api/simulations/run (API layer)');

  await test('Valid compound_interest → returns projection_data and disclaimer', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: {
        scenario_type: 'compound_interest',
        inputs: { initial_amount: 5000, monthly_contribution: 200, annual_rate: 7, years: 5 },
      },
    });
    runSimulation(req, res);
    assert.ok(captured.data.projection_data, 'missing projection_data');
    assert.ok(captured.data.disclaimer,      'missing disclaimer');
    assert.ok(captured.data.result_summary,  'missing result_summary');
  });

  await test('Valid stock_market → three projection lines', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: {
        scenario_type: 'stock_market',
        inputs: { initial_amount: 10000, monthly_contribution: 300, annual_rate: 9, years: 5, volatility: 'medium' },
      },
    });
    runSimulation(req, res);
    const row = captured.data.projection_data[0];
    assert.ok('base'        in row);
    assert.ok('optimistic'  in row);
    assert.ok('pessimistic' in row);
  });

  await test('Invalid scenario_type → 400', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: { scenario_type: 'lottery', inputs: {} },
    });
    runSimulation(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Missing annual_rate → 400', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: { scenario_type: 'compound_interest', inputs: { initial_amount: 1000, monthly_contribution: 100, years: 5 } },
    });
    runSimulation(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Valid debt_payoff → months_to_payoff in result_summary', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: {
        scenario_type: 'debt_payoff',
        inputs: { principal: 5000, annual_rate: 10, monthly_payment: 200 },
      },
    });
    runSimulation(req, res);
    assert.ok('months_to_payoff' in captured.data.result_summary);
  });

  await test('Valid emergency_fund → months_to_goal in result_summary', async () => {
    const { runSimulation } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: {
        scenario_type: 'emergency_fund',
        inputs: { monthly_expenses: 500, target_months: 6, current_savings: 1000, monthly_contribution: 200 },
      },
    });
    runSimulation(req, res);
    assert.ok('months_to_goal' in captured.data.result_summary);
  });

  // ── GROUP 6: GET /api/simulations (snapshots) ────────────────────────────────
  console.log('\nGroup 6 — GET /api/simulations');

  await test('No snapshots in DB → returns empty, source=empty', async () => {
    const { getSnapshots } = loadController(makeMockPool([noRows()]));
    const { req, res, captured } = mockReqRes();
    await getSnapshots(req, res);
    assert.strictEqual(captured.data.source, 'empty');
    assert.strictEqual(captured.data.snapshots.length, 0);
  });

  await test('DB error → graceful empty fallback', async () => {
    const { getSnapshots } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes();
    await getSnapshots(req, res);
    assert.strictEqual(captured.data.source, 'empty');
    assert.strictEqual(captured.data.snapshots.length, 0);
  });

  // ── GROUP 7: POST /api/simulations/save ──────────────────────────────────────
  console.log('\nGroup 7 — POST /api/simulations/save');

  await test('Missing name → 400', async () => {
    const { saveSnapshot } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: { name: '', scenario_type: 'compound_interest', inputs: {}, result_summary: {} },
    });
    await saveSnapshot(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Invalid scenario_type → 400', async () => {
    const { saveSnapshot } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({
      body: { name: 'Test', scenario_type: 'invalid', inputs: {}, result_summary: {} },
    });
    await saveSnapshot(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Valid save → 201 with snapshot', async () => {
    const snapRow = [{
      sim_id: 10, name: 'My Sim', scenario_type: 'compound_interest',
      inputs: JSON.stringify({ initial_amount: 1000 }),
      result_summary: JSON.stringify({ final_value: 5000 }),
      created_at: new Date().toISOString(),
    }];
    const { saveSnapshot } = loadController(makeMockPool([insertResult(10), snapRow]));
    const { req, res, captured } = mockReqRes({
      body: {
        name: 'My Sim', scenario_type: 'compound_interest',
        inputs: { initial_amount: 1000 }, result_summary: { final_value: 5000 }, projection_data: [],
      },
    });
    await saveSnapshot(req, res);
    assert.strictEqual(captured.status, 201);
    assert.ok(captured.data.snapshot);
  });

  // ── GROUP 8: DELETE /api/simulations/:id ─────────────────────────────────────
  console.log('\nGroup 8 — DELETE /api/simulations/:id scoping');

  await test('Delete non-existent → 404', async () => {
    const { deleteSnapshot } = loadController(makeMockPool([noRows()]));
    const { req, res, captured } = mockReqRes({ params: { id: '999' } });
    await deleteSnapshot(req, res);
    assert.strictEqual(captured.status, 404);
  });

  await test('Delete own snapshot → success', async () => {
    const { deleteSnapshot } = loadController(makeMockPool([[{ sim_id: 1 }], {}]));
    const { req, res, captured } = mockReqRes({ params: { id: '1' } });
    await deleteSnapshot(req, res);
    assert.strictEqual(captured.data.success, true);
  });

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
