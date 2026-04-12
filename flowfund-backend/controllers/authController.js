const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const {
  ensureCustomerFlowfundSeed,
  isCustomerFlowfundEmail,
} = require('../services/customerFlowfundDemo');

// REGISTER
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

    res.status(201).json({ message: 'User registered successfully', user_id: userId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    const [users] = await pool.query(
      'SELECT u.*, r.role_name FROM users u JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?',
      [email]
    );
    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = users[0];
    if (!user.is_active) return res.status(403).json({ error: 'Account is inactive' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role_name },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const expiresAtUTC = expiresAt.toISOString().slice(0, 19).replace('T', ' ');
    const userAgent = req.headers['user-agent'] || null;
    await pool.query(
      'INSERT INTO user_sessions (session_id, user_id, jwt_token, ip_address, user_agent, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, user.user_id, token, req.ip || null, userAgent, expiresAtUTC]
    );

    try {
      await ensureCustomerFlowfundSeed(user.user_id, user.email);
    } catch (e) {
      console.error('[LOGIN_DEMO_SEED]', e.message);
    }

    res.json({ message: 'Login successful', token, role: user.role_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// LOGOUT
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

// UPDATE PROFILE (protected) — PATCH /api/auth/profile
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

// GET PROFILE (protected)
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.user_id, u.email, r.role_name, p.first_name, p.last_name, p.phone, p.date_of_birth, u.created_at
       FROM users u
       JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN user_profiles p ON u.user_id = p.user_id
       WHERE u.user_id = ?
       LIMIT 1`,
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
