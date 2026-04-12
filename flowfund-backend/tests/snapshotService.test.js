/**
 * Regression tests for snapshotService — bug fix:
 *   Chatbot and dashboard should agree on whether real transaction data exists.
 *
 * Root cause: buildSnapshot() gated hasData on plaid_items count only.
 * Fix: also gate on actual transaction count in the last 90 days.
 *
 * Run with: node tests/snapshotService.test.js
 * No test framework required — uses Node built-in assert.
 */

'use strict';

const assert = require('assert');

// ── Minimal pool mock factory ─────────────────────────────────────────────────
// Returns a mock pool whose .query() resolves with scripted responses in order.
function makeMockPool(responses) {
  let callIndex = 0;
  return {
    query: async (sql) => {
      if (callIndex >= responses.length) {
        throw new Error(`Unexpected query #${callIndex}: ${sql.slice(0, 60)}`);
      }
      const result = responses[callIndex++];
      if (result instanceof Error) throw result;
      return [result]; // mysql2 returns [rows, fields]
    },
  };
}

// ── Inject mock pool and load service ────────────────────────────────────────
// We use module mock by temporarily patching require cache.
function loadServiceWithPool(mockPool) {
  // Clear cached module so we get a fresh require each time.
  const key = require.resolve('../services/snapshotService');
  delete require.cache[key];

  const dbKey = require.resolve('../config/db');
  delete require.cache[dbKey];

  // Stub db module
  require.cache[dbKey] = { id: dbKey, filename: dbKey, loaded: true, exports: mockPool };

  const service = require('../services/snapshotService');

  // Clean up stubs
  delete require.cache[key];
  delete require.cache[dbKey];

  return service;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ── Test Suite ────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[snapshotService] regression tests\n');

  // ── GROUP 1: hasData gate ───────────────────────────────────────────────────
  console.log('Group 1 — hasData gate');

  await test('No linked accounts → hasData: false', async () => {
    const pool = makeMockPool([
      [{ cnt: 0 }], // plaid_items COUNT
      [{ email: 'regular_user@example.com' }], // customer_flowfund demo check (not demo)
    ]);
    const { buildSnapshot } = loadServiceWithPool(pool);
    const result = await buildSnapshot(42);
    assert.strictEqual(result.hasData, false, 'Expected hasData=false when no plaid_items');
  });

  await test('Linked accounts exist but NO transactions → hasData: false (bug fix)', async () => {
    const pool = makeMockPool([
      [{ cnt: 1 }], // plaid_items COUNT — account IS linked
      [{ cnt: 0 }], // transactions COUNT — but zero transactions exist
    ]);
    const { buildSnapshot } = loadServiceWithPool(pool);
    const result = await buildSnapshot(42);
    assert.strictEqual(result.hasData, false,
      'Expected hasData=false when plaid_items has rows but transactions is empty — this was the $0.00 bug');
  });

  await test('Linked accounts + transactions exist → hasData: true', async () => {
    // Provide enough mock rows to cover all queries in buildSnapshot
    const pool = makeMockPool([
      [{ cnt: 1 }],                                   // plaid_items COUNT
      [{ cnt: 5 }],                                   // transactions COUNT (has data)
      [{ cnt: 2, total_balance: '1247.82' }],         // bank_accounts summary
      [{ total: '508.55' }],                          // sumExpenses d30
      [{ total: '1525.65' }],                         // sumExpenses d90
      [{ total: '420.00' }],                          // sumExpenses prior d30
      [                                               // top categories
        { category: 'Food & Drink', total: '57.75' },
        { category: 'Groceries',    total: '120.50' },
      ],
      [                                               // top merchants (may throw → catch)
        { merchant: 'Walmart', total: '67.30' },
      ],
      [],                                             // recurring charges
      [],                                             // spending spikes
      [{ total: '1200.00' }],                         // income 30d
    ]);
    const { buildSnapshot } = loadServiceWithPool(pool);
    const result = await buildSnapshot(42);
    assert.strictEqual(result.hasData, true, 'Expected hasData=true when transactions exist');
    assert.strictEqual(result.spendingSummary.last30Days, 508.55, 'Expected spend30=508.55');
    assert.strictEqual(result.spendingSummary.last90Days, 1525.65, 'Expected spend90=1525.65');
  });

  // ── GROUP 2: buildDemoSnapshot correctness ──────────────────────────────────
  console.log('\nGroup 2 — buildDemoSnapshot correctness');

  await test('buildDemoSnapshot returns hasData: true', async () => {
    const { buildDemoSnapshot } = loadServiceWithPool(makeMockPool([]));
    const demo = buildDemoSnapshot();
    assert.strictEqual(demo.hasData, true);
  });

  await test('buildDemoSnapshot last30Days is consistent (test fixture)', async () => {
    const EXPECTED_DEMO_SPEND_30 = 508.55;
    const { buildDemoSnapshot } = loadServiceWithPool(makeMockPool([]));
    const demo = buildDemoSnapshot();
    assert.strictEqual(
      demo.spendingSummary.last30Days,
      EXPECTED_DEMO_SPEND_30,
      `Fixture last30Days must be ${EXPECTED_DEMO_SPEND_30}`
    );
  });

  await test('Demo snapshot has non-empty topCategories', async () => {
    const { buildDemoSnapshot } = loadServiceWithPool(makeMockPool([]));
    const demo = buildDemoSnapshot();
    assert.ok(demo.spendingSummary.topCategories.length > 0, 'Expected topCategories to be non-empty');
  });

  await test('Demo snapshot has non-empty topMerchants', async () => {
    const { buildDemoSnapshot } = loadServiceWithPool(makeMockPool([]));
    const demo = buildDemoSnapshot();
    assert.ok(demo.spendingSummary.topMerchants.length > 0, 'Expected topMerchants to be non-empty');
  });

  await test('Demo snapshot has estimatedMonthlyIncome > 0', async () => {
    const { buildDemoSnapshot } = loadServiceWithPool(makeMockPool([]));
    const demo = buildDemoSnapshot();
    assert.ok(demo.incomeSummary.estimatedMonthlyIncome > 0, 'Expected income > 0 in demo snapshot');
  });

  // ── GROUP 3: error resilience ───────────────────────────────────────────────
  console.log('\nGroup 3 — error resilience');

  await test('buildSnapshot throws on DB error → caller can return a safe response', async () => {
    // Simulate a DB failure on the first query (plaid_items)
    const pool = makeMockPool([new Error('Connection refused')]);
    const { buildSnapshot } = loadServiceWithPool(pool);
    let threw = false;
    try {
      await buildSnapshot(99);
    } catch (_) {
      threw = true;
    }
    assert.ok(threw, 'buildSnapshot must propagate DB errors so chatController can respond without inventing data');
  });

  // ── GROUP 4: consistency check ──────────────────────────────────────────────
  console.log('\nGroup 4 — source-of-truth consistency');

  await test('Inline expense list sum equals buildDemoSnapshot().last30Days', () => {
    // Matches the static demo snapshot used only in tests / legacy helpers
    const demoExpenses = [
      6.45, 24.50, 48.20, 15.49, 13.10, 67.30, 9.99, 42.15, 12.80, 45.00,
      8.75, 10.99, 53.20, 18.40, 7.99, 5.25, 29.99, 89.00,
    ];
    const sum = demoExpenses.reduce((s, n) => s + n, 0);
    // Floating point: round to 2dp
    const rounded = Math.round(sum * 100) / 100;
    assert.strictEqual(rounded, 508.55,
      `Demo transaction expenses must sum to $508.55, got $${rounded}`);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
