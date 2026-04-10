/**
 * Regression tests for notificationController
 * Run with: node tests/notificationController.test.js
 * No external test framework required — uses Node built-in assert.
 */
'use strict';

const assert = require('assert');

// ── Minimal mock factory ──────────────────────────────────────────────────────
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
  const cKey = require.resolve('../controllers/notificationController');
  const dKey = require.resolve('../config/db');
  delete require.cache[cKey];
  delete require.cache[dKey];
  require.cache[dKey] = { id: dKey, filename: dKey, loaded: true, exports: mockPool };
  const ctrl = require('../controllers/notificationController');
  delete require.cache[cKey];
  delete require.cache[dKey];
  return ctrl;
}

function mockReqRes(userOverride = {}, params = {}, body = {}) {
  const captured = {};
  const req = { user: { user_id: 42, ...userOverride }, params, body };
  const res = {
    _status: 200,
    status(code) { this._status = code; return this; },
    json(data)   { captured.data = data; captured.status = this._status; return this; },
  };
  return { req, res, captured };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
async function test(name, fn) {
  try   { await fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (err) { console.error(`  ✗ ${name}\n    ${err.message}`); failed++; }
}

// ── Suite ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[notificationController] regression tests\n');

  // ── GROUP 1: GET /api/notifications ────────────────────────────────────────
  console.log('Group 1 — GET /api/notifications');

  await test('Returns real notifications when DB has rows', async () => {
    const rows = [
      { notification_id: 1, user_id: 42, type: 'system', title: 'Hi', message: 'Welcome', is_read: false, created_at: new Date().toISOString() },
      { notification_id: 2, user_id: 42, type: 'spending_alert', title: 'Alert', message: 'Spend up', is_read: true, created_at: new Date().toISOString() },
    ];
    const { getNotifications } = loadController(makeMockPool([rows]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    assert.strictEqual(captured.status, 200);
    assert.strictEqual(captured.data.isDemo, false);
    assert.strictEqual(captured.data.notifications.length, 2);
  });

  await test('Returns demo notifications when DB has 0 rows', async () => {
    const { getNotifications } = loadController(makeMockPool([[]])); // empty result
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    assert.strictEqual(captured.data.isDemo, true);
    assert.ok(captured.data.notifications.length > 0, 'demo notifications must be non-empty');
  });

  await test('Demo notifications contain all 4 expected types', async () => {
    const { getNotifications } = loadController(makeMockPool([[]]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    const types = captured.data.notifications.map((n) => n.type);
    assert.ok(types.includes('spending_alert'),    'missing spending_alert');
    assert.ok(types.includes('large_transaction'), 'missing large_transaction');
    assert.ok(types.includes('budget_warning'),    'missing budget_warning');
    assert.ok(types.includes('system'),            'missing system');
  });

  await test('Demo notifications have 2 unread entries', async () => {
    const { getNotifications } = loadController(makeMockPool([[]]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    const unread = captured.data.notifications.filter((n) => !n.is_read).length;
    assert.strictEqual(unread, 2, `Expected 2 unread demo notifications, got ${unread}`);
  });

  await test('Falls back to demo on DB error (never crashes)', async () => {
    const { getNotifications } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res); // must not throw
    assert.strictEqual(captured.data.isDemo, true);
    assert.ok(Array.isArray(captured.data.notifications));
  });

  await test('Notifications are user-scoped (user_id passed to query)', async () => {
    let capturedArgs;
    const pool = {
      query: async (...args) => { capturedArgs = args; return [[]]; },
    };
    const { getNotifications } = loadController(pool);
    const { req, res } = mockReqRes({ user_id: 99 });
    await getNotifications(req, res);
    // The query params array should include user_id=99
    assert.ok(
      JSON.stringify(capturedArgs).includes('99'),
      'Query must include user_id=99 for user-scoped lookup'
    );
  });

  // ── GROUP 2: PATCH /api/notifications/:id/read ──────────────────────────────
  console.log('\nGroup 2 — PATCH /api/notifications/:id/read');

  await test('markOneRead returns updated count when row exists', async () => {
    const { markOneRead } = loadController(makeMockPool([{ affectedRows: 1 }]));
    const { req, res, captured } = mockReqRes({}, { id: '7' });
    await markOneRead(req, res);
    assert.strictEqual(captured.data.updated, 1);
  });

  await test('markOneRead returns 0 updated when notification not found', async () => {
    const { markOneRead } = loadController(makeMockPool([{ affectedRows: 0 }]));
    const { req, res, captured } = mockReqRes({}, { id: '999' });
    await markOneRead(req, res);
    assert.strictEqual(captured.data.updated, 0);
  });

  await test('markOneRead returns 500 on DB error', async () => {
    const { markOneRead } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes({}, { id: '1' });
    await markOneRead(req, res);
    assert.strictEqual(captured.status, 500);
    assert.ok(captured.data.error);
  });

  // ── GROUP 3: PATCH /api/notifications/read-all ─────────────────────────────
  console.log('\nGroup 3 — PATCH /api/notifications/read-all');

  await test('markAllRead returns count of updated rows', async () => {
    const { markAllRead } = loadController(makeMockPool([{ affectedRows: 3 }]));
    const { req, res, captured } = mockReqRes();
    await markAllRead(req, res);
    assert.strictEqual(captured.data.updated, 3);
  });

  await test('markAllRead returns 0 when all already read', async () => {
    const { markAllRead } = loadController(makeMockPool([{ affectedRows: 0 }]));
    const { req, res, captured } = mockReqRes();
    await markAllRead(req, res);
    assert.strictEqual(captured.data.updated, 0);
  });

  await test('markAllRead returns 500 on DB error', async () => {
    const { markAllRead } = loadController(makeMockPool([new Error('DB down')]));
    const { req, res, captured } = mockReqRes();
    await markAllRead(req, res);
    assert.strictEqual(captured.status, 500);
    assert.ok(captured.data.error);
  });

  // ── GROUP 4: Demo data shape ────────────────────────────────────────────────
  console.log('\nGroup 4 — Demo notification data shape');

  await test('Each demo notification has required fields', async () => {
    const { getNotifications } = loadController(makeMockPool([[]]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    const REQUIRED = ['notification_id', 'type', 'title', 'message', 'is_read', 'created_at'];
    for (const n of captured.data.notifications) {
      for (const field of REQUIRED) {
        assert.ok(field in n, `Demo notification missing field: ${field}`);
      }
    }
  });

  await test('Demo notification IDs start with "demo-"', async () => {
    const { getNotifications } = loadController(makeMockPool([[]]));
    const { req, res, captured } = mockReqRes();
    await getNotifications(req, res);
    for (const n of captured.data.notifications) {
      assert.ok(
        String(n.notification_id).startsWith('demo-'),
        `Expected demo ID, got: ${n.notification_id}`
      );
    }
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
