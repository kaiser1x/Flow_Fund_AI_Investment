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
  const conn = await mysql.createConnection(config);

  // Resolve the active database name for INFORMATION_SCHEMA queries
  const [[{ db }]] = await conn.query('SELECT DATABASE() AS db');

  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    const statements = getStatements(sql);

    for (const statement of statements) {
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

    console.log('Schema applied.');
  } finally {
    await conn.end();
  }
}

runSchema()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Schema failed:', err.message);
    process.exit(1);
  });
