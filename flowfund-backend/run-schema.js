/**
 * Run schema.sql against the database. Idempotent (safe to run on every deploy).
 * Executes statements one-by-one to avoid multi-statement parsing issues (e.g. Railway MySQL).
 *
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS is only supported on MySQL 8.0.3+.
 * To stay compatible with older MySQL versions, column additions are handled
 * here via INFORMATION_SCHEMA checks instead of inline SQL syntax.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getPoolConfig } = require('./config/dbConfig');

function getStatements(sql) {
  return sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--[^\n]*\n/gm, '').trim())
    .filter((s) => s.length > 0);
}

/**
 * Adds a column to a table only if it does not already exist.
 * Uses INFORMATION_SCHEMA for MySQL 5.7+ compatibility.
 */
async function conditionalAddColumn(conn, dbName, table, column, definition) {
  const [rows] = await conn.query(
    `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [dbName, table, column]
  );
  if (rows.length === 0) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`  + Added column ${table}.${column}`);
  }
}

async function runSchema() {
  const config = getPoolConfig();

  // Log connection target so Railway logs confirm which host/SSL config is active.
  // Password is intentionally omitted.
  const target = config.host
    ? `${config.user}@${config.host}:${config.port}/${config.database} ssl=${!!config.ssl}`
    : '(no host resolved — check DB env vars)';
  console.log(`[schema] connecting: ${target}`);

  const conn = await mysql.createConnection(config);
  console.log('[schema] connection established');

  // Resolve the active database name for INFORMATION_SCHEMA queries
  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');
  console.log(`[schema] active database: ${db}`);

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = getStatements(sql);
    console.log(`[schema] executing ${statements.length} statements`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        await conn.query(statement);
      } catch (err) {
        // Keep schema reruns safe on MySQL versions without ADD COLUMN IF NOT EXISTS.
        if (
          err?.code === 'ER_DUP_FIELDNAME' ||
          err?.code === 'ER_DUP_KEYNAME' ||
          err?.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
          err?.code === 'ER_BAD_FIELD_ERROR'
        ) {
          continue;
        }
        console.error(`[schema] statement ${i + 1}/${statements.length} failed (${err.code}): ${statement.slice(0, 120).replace(/\s+/g, ' ')}`);
        throw err;
      }
    }

    // ── Column migrations (MySQL-version-safe) ──────────────────────────────
    // These use INFORMATION_SCHEMA instead of ADD COLUMN IF NOT EXISTS,
    // which is only available in MySQL 8.0.3+.

    // bank_accounts: Plaid aggregator support
    await conditionalAddColumn(conn, db, 'bank_accounts', 'plaid_account_id', 'VARCHAR(100) UNIQUE');
    await conditionalAddColumn(conn, db, 'bank_accounts', 'plaid_item_id',    'VARCHAR(255)');
    await conditionalAddColumn(conn, db, 'bank_accounts', 'mask',             'VARCHAR(10)');

    // transactions: deduplication key for imported aggregator records
    await conditionalAddColumn(conn, db, 'transactions', 'plaid_transaction_id', 'VARCHAR(100) UNIQUE');

    // transactions: enriched fields from Bank Aggregator API
    await conditionalAddColumn(conn, db, 'transactions', 'merchant_name', 'VARCHAR(150)');
    await conditionalAddColumn(conn, db, 'transactions', 'pending',       'BOOLEAN DEFAULT FALSE');
    await conditionalAddColumn(conn, db, 'transactions', 'source',        "VARCHAR(20) DEFAULT 'plaid'");

    // users: email verification for MFA access control
    await conditionalAddColumn(conn, db, 'users', 'email_verified', 'TINYINT(1) NOT NULL DEFAULT 0');

    console.log('[schema] Schema applied successfully.');
  } finally {
    await conn.end();
  }
}

const RETRY_ATTEMPTS = 5;
const RETRY_BASE_MS  = 3000; // 3s, 6s, 12s, 24s, 48s

const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'PROTOCOL_CONNECTION_LOST',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
]);

function isTransientConnectionError(err) {
  return (
    CONNECTION_ERROR_CODES.has(err.code) ||
    (err.message || '').includes('Connection lost') ||
    (err.message || '').includes('ECONNREFUSED')
  );
}

async function runSchemaWithRetry() {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      await runSchema();
      return;
    } catch (err) {
      const isTransient = isTransientConnectionError(err);
      if (!isTransient || attempt === RETRY_ATTEMPTS) {
        console.error(`Schema failed: ${err.message}`);
        process.exit(1);
      }
      const delayMs = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      console.warn(`[schema] attempt ${attempt}/${RETRY_ATTEMPTS} failed (${err.code || err.message}). Retrying in ${delayMs / 1000}s...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

runSchemaWithRetry();
