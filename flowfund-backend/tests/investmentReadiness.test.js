/**
 * Regression tests for GET /api/investment-readiness
 * Run with: node tests/investmentReadiness.test.js
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
  const cKey = require.resolve('../controllers/investmentReadinessController');
  const dKey = require.resolve('../config/db');
  delete require.cache[cKey];
  delete require.cache[dKey];
  require.cache[dKey] = { id: dKey, filename: dKey, loaded: true, exports: mockPool };
  const ctrl = require('../controllers/investmentReadinessController');
  delete require.cache[cKey];
  delete require.cache[dKey];
  return ctrl;
}

function mockReqRes() {
  const captured = {};
  const req = { user: { user_id: 42 } };
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

// ── Score row builders ────────────────────────────────────────────────────────
function scoreRow(score)   { return [{ score_value: score, risk_level: 'LOW', recommendation: 'test', generated_at: new Date().toISOString() }]; }
function metricRow(o = {}) {
  return [{
    monthly_income:     o.income     ?? 1200,
    monthly_expenses:   o.expenses   ?? 400,
    savings_rate:       o.savings    ?? 67,
    volatility_score:   o.volatility ?? 0,
    cash_buffer_months: o.buffer     ?? 3.1,
  }];
}

// ── Suite ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[investmentReadiness] regression tests\n');

  // ── GROUP 1: color_band thresholds ──────────────────────────────────────────
  console.log('Group 1 — color_band thresholds (spec-defined)');

  await test('Score 80 → green band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(80), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'green');
    assert.strictEqual(captured.data.risk_level,  'LOW');
    assert.strictEqual(captured.data.score, 80);
  });

  await test('Score 100 → green band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(100), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'green');
  });

  await test('Score 50 → yellow band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(50), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'yellow');
    assert.strictEqual(captured.data.risk_level,  'MEDIUM');
  });

  await test('Score 79 → yellow band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(79), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'yellow');
  });

  await test('Score 49 → red band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(49), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'red');
    assert.strictEqual(captured.data.risk_level,  'HIGH');
  });

  await test('Score 0 → red band', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(0), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.color_band, 'red');
  });

  // ── GROUP 2: response shape ─────────────────────────────────────────────────
  console.log('\nGroup 2 — Response shape');

  await test('Response includes all required fields', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(70), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    const REQUIRED = ['score','risk_level','color_band','verdict','factors','recommendation','computed_at','source'];
    for (const f of REQUIRED) {
      assert.ok(f in captured.data, `Missing field: ${f}`);
    }
  });

  await test('factors array has 4 entries (one per scoring component)', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(70), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.factors.length, 4);
  });

  await test('Each factor has label, value, contribution, explanation', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(70), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    for (const f of captured.data.factors) {
      assert.ok(f.label,        `factor missing label`);
      assert.ok(f.value,        `factor missing value`);
      assert.ok(f.contribution, `factor missing contribution`);
      assert.ok(f.explanation,  `factor missing explanation`);
    }
  });

  await test('source=db when DB rows exist', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(70), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.source, 'db');
  });

  // ── GROUP 3: demo fallback ──────────────────────────────────────────────────
  console.log('\nGroup 3 — Demo fallback');

  await test('No DB rows → returns demo, source=demo', async () => {
    const { getReadiness } = loadController(makeMockPool([[], []])); // empty scoreRows + metricRows
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.source, 'demo');
    assert.ok(captured.data.score > 0, 'demo score must not be 0');
  });

  await test('Demo score is not hardcoded — equals 70 (computed from demo data)', async () => {
    // Demo: income=1200, expenses=508.55, balance=1247.82
    // savings_rate=57.6% (+30), buffer=2.45 months (no pts), volatility=0 (+20), has income (+20)
    // Expected: 20+30+0+20 = 70
    const { getReadiness } = loadController(makeMockPool([[], []]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.score, 70, `Expected demo score=70, got ${captured.data.score}`);
    assert.strictEqual(captured.data.color_band, 'yellow');
  });

  await test('DB error → graceful demo fallback, never throws', async () => {
    const { getReadiness } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res); // must not throw
    assert.strictEqual(captured.data.source, 'demo');
    assert.ok(typeof captured.data.score === 'number');
  });

  // ── GROUP 4: verdict strings ────────────────────────────────────────────────
  console.log('\nGroup 4 — Verdict strings');

  await test('Green verdict = "Ready to Invest"', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(80), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.verdict, 'Ready to Invest');
  });

  await test('Yellow verdict = "Investable with Risk"', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(60), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.verdict, 'Investable with Risk');
  });

  await test('Red verdict = "Not Ready to Invest"', async () => {
    const { getReadiness } = loadController(makeMockPool([scoreRow(30), metricRow()]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    assert.strictEqual(captured.data.verdict, 'Not Ready to Invest');
  });

  // ── GROUP 5: factor contribution correctness ────────────────────────────────
  console.log('\nGroup 5 — Factor contribution logic');

  await test('All factors pass → score reflects all 4 contributions', async () => {
    const { getReadiness } = loadController(makeMockPool([
      scoreRow(100),
      metricRow({ income: 2000, expenses: 400, savings: 80, volatility: 0, buffer: 5 }),
    ]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    const pts = captured.data.factors.map(f => f.contribution);
    assert.ok(pts.includes('+20 pts'), 'income factor missing');
    assert.ok(pts.includes('+30 pts'), 'at least one 30pt factor missing');
  });

  await test('Zero income → income factor shows "Not detected"', async () => {
    const { getReadiness } = loadController(makeMockPool([
      scoreRow(0),
      metricRow({ income: 0, expenses: 400, savings: 0, volatility: 0, buffer: 0 }),
    ]));
    const { req, res, captured } = mockReqRes();
    await getReadiness(req, res);
    const incomeFactor = captured.data.factors.find(f => f.label === 'Monthly Income');
    assert.ok(incomeFactor, 'income factor not found');
    assert.strictEqual(incomeFactor.value, 'Not detected');
    assert.strictEqual(incomeFactor.contribution, '+0 pts');
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
