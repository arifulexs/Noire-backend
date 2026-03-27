/**
 * NOIRE — Auth Routes
 * POST /api/auth/signup
 * POST /api/auth/login
 * POST /api/auth/forgot-password
 * POST /api/auth/reset-password
 * GET  /api/auth/me  (verify token)
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { UserModel, ResetModel } = require('../models/db');
const { signToken, requireAuth } = require('../middleware/auth');
const { validators } = require('../middleware/validate');

/* ═══════════════════════════════════════
   POST /api/auth/signup
═══════════════════════════════════════ */
router.post('/signup', validators.signup, async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Check if email already exists
    const existing = UserModel.findByEmail.get(email.trim().toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 12);

    // Create user
    const result = UserModel.create.run({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashed,
      role: 'user',
    });

    const newUser = UserModel.findById.get(result.lastInsertRowid);
    const token   = signToken(newUser);

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: {
        id:    newUser.id,
        name:  newUser.name,
        email: newUser.email,
        role:  newUser.role,
      },
    });
  } catch (err) {
    console.error('[AUTH] Signup error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

/* ═══════════════════════════════════════
   POST /api/auth/login
═══════════════════════════════════════ */
router.post('/login', validators.login, async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = UserModel.findByEmail.get(email.trim().toLowerCase());
    if (!user) {
      // Generic message to prevent email enumeration
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = signToken(user);

    res.json({
      message: 'Login successful.',
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/* ═══════════════════════════════════════
   POST /api/auth/forgot-password
   (Simulated — in production, send real email)
═══════════════════════════════════════ */
router.post('/forgot-password', validators.forgotPassword, (req, res) => {
  try {
    const { email } = req.body;
    const user = UserModel.findByEmail.get(email.trim().toLowerCase());

    // Always return success to prevent email enumeration
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    // Clean expired/used tokens
    ResetModel.cleanup.run();

    // Generate a reset token (expires in 1 hour)
    const token     = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
                      .toISOString().replace('T',' ').slice(0,19);

    ResetModel.create.run({ user_id: user.id, token, expires_at: expiresAt });

    // ── In production: send email with link ──────────────────
    // await sendEmail({ to: user.email, subject: 'Reset your NOIRE password',
    //   html: `<a href="${process.env.FRONTEND_URL}/reset-password?token=${token}">Reset</a>` });

    // ── For development: return token in response ────────────
    const isDev = process.env.NODE_ENV !== 'production';
    res.json({
      message: 'If that email exists, a reset link has been sent.',
      ...(isDev && { debug_token: token, debug_note: 'Token returned only in development mode' }),
    });
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process request.' });
  }
});

/* ═══════════════════════════════════════
   POST /api/auth/reset-password
═══════════════════════════════════════ */
router.post('/reset-password', validators.resetPassword, async (req, res) => {
  try {
    const { token, password } = req.body;

    const reset = ResetModel.findByToken.get(token);
    if (!reset) {
      return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    UserModel.updatePassword.run(hashed, reset.user_id);
    ResetModel.markUsed.run(token);

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('[AUTH] Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

/* ═══════════════════════════════════════
   GET /api/auth/me — verify token + get current user
═══════════════════════════════════════ */
router.get('/me', requireAuth, (req, res) => {
  const user = UserModel.findById.get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  res.json({
    user: {
      id:         user.id,
      name:       user.name,
      email:      user.email,
      role:       user.role,
      created_at: user.created_at,
    }
  });
});

module.exports = router;
