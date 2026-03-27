/**
 * NOIRE — Main Server v2
 * Express + SQLite + All Features
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
   MIDDLEWARE
═══════════════════════════════════════ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      imgSrc:     ["'self'", "data:", "https:", "http:", "blob:"],
      connectSrc: ["'self'"],
    }
  }
}));

app.use(compression());

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? (process.env.FRONTEND_ORIGIN || '*')
    : '*',
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

/* ═══════════════════════════════════════
   RATE LIMITING
═══════════════════════════════════════ */
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 300,
  message: { error: 'Too many requests.' },
}));
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000, max: 25,
  message: { error: 'Too many auth attempts. Try again in 15 minutes.' },
  skipSuccessfulRequests: true,
}));

/* ═══════════════════════════════════════
   STATIC FILES
═══════════════════════════════════════ */
const frontendPath = path.join(__dirname, '..', 'frontend');
const uploadsPath  = path.join(__dirname, 'uploads');
fs.mkdirSync(uploadsPath, { recursive: true });

app.use(express.static(frontendPath));
// Serve uploaded images at /uploads/*
app.use('/uploads', express.static(uploadsPath));

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

/* ═══════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════ */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'NOIRE API v2', time: new Date().toISOString() });
});

/* ═══════════════════════════════════════
   SPA FALLBACK
═══════════════════════════════════════ */
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

/* ═══════════════════════════════════════
   GLOBAL ERROR HANDLER
═══════════════════════════════════════ */
app.use((err, req, res, next) => {
  // Handle multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large. Maximum 5MB per image.' });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({ error: 'Too many files. Maximum 5 images allowed.' });
  }
  if (err.message && err.message.includes('image files')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('[SERVER ERROR]', err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
  });
});

/* ═══════════════════════════════════════
   CRON — Auto-delete expired conversations
   Runs every day at 2:00 AM
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
    if (count > 0) {
      console.log(`[CRON] Auto-deleted ${count} expired conversation(s).`);
    }
  } catch (err) {
    console.error('[CRON] Auto-delete error:', err);
  }
});

// TEMP: Run this only once to seed database
if (process.env.AUTO_SEED === 'true') {
  require('./models/seed.js');
}

/* ═══════════════════════════════════════
   START
═══════════════════════════════════════ */
app.listen(PORT, () => {
  console.log(`\n✨  NOIRE Server v2 running`);
  console.log(`    → http://localhost:${PORT}`);
  console.log(`    → API:  http://localhost:${PORT}/api`);
  console.log(`    → Mode: ${process.env.NODE_ENV || 'development'}\n`);
});

module.exports = app;
