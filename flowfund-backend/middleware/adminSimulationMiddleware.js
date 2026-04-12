'use strict';

const DEFAULT_PASSWORD = 'flowfundai123$';

/**
 * Admin simulation tools (Plaid pull only — no direct transaction writes).
 * Send the same password in header X-Admin-Sim-Password.
 * Override with ADMIN_SIM_PASSWORD in .env if needed.
 */
module.exports = function adminSimulationMiddleware(req, res, next) {
  const expected = (process.env.ADMIN_SIM_PASSWORD || DEFAULT_PASSWORD).trim();
  const sent = (req.headers['x-admin-sim-password'] || '').trim();
  if (sent === expected) return next();
  return res.status(403).json({
    error: 'Invalid or missing admin simulation password (header X-Admin-Sim-Password).',
  });
};
