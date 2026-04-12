const express = require('express');
const router = express.Router();
const { register, login, logout, getProfile, updateProfile, verifyOtp, resendOtp, forgotPassword, resetPassword } = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/register',        register);
router.post('/login',           login);
router.post('/logout',          authMiddleware, logout);
router.get('/profile',          authMiddleware, getProfile);
router.patch('/profile',        authMiddleware, updateProfile);
router.post('/verify-otp',      verifyOtp);
router.post('/resend-otp',      resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password',  resetPassword);

module.exports = router;
