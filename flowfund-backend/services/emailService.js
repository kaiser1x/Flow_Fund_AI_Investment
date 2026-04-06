/**
 * Email service — sends OTP verification emails via Resend API.
 * If RESEND_API_KEY is not set, prints the OTP to server logs (dev mode).
 * Set FROM_EMAIL in env to customize the sender address.
 */

async function sendOtpEmail(toEmail, otp) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Dev / no-email-service fallback — log OTP so it can be tested
    console.log(`[DEV EMAIL] OTP for ${toEmail}: ${otp}  (set RESEND_API_KEY to send real emails)`);
    return;
  }

  const from = process.env.FROM_EMAIL || 'FlowFund AI <noreply@flowfund-ai.app>';

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

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: toEmail,
      subject: `${otp} is your FlowFund verification code`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email send failed (${res.status}): ${body}`);
  }
}

module.exports = { sendOtpEmail };
