const getGeminiClient = require('../config/gemini');
const { buildSnapshot } = require('../services/snapshotService');

const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_INSTRUCTIONS = `
You are FlowFund AI's financial education assistant. You help users understand their spending patterns and improve their financial health.

IMPORTANT RULES:
- You are NOT a licensed financial advisor
- Never recommend specific stocks, funds, or securities
- Never promise returns or guarantee outcomes
- Never execute or suggest executing trades
- Base ALL statements on the financial data provided — do not invent numbers
- Keep responses concise, educational, and encouraging
- Suggest 3–5 practical, specific next steps when relevant
- Use plain language suitable for young adults and college students
- Always frame advice as educational suggestions, not financial instructions

Your tone should be: clear, supportive, practical, and honest about limitations.
`.trim();

function buildContextPrompt(snapshot, isDemo) {
  const demoNote = isDemo
    ? `\n\nNOTE: This is DEMO/EXAMPLE data for illustration purposes. Acknowledge briefly that this is sample data, but still give real, useful insights based on these spending patterns.`
    : '';

  const s = snapshot.spendingSummary;
  const inc = snapshot.incomeSummary;

  return `
Here is the user's financial data (computed by the FlowFund AI backend — do not invent or modify these numbers):

ACCOUNTS: ${snapshot.accountsSummary.accountCount} linked account(s), total balance $${snapshot.accountsSummary.totalCurrentBalance.toFixed(2)}

SPENDING:
- Last 30 days: $${s.last30Days.toFixed(2)}
- Last 90 days: $${s.last90Days.toFixed(2)}
- Average monthly spend: $${s.averageMonthlySpend.toFixed(2)}

TOP SPENDING CATEGORIES (90d):
${s.topCategories.map(c => `  - ${c.category}: $${c.amount.toFixed(2)}`).join('\n')}

TOP MERCHANTS (90d):
${s.topMerchants.map(m => `  - ${m.merchant}: $${m.amount.toFixed(2)}`).join('\n')}

RECURRING CHARGES:
${s.recurringCharges.length > 0
    ? s.recurringCharges.map(r => `  - ${r.merchant}: ~$${r.amount}/month`).join('\n')
    : '  None detected'}

SPENDING SPIKES (vs prior 30d):
${s.spendingSpikes.length > 0
    ? s.spendingSpikes.map(sp => `  - ${sp.category}: +${sp.changePct}%`).join('\n')
    : '  No significant spikes detected'}

INCOME & SAVINGS:
- Estimated monthly income: ${inc.estimatedMonthlyIncome > 0 ? `$${inc.estimatedMonthlyIncome.toFixed(2)}` : 'Not detected'}
- Estimated savings rate: ${inc.estimatedSavingsRate !== null ? `${(inc.estimatedSavingsRate * 100).toFixed(0)}%` : 'N/A'}
- Cash buffer: ${inc.cashBufferMonths !== null ? `${inc.cashBufferMonths} months` : 'N/A'}

RISK FLAGS:
${snapshot.riskFlags.length > 0
    ? snapshot.riskFlags.map(f => `  - ${f}`).join('\n')
    : '  No major risk flags'}

RECOMMENDED FOCUS AREAS:
${snapshot.recommendedFocusAreas.map(a => `  - ${a}`).join('\n')}

Use only this data when answering. Do not add numbers or facts not listed above.${demoNote}
`.trim();
}

// POST /api/chat/message
exports.sendMessage = async (req, res) => {
  const uid = req.user?.user_id;
  console.log(`[CHAT_ROUTE_RECEIVED] user_id=${uid}`);

  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    console.log('[CHAT_MESSAGE_MISSING]');
    return res.status(400).json({ error: 'message is required' });
  }

  const NO_DATA_REPLY =
    'I do not have your transaction data yet. On the dashboard, connect a bank account and run a sync. Once your transactions load, you can ask me about spending, savings, and patterns — I only use numbers from your linked data.';

  let snapshot;
  let isDemo = false;
  try {
    snapshot = await buildSnapshot(uid);
    console.log(`[SNAPSHOT_OK] hasData=${snapshot.hasData}`);
  } catch (err) {
    console.error('[SNAPSHOT_FETCH_FAILED]', err.message);
    return res.json({
      reply:
        'I could not load your financial data right now. Please try again in a moment, or reconnect your bank from the dashboard.',
      hasFinancialData: false,
      isDemo: false,
    });
  }

  if (!snapshot.hasData) {
    return res.json({
      reply: NO_DATA_REPLY,
      hasFinancialData: false,
      isDemo: false,
      reason: snapshot.reason,
    });
  }

  // ── Gemini ────────────────────────────────────────────────────────────────
  let ai;
  try {
    ai = getGeminiClient();
    console.log('[GEMINI_CLIENT_OK]');
  } catch (err) {
    console.error('[GEMINI_KEY_MISSING]', err.message);
    return res.status(500).json({ error: 'Failed to generate response' });
  }

  const fullPrompt = `${SYSTEM_INSTRUCTIONS}\n\n${buildContextPrompt(snapshot, isDemo)}\n\nUser question: ${message.trim()}`;
  console.log(`[GEMINI_REQUEST_START] model=${GEMINI_MODEL} promptLen=${fullPrompt.length} isDemo=${isDemo}`);

  let result;
  try {
    result = await ai.models.generateContent({ model: GEMINI_MODEL, contents: fullPrompt });
    console.log('[GEMINI_RESPONSE_RECEIVED]');
  } catch (err) {
    console.error('[GEMINI_CALL_FAILED]', { message: err.message, status: err.status, errorDetails: err.errorDetails });
    return res.status(500).json({ error: 'Failed to generate response' });
  }

  const responseText = result.text;
  if (!responseText) {
    console.error('[GEMINI_RESPONSE_EMPTY]', JSON.stringify(result).slice(0, 300));
    return res.status(500).json({ error: 'Failed to generate response' });
  }

  console.log(`[CHAT_REPLY_SENT] replyLen=${responseText.length} isDemo=${isDemo}`);
  res.json({ reply: responseText, hasFinancialData: true, isDemo });
};
