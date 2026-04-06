const express = require('express');
const router = express.Router();
const { register, login, logout, getProfile, verifyOtp, resendOtp } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register',   register);
router.post('/login',      login);
router.post('/logout',     authMiddleware, logout);
router.get('/profile',     authMiddleware, getProfile);
router.post('/verify-otp', verifyOtp);
router.post('/resend-otp', resendOtp);

module.exports = router;
