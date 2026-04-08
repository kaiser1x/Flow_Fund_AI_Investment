/**
 * Single source of truth for DB connection.
 * Railway private URL (DATABASE_URL / MYSQL_PRIVATE_URL) is preferred — no SSL needed.
 * Public URL (MYSQL_PUBLIC_URL) requires SSL; ssl: rejectUnauthorized:false is set automatically.
 * Local: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
 */
require('dotenv').config();

// Prefer private/internal URL (Railway sets DATABASE_URL when services are linked).
// Fall back to public URL only if private isn't available.
const privateUrl =
  process.env.DATABASE_URL ||
  process.env.MYSQL_PRIVATE_URL;

const publicUrl =
  process.env.MYSQL_PUBLIC_URL ||
  process.env.MYSQL_URL;

const connectionUrl = privateUrl || publicUrl;

function getPoolConfig() {
  const tz = { timezone: '+00:00' };
  if (connectionUrl) {
    const url = new URL(connectionUrl);
    const isPublic = connectionUrl === publicUrl && !privateUrl;
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: url.username,
      password: decodeURIComponent(url.password),
      database: url.pathname.replace('/', ''),
      // Railway public MySQL endpoint requires SSL; private network does not.
      ...(isPublic ? { ssl: { rejectUnauthorized: false } } : {}),
      ...tz,
    };
  }
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ...tz,
  };
}

module.exports = { getPoolConfig, connectionUrl };
