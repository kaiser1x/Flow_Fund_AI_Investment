const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendOtpEmail, sendPasswordResetEmail } = require('../services/emailService');
const {
  ensureCustomerFlowfundSeed,
  isCustomerFlowfundEmail,
} = require('../services/customerFlowfundDemo');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── REGISTER ─────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  const { email, password, first_name, last_name } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [existing] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      'INSERT INTO users (email, password_hash, role_id) VALUES (?, ?, 2)',
      [email, password_hash]
    );
    const userId = result.insertId;

    await pool.query(
      'INSERT INTO user_profiles (user_id, first_name, last_name) VALUES (?, ?, ?)',
      [userId, first_name || null, last_name || null]
    );

    // Generate and send OTP
    const otp = generateOtp();
    console.log('this is the otp', otp);
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      'INSERT INTO email_otps (user_id, otp_hash, expires_at) VALUES (?, ?, ?)',
      [userId, otpHash, expiresAtStr]
    );

    await sendOtpEmail(email, otp);

    res.status(201).json({
      message: 'Account created. Check your email for a verification code.',
      requiresVerification: true,
      email,
    });
  } catch (err) {
    console.error('register error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── VERIFY OTP ────────────────────────────────────────────────────────────────
exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and code required' });

  try {
    const [users] = await pool.query('SELECT user_id, email_verified FROM users WHERE email = ?', [email]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const { user_id, email_verified } = users[0];
    if (email_verified) return res.json({ message: 'Email already verified' });

    const [otpRows] = await pool.query(
      `SELECT id, otp_hash FROM email_otps
       WHERE user_id = ? AND used = 0 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user_id]
    );
    if (otpRows.length === 0) {
      return res.status(400).json({ error: 'Code expired or not found. Request a new one.' });
    }

    const valid = await bcrypt.compare(String(otp).trim(), otpRows[0].otp_hash);
    if (!valid) return res.status(400).json({ error: 'Invalid verification code' });

    await pool.query('UPDATE email_otps SET used = 1 WHERE id = ?', [otpRows[0].id]);
    await pool.query('UPDATE users SET email_verified = 1 WHERE user_id = ?', [user_id]);

    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    console.error('verifyOtp error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── RESEND OTP ────────────────────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const [users] = await pool.query(
      'SELECT user_id, email_verified FROM users WHERE email = ?', [email]
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const { user_id, email_verified } = users[0];
    if (email_verified) return res.status(400).json({ error: 'Email already verified' });

    // Rate limit: one code per 60 seconds
    const [recent] = await pool.query(
      `SELECT 1 FROM email_otps
       WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND) LIMIT 1`,
      [user_id]
    );
    if (recent.length > 0) {
      return res.status(429).json({ error: 'Please wait 60 seconds before requesting a new code' });
    }

    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      'INSERT INTO email_otps (user_id, otp_hash, expires_at) VALUES (?, ?, ?)',
      [user_id, otpHash, expiresAtStr]
    );
    await sendOtpEmail(email, otp);

    res.json({ message: 'New verification code sent' });
  } catch (err) {
    console.error('resendOtp error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [users] = await pool.query(
      `SELECT u.*, r.role_name FROM users u
       JOIN roles r ON u.role_id = r.role_id
       WHERE u.email = ?`,
      [email]
    );
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = users[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is inactive' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Block login until email is verified
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before logging in.',
        requiresVerification: true,
        email,
      });
    }

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
    const userAgent = req.headers['user-agent'] || null;

    await pool.query(
      'INSERT INTO user_sessions (session_id, user_id, jwt_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, user.user_id, token, req.ip || null, userAgent, expiresAtStr]
    );

    try {
      await ensureCustomerFlowfundSeed(user.user_id, user.email);
    } catch (e) {
      console.error('[LOGIN_DEMO_SEED]', e.message);
    }

    res.json({ message: 'Login successful', token, role: user.role_name });
  } catch (err) {
    console.error('login error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── LOGOUT ────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(400).json({ error: 'No token provided' });

  try {
    await pool.query('DELETE FROM user_sessions WHERE jwt_token = ?', [token]);
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── FORGOT PASSWORD ───────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  // Always return the same neutral message — never reveal whether email exists.
  const NEUTRAL = { message: "If an account exists for that email, a reset link has been sent." };

  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    const [users] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? AND is_active = 1 LIMIT 1',
      [email]
    );
    if (users.length === 0) return res.json(NEUTRAL);

    const { user_id } = users[0];

    // Rate limit: one reset request per 60 seconds per user
    const [recent] = await pool.query(
      `SELECT 1 FROM password_reset_tokens
       WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 60 SECOND) LIMIT 1`,
      [user_id]
    );
    if (recent.length > 0) return res.json(NEUTRAL);

    // Invalidate any existing unused tokens for this user
    await pool.query(
      `UPDATE password_reset_tokens SET used_at = NOW()
       WHERE user_id = ? AND used_at IS NULL`,
      [user_id]
    );

    // 32 bytes of randomness → 64-char hex token sent in the link
    const rawToken = crypto.randomBytes(32).toString('hex');
    // SHA-256 hash stored in DB — lookup-by-hash, no bcrypt needed here
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user_id, tokenHash, expiresAtStr]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    // Only log the raw link in non-production (dev fallback when RESEND_API_KEY is unset)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[auth] password reset URL for user_id=${user_id}: ${resetUrl}`);
    } else {
      console.log(`[auth] password reset email dispatched for user_id=${user_id}`);
    }

    await sendPasswordResetEmail(email, resetUrl);

    return res.json(NEUTRAL);
  } catch (err) {
    console.error('forgotPassword error:', err.message);
    // Still return neutral — never leak server errors to the client here
    return res.json(NEUTRAL);
  }
};

// ── RESET PASSWORD ────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and new password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const [rows] = await pool.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    const { id: tokenId, user_id } = rows[0];
    const password_hash = await bcrypt.hash(password, 10);

    await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [password_hash, user_id]);
    await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [tokenId]);
    // Invalidate all active sessions — force re-login with new password
    await pool.query('DELETE FROM user_sessions WHERE user_id = ?', [user_id]);

    console.log(`[auth] password reset successful for user_id=${user_id}`);

    res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err) {
    console.error('resetPassword error:', err.message);
    res.status(500).json({ error: 'Reset failed. Please try again.' });
  }
};

// ── UPDATE PROFILE (protected) — PATCH /api/auth/profile ────────────────────
exports.updateProfile = async (req, res) => {
  const uid = req.user?.user_id;
  const { first_name, last_name, email, phone, date_of_birth } = req.body;
  console.log(`[PROFILE_UPDATE] user_id=${uid} fields=${JSON.stringify({ first_name, last_name, email, phone, date_of_birth })}`);

  // ── Validation ────────────────────────────────────────────────────────────
  const trimmedName = (first_name || '').trim();
  if (!trimmedName) {
    console.log('[PROFILE_UPDATE] validation_fail: first_name empty');
    return res.status(400).json({ error: 'First name is required' });
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    console.log('[PROFILE_UPDATE] validation_fail: invalid email');
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (phone && phone.trim() && !/^[\d\s\+\-\(\)\.]{7,20}$/.test(phone.trim())) {
    console.log('[PROFILE_UPDATE] validation_fail: invalid phone');
    return res.status(400).json({ error: 'Phone number format is invalid' });
  }

  try {
    // Check email uniqueness if it changed
    const [existing] = await pool.query(
      'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
      [email.trim(), uid]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email is already in use by another account' });
    }

    // Update users.email
    await pool.query('UPDATE users SET email = ? WHERE user_id = ?', [email.trim(), uid]);

    // Update or insert user_profiles row
    const [profileRows] = await pool.query(
      'SELECT profile_id FROM user_profiles WHERE user_id = ?', [uid]
    );
    if (profileRows.length > 0) {
      await pool.query(
        `UPDATE user_profiles
         SET first_name = ?, last_name = ?, phone = ?, date_of_birth = ?
         WHERE user_id = ?`,
        [trimmedName, (last_name || '').trim() || null, (phone || '').trim() || null, date_of_birth || null, uid]
      );
    } else {
      await pool.query(
        `INSERT INTO user_profiles (user_id, first_name, last_name, phone, date_of_birth)
         VALUES (?, ?, ?, ?, ?)`,
        [uid, trimmedName, (last_name || '').trim() || null, (phone || '').trim() || null, date_of_birth || null]
      );
    }

    // Return the updated profile (reuse same shape as getProfile)
    const [rows] = await pool.query(
      `SELECT u.user_id, u.email, r.role_name, p.first_name, p.last_name, p.phone, p.date_of_birth, u.created_at
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       WHERE u.user_id = ? LIMIT 1`,
      [uid]
    );
    console.log(`[PROFILE_UPDATE] success user_id=${uid}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('[PROFILE_UPDATE_ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
};

// ── GET PROFILE (protected) ──────────────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.email, r.role_name, p.first_name, p.last_name,
              p.phone, p.date_of_birth, u.created_at
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       WHERE u.user_id = ? LIMIT 1`,
      [req.user.user_id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const profile = rows[0];
    try {
      await ensureCustomerFlowfundSeed(req.user.user_id, profile.email);
    } catch (e) {
      console.error('[PROFILE_DEMO_SEED]', e.message);
    }
    profile.is_customer_flowfund_demo = isCustomerFlowfundEmail(profile.email);
    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
