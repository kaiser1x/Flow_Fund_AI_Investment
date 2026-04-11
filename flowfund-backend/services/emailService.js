/**
 * Email service — supports Gmail SMTP (via Nodemailer) and Resend API.
 *
 * Switch providers with the EMAIL_PROVIDER env var:
 *   EMAIL_PROVIDER=gmail   → uses GMAIL_USER + GMAIL_APP_PASSWORD
 *   EMAIL_PROVIDER=resend  → uses RESEND_API_KEY  (default)
 *
 * If the active provider's credentials are missing, falls back to logging
 * the email content to server logs (dev mode only).
 */
require('dotenv').config();
const nodemailer = require('nodemailer');

// ── Internal: Gmail SMTP ──────────────────────────────────────────────────────

async function sendViaGmail(to, from, subject, html) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.log(`[DEV EMAIL] Gmail creds missing. Would send "${subject}" to ${to}`);
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });

  await transporter.sendMail({ from, to, subject, html });
}

// ── Internal: Resend API ──────────────────────────────────────────────────────

async function sendViaResend(to, from, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.log(`[DEV EMAIL] RESEND_API_KEY missing. Would send "${subject}" to ${to}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const provider = (process.env.EMAIL_PROVIDER || 'resend').toLowerCase();
  const from = process.env.FROM_EMAIL || 'FlowFund AI <noreply@flowfund-ai.app>';

  console.log(`[email] provider=${provider} to=${to} subject="${subject}"`);

  if (provider === 'gmail') {
    return sendViaGmail(to, from, subject, html);
  }
  return sendViaResend(to, from, subject, html);
}

// ── Public API ────────────────────────────────────────────────────────────────
// These signatures are unchanged — authController.js needs no edits.

async function sendOtpEmail(toEmail, otp) {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;background:#f0f3f1;padding:32px;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:15px;font-weight:800;color:#0f2d25;letter-spacing:-0.02em">
          FLOWFUND<span style="color:#2ecc8a">AI</span>
        </span>
      </div>
      <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid rgba(15,45,37,0.09)">
        <h2 style="color:#0f2d25;font-size:20px;font-weight:700;margin:0 0 8px">Verify your email</h2>
        <p style="color:#6b7c77;font-size:14px;margin:0 0 24px">Enter this code to complete your registration:</p>
        <div style="background:#f0f3f1;border-radius:10px;padding:20px;text-align:center;letter-spacing:10px;font-size:34px;font-weight:800;color:#1a4d3e;margin-bottom:24px">
          ${otp}
        </div>
        <p style="color:#9aadaa;font-size:12px;margin:0;text-align:center">
          This code expires in <strong>10 minutes</strong>. Do not share it with anyone.
        </p>
      </div>
      <p style="color:#9aadaa;font-size:11px;text-align:center;margin-top:16px">
        If you didn't create a FlowFund account, you can ignore this email.
      </p>
    </div>
  `;
  await sendEmail(toEmail, `${otp} is your FlowFund verification code`, html);
}

async function sendPasswordResetEmail(toEmail, resetUrl) {
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;background:#f0f3f1;padding:32px;border-radius:16px">
      <div style="text-align:center;margin-bottom:24px">
        <span style="font-size:15px;font-weight:800;color:#0f2d25;letter-spacing:-0.02em">
          FLOWFUND<span style="color:#2ecc8a">AI</span>
        </span>
      </div>
      <div style="background:#fff;border-radius:12px;padding:32px;border:1px solid rgba(15,45,37,0.09)">
        <h2 style="color:#0f2d25;font-size:20px;font-weight:700;margin:0 0 8px">Reset your password</h2>
        <p style="color:#6b7c77;font-size:14px;margin:0 0 24px">Click the button below to set a new password. This link expires in <strong>30 minutes</strong>.</p>
        <div style="text-align:center;margin-bottom:24px">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(90deg,#1a4d3e 0%,#2d6a52 100%);color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.06em">
            RESET PASSWORD
          </a>
        </div>
        <p style="color:#9aadaa;font-size:12px;margin:0;text-align:center">
          If the button doesn't work, copy this link into your browser:<br/>
          <span style="word-break:break-all;color:#6b7c77;font-size:11px">${resetUrl}</span>
        </p>
      </div>
      <p style="color:#9aadaa;font-size:11px;text-align:center;margin-top:16px">
        If you didn't request a password reset, ignore this email. Your password won't change.
      </p>
    </div>
  `;
  await sendEmail(toEmail, 'Reset your FlowFund password', html);
}

module.exports = { sendOtpEmail, sendPasswordResetEmail };
