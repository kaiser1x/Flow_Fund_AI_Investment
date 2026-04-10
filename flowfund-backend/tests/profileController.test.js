/**
 * Regression tests for updateProfile (PATCH /api/auth/profile)
 * Run with: node tests/profileController.test.js
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
  const cKey = require.resolve('../controllers/authController');
  const dKey = require.resolve('../config/db');
  delete require.cache[cKey];
  delete require.cache[dKey];
  require.cache[dKey] = { id: dKey, filename: dKey, loaded: true, exports: mockPool };
  const ctrl = require('../controllers/authController');
  delete require.cache[cKey];
  delete require.cache[dKey];
  return ctrl;
}

function mockReqRes(body = {}, userOverride = {}) {
  const captured = {};
  const req = { user: { user_id: 42, ...userOverride }, body };
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

const VALID_BODY = { first_name: 'Alex', last_name: 'Smith', email: 'alex@example.com', phone: '555-0100', date_of_birth: '1998-06-15' };
const UPDATED_ROW = [{ user_id: 42, email: 'alex@example.com', role_name: 'user', first_name: 'Alex', last_name: 'Smith', phone: '555-0100', date_of_birth: '1998-06-15', created_at: new Date().toISOString() }];

// ── Suite ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n[profileController] regression tests\n');

  // ── GROUP 1: Validation ─────────────────────────────────────────────────────
  console.log('Group 1 — Input validation');

  await test('Empty first_name returns 400', async () => {
    const { updateProfile } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, first_name: '' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 400);
    assert.ok(captured.data.error.toLowerCase().includes('first name'));
  });

  await test('Whitespace-only first_name returns 400', async () => {
    const { updateProfile } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, first_name: '   ' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 400);
  });

  await test('Missing email returns 400', async () => {
    const { updateProfile } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, email: '' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 400);
    assert.ok(captured.data.error.toLowerCase().includes('email'));
  });

  await test('Invalid email format returns 400', async () => {
    const { updateProfile } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, email: 'not-an-email' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 400);
    assert.ok(captured.data.error.toLowerCase().includes('email'));
  });

  await test('Invalid phone format returns 400', async () => {
    const { updateProfile } = loadController(makeMockPool([]));
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, phone: 'BADPHONE!!!' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 400);
    assert.ok(captured.data.error.toLowerCase().includes('phone'));
  });

  await test('Empty phone (optional) is accepted', async () => {
    // Empty phone skips phone validation — must reach DB queries
    // Provide: email uniqueness check, UPDATE users, profile check, UPDATE profiles, SELECT
    const pool = makeMockPool([
      [],                        // email uniqueness: no conflict
      { affectedRows: 1 },       // UPDATE users.email
      [{ profile_id: 1 }],       // profile exists
      { affectedRows: 1 },       // UPDATE user_profiles
      UPDATED_ROW,               // final SELECT
    ]);
    const { updateProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes({ ...VALID_BODY, phone: '' });
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 200);
  });

  // ── GROUP 2: Success paths ──────────────────────────────────────────────────
  console.log('\nGroup 2 — Success paths');

  await test('Valid update with existing profile row returns 200 + updated object', async () => {
    const pool = makeMockPool([
      [],                        // email uniqueness: no conflict
      { affectedRows: 1 },       // UPDATE users.email
      [{ profile_id: 1 }],       // user_profiles row exists
      { affectedRows: 1 },       // UPDATE user_profiles
      UPDATED_ROW,               // final SELECT
    ]);
    const { updateProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes(VALID_BODY);
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 200);
    assert.strictEqual(captured.data.email, 'alex@example.com');
    assert.strictEqual(captured.data.first_name, 'Alex');
  });

  await test('Valid update with no existing profile row (INSERT path) returns 200', async () => {
    const pool = makeMockPool([
      [],                        // email uniqueness: no conflict
      { affectedRows: 1 },       // UPDATE users.email
      [],                        // user_profiles row does NOT exist → INSERT path
      { insertId: 99 },          // INSERT user_profiles
      UPDATED_ROW,               // final SELECT
    ]);
    const { updateProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes(VALID_BODY);
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 200);
  });

  await test('Email already used by another account returns 409', async () => {
    const pool = makeMockPool([
      [{ user_id: 99 }],         // email uniqueness: another user has this email
    ]);
    const { updateProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes(VALID_BODY);
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 409);
    assert.ok(captured.data.error.toLowerCase().includes('email'));
  });

  // ── GROUP 3: Error resilience ───────────────────────────────────────────────
  console.log('\nGroup 3 — Error resilience');

  await test('DB error during update returns 500', async () => {
    const pool = makeMockPool([
      [],                        // email uniqueness passes
      new Error('DB down'),      // UPDATE users fails
    ]);
    const { updateProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes(VALID_BODY);
    await updateProfile(req, res);
    assert.strictEqual(captured.status, 500);
    assert.ok(captured.data.error);
  });

  // ── GROUP 4: getProfile (existing endpoint — regression check) ──────────────
  console.log('\nGroup 4 — getProfile regression');

  await test('getProfile returns user row with all expected fields', async () => {
    const pool = makeMockPool([UPDATED_ROW]);
    const { getProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes({});
    await getProfile(req, res);
    assert.strictEqual(captured.status, 200);
    const EXPECTED_FIELDS = ['user_id', 'email', 'role_name', 'first_name', 'last_name', 'phone', 'date_of_birth', 'created_at'];
    for (const f of EXPECTED_FIELDS) {
      assert.ok(f in captured.data, `Missing field: ${f}`);
    }
  });

  await test('getProfile returns 404 when user not found', async () => {
    const pool = makeMockPool([[]]); // empty rows
    const { getProfile } = loadController(pool);
    const { req, res, captured } = mockReqRes({});
    await getProfile(req, res);
    assert.strictEqual(captured.status, 404);
  });

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
