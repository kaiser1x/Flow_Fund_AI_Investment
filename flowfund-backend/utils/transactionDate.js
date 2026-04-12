'use strict';

/**
 * Normalize DB / JSON transaction dates to YYYY-MM-DD for API clients.
 * mysql2 often returns MySQL DATE as Date at UTC midnight; ISO strings also occur.
 */
function toYyyyMmDd(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const lead = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (lead) return lead[1];
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

module.exports = { toYyyyMmDd };
