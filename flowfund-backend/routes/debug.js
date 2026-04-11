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
    const getGeminiClient = require('../config/gemini');
    const ai = getGeminiClient();
    report.geminiClientInitialized = true;

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: 'Reply with exactly: OK',
    });
    const text = result.text?.trim();
    report.geminiTestCallSuccess = !!text;
    if (!text) report.error = 'Gemini returned empty response';
  } catch (err) {
    report.error = err.message;
  }

  res.json(report);
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
