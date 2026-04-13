const express = require('express');
const router = express.Router();

// GET /api/debug/ai-health — NO auth required, NO secrets exposed
router.get('/ai-health', async (_req, res) => {
  const avKey = (process.env.ALPHA_VANTAGE_API_KEY || process.env.ALPHAVANTAGE_API_KEY || '').trim();
  const report = {
    status: 'ok',
    geminiKeyPresent: !!process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-flash',
    alphaVantageKeyPresent: avKey.length > 0,
    alphaVantageKeyName: process.env.ALPHA_VANTAGE_API_KEY ? 'ALPHA_VANTAGE_API_KEY'
      : process.env.ALPHAVANTAGE_API_KEY ? 'ALPHAVANTAGE_API_KEY' : 'NOT SET',
    sdkLoaded: false,
    geminiClientInitialized: false,
    geminiTestCallSuccess: false,
    error: null,
  };

  try {
    require('@google/genai');
    report.sdkLoaded = true;
  } catch (err) {
    report.error = 'SDK load failed: ' + err.message;
    return res.json(report);
  }

  try {
    // Use safeGenerateContent so the health-check is also timeout-protected
    // and cannot stall the process.
    const { safeGenerateContent, FALLBACK_REPLY } = require('../services/geminiSafe');
    report.geminiClientInitialized = true;

    const text = await safeGenerateContent('Reply with exactly: OK');
    const succeeded = !!text && text !== FALLBACK_REPLY;
    report.geminiTestCallSuccess = succeeded;
    if (!succeeded) report.error = 'Gemini call failed or timed out (check server logs)';
  } catch (err) {
    report.error = err.message;
  }

  res.json(report);
});

// GET /api/debug/test-email?to=you@example.com — fires a real test email and returns the outcome
router.get('/test-email', async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ error: 'Pass ?to=your@email.com' });

  const { sendPasswordResetEmail } = require('../services/emailService');
  const result = { to, provider: process.env.EMAIL_PROVIDER || 'resend', success: false, error: null };

  try {
    await sendPasswordResetEmail(to, 'https://example.com/reset-password?token=test-debug-token');
    result.success = true;
  } catch (err) {
    result.error = err.message;
  }

  res.json(result);
});

// GET /api/debug/email-config — shows active email provider config (no secrets)
router.get('/email-config', (_req, res) => {
  res.json({
    EMAIL_PROVIDER:       process.env.EMAIL_PROVIDER       || '(not set — defaults to resend)',
    GMAIL_USER:           process.env.GMAIL_USER           ? process.env.GMAIL_USER : '(not set)',
    GMAIL_APP_PASSWORD:   process.env.GMAIL_APP_PASSWORD   ? '✓ set' : '(not set)',
    RESEND_API_KEY:       process.env.RESEND_API_KEY       ? '✓ set' : '(not set)',
    FROM_EMAIL:           process.env.FROM_EMAIL           || '(not set — defaults to noreply@flowfund-ai.app)',
    FRONTEND_URL:         process.env.FRONTEND_URL         || '(not set — defaults to http://localhost:3000)',
  });
});

module.exports = router;
