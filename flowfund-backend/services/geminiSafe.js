'use strict';

/**
 * geminiSafe.js — fault-tolerant wrapper for all Gemini AI calls.
 *
 * Guarantees:
 *   - Every call has a hard timeout (TIMEOUT_MS). A hanging promise cannot
 *     stall the process or trigger a SIGTERM from the hosting environment.
 *   - Transient failures (503 / rate-limit / network blip) are retried up to
 *     MAX_RETRIES times with a short delay between attempts.
 *   - This function NEVER throws. Any failure path returns FALLBACK_REPLY so
 *     callers need zero error-handling boilerplate.
 *   - Errors are always logged with console.error for server-side debugging.
 *   - Raw error details are never surfaced to the user.
 */

const getGeminiClient = require('../config/gemini');

const GEMINI_MODEL  = 'gemini-2.5-flash';
const TIMEOUT_MS    = 15_000;   // max ms to wait for a single attempt
const MAX_RETRIES   = 3;       // total attempts before giving up
const RETRY_DELAY   = 1_000;   // ms to wait between retries

const FALLBACK_REPLY =
  "I'm having trouble generating insights right now. Please try again in a moment.";

/**
 * Calls ai.models.generateContent() with full resilience:
 *   timeout → retry → fallback.
 *
 * @param {string} prompt  Complete prompt string to send to Gemini
 * @returns {Promise<string>}  AI reply text, or FALLBACK_REPLY on all failures
 */
async function safeGenerateContent(prompt) {
  // ── Guard: API key missing ───────────────────────────────────────────────
  let ai;
  try {
    ai = getGeminiClient();
  } catch (err) {
    console.error('[GEMINI_KEY_MISSING]', err.message);
    return FALLBACK_REPLY;
  }

  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Race the real call against a hard timeout so the process never hangs.
      const timeoutPromise = new Promise((_resolve, reject) =>
        setTimeout(
          () => reject(new Error(`Gemini timed out after ${TIMEOUT_MS}ms`)),
          TIMEOUT_MS
        )
      );

      const callPromise = ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
      });

      const result = await Promise.race([callPromise, timeoutPromise]);
      const text = result?.text;

      if (!text) {
        // Empty response — treat as retriable failure.
        lastError = new Error('Gemini returned an empty response');
        console.error(`[GEMINI_EMPTY] attempt=${attempt}/${MAX_RETRIES}`);
      } else {
        console.log(`[GEMINI_OK] attempt=${attempt} replyLen=${text.length}`);
        return text;
      }
    } catch (err) {
      lastError = err;
      console.error(
        `[GEMINI_ERROR] attempt=${attempt}/${MAX_RETRIES}`,
        { message: err.message, status: err.status }
      );
    }

    // Pause before the next attempt (skip delay after the last one).
    if (attempt < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, RETRY_DELAY));
    }
  }

  console.error('[GEMINI_ALL_RETRIES_FAILED]', lastError?.message);
  return FALLBACK_REPLY;
}

module.exports = { safeGenerateContent, FALLBACK_REPLY, GEMINI_MODEL };
