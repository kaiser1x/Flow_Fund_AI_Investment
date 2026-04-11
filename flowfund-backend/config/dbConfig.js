/**
 * Single source of truth for DB connection.
 *
 * SSL is determined by the HOSTNAME, not by which env var held the URL.
 * This fixes the failure mode where DATABASE_URL is set to Railway's public
 * proxy (*.proxy.rlwy.net) but the old variable-name check skipped SSL,
 * causing "Connection lost: The server closed the connection" on handshake.
 *
 * Hostname rules:
 *   localhost / 127.0.0.1 / ::1    → no SSL  (local dev)
 *   *.railway.internal              → no SSL  (Railway private network)
 *   everything else                 → SSL required (Railway public proxy, etc.)
 */
require('dotenv').config();

const connectionUrl =
  process.env.DATABASE_URL ||
  process.env.MYSQL_PRIVATE_URL ||
  process.env.MYSQL_PUBLIC_URL ||
  process.env.MYSQL_URL;

function needsSSL(hostname) {
  if (!hostname) return false;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false;
  if (hostname.endsWith('.railway.internal')) return false;
  return true;
}

function getPoolConfig() {
  const tz = { timezone: '+00:00' };

  if (connectionUrl) {
    const url = new URL(connectionUrl);
    const host = url.hostname;
    return {
      host,
      port: Number(url.port) || 3306,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.replace('/', ''),
      ...(needsSSL(host) ? { ssl: { rejectUnauthorized: false } } : {}),
      ...tz,
    };
  }

  // Fallback: individual env vars (local dev without a URL).
  const host = process.env.DB_HOST;
  return {
    host,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...(needsSSL(host) ? { ssl: { rejectUnauthorized: false } } : {}),
    ...tz,
  };
}

module.exports = { getPoolConfig, connectionUrl };
