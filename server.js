/**
 * NOIRE — Main Server v2 (Fixed)
 *
 * Key fix: auto-seeding now uses runSeed() which never calls process.exit().
 * The old approach of require('./models/seed.js') caused the server to exit
 * immediately because seed.js ended with process.exit(0).
 *
 * Now: seed runs automatically on every cold start, checks if data exists
 * first, and returns normally so the server continues listening.
 * No AUTO_SEED env var needed — just deploy and it works.
 */

require('dotenv').config();
const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const helmet      = require('helmet');
const cors        = require('cors');
const rateLimit   = require('express-rate-limit');
const compression = require('compression');
const cron        = require('node-cron');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ═══════════════════════════════════════
   SECURITY MIDDLEWARE
═══════════════════════════════════════ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https:", "http:", "blob:"],
      connectSrc: ["'self'", "https:"],
    }
  }
}));

app.use(compression());

/* ── CORS ─────────────────────────────────────────────────────── */
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map(o => o.trim())
  : ['*'];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*')) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

/* ── Body parsing ─────────────────────────────────────────────── */
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ═══════════════════════════════════════
   RATE LIMITING
═══════════════════════════════════════ */
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  skipSuccessfulRequests: true,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
}));

/* ═══════════════════════════════════════
   STATIC FILE SERVING
═══════════════════════════════════════ */
const uploadsPath = process.env.UPLOAD_DIR
  || path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsPath, { recursive: true });

// Serve uploaded images at /uploads/*
app.use('/uploads', express.static(uploadsPath));

// NOTE: Frontend static files are served by Vercel in production.
// In development (NODE_ENV != production), also serve from ../frontend/
if (process.env.NODE_ENV !== 'production') {
  const frontendPath = path.join(__dirname, '..', 'frontend');
  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    console.log(`[DEV] Serving frontend from ${frontendPath}`);
  }
}

/* ═══════════════════════════════════════
   API ROUTES
═══════════════════════════════════════ */
app.use('/api/auth',          require('./routes/auth'));
app.use('/api/products',      require('./routes/products'));
app.use('/api/orders',        require('./routes/orders'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/admin',         require('./routes/admin'));
app.use('/api/custom-orders', require('./routes/custom-orders'));
app.use('/api/messages',      require('./routes/messages'));

const { wishlistRouter, reviewRouter, couponRouter } = require('./routes/extras');
app.use('/api/wishlist', wishlistRouter);
app.use('/api/reviews',  reviewRouter);
app.use('/api/coupons',  couponRouter);

/* ── Health check ─────────────────────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    name:   'NOIRE API v2',
    env:    process.env.NODE_ENV || 'development',
    time:   new Date().toISOString(),
  });
});

/* ── 404 for unknown /api routes ──────────────────────────────── */
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

/* ── Dev SPA fallback ─────────────────────────────────────────── */
if (process.env.NODE_ENV !== 'production') {
  app.get('*', (req, res) => {
    const frontendPath = path.join(__dirname, '..', 'frontend');
    const indexFile    = path.join(frontendPath, 'index.html');
    if (fs.existsSync(indexFile)) {
      res.sendFile(indexFile);
    } else {
      res.status(404).send('Frontend not found — run from project root');
    }
  });
}

/* ═══════════════════════════════════════
   GLOBAL ERROR HANDLER
═══════════════════════════════════════ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE')  return res.status(400).json({ error: 'File too large. Max 5MB per image.' });
  if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ error: 'Too many files. Max 5 images.' });
  if (err.message?.includes('image files')) return res.status(400).json({ error: err.message });
  if (err.message?.includes('CORS'))   return res.status(403).json({ error: err.message });

  console.error('[SERVER ERROR]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred.'
      : err.message,
  });
});

/* ═══════════════════════════════════════
   CRON — Auto-delete expired conversations
   Runs daily at 02:00 server time
═══════════════════════════════════════ */
cron.schedule('0 2 * * *', () => {
  try {
    const { ConversationModel, MessageModel } = require('./models/db');
    const expired = ConversationModel.findExpired.all();
    let count = 0;
    for (const conv of expired) {
      MessageModel.deleteByConv.run(conv.id);
      MessageModel.deleteConv.run(conv.id);
      count++;
    }
    if (count > 0) console.log(`[CRON] Auto-deleted ${count} expired conversation(s)`);
  } catch (err) {
    console.error('[CRON] Auto-delete error:', err.message);
  }
});

/* ═══════════════════════════════════════
   START SERVER + AUTO-SEED
   ─────────────────────────────────────
   runSeed() is safe to call here because it:
   • Checks if data already exists before inserting
   • NEVER calls process.exit() when used as a module
   • Returns a Promise — server starts only after seed completes
═══════════════════════════════════════ */
async function startServer() {
  try {
    // Run seed — idempotent, safe on every boot
    const { runSeed } = require('./models/seed');
    await runSeed();
  } catch (err) {
    // Seed failure is non-fatal — log it but keep the server running
    console.error('[SEED] Warning: seed encountered an error:', err.message);
    console.error('[SEED] Server will continue starting normally.');
  }

  // Now start listening
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n✨  NOIRE API v2 is live');
    console.log(`    → Port:  ${PORT}`);
    console.log(`    → Mode:  ${process.env.NODE_ENV || 'development'}`);
    console.log(`    → Health: http://localhost:${PORT}/api/health\n`);
  });
}

startServer();

module.exports = app;
