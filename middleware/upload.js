/**
 * NOIRE — Upload Middleware (Multer)
 * Handles image uploads for custom orders and messages.
 * Stores files on disk; swap storage engine for Cloudinary/S3 in production.
 */

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

// Ensure upload directories exist
['custom-orders', 'messages'].forEach(dir => {
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
});

/* ── Disk storage ───────────────────────────────────────────── */
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = req._uploadFolder || 'misc';
    const dest   = path.join(UPLOAD_DIR, folder);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename(req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`;
    cb(null, name);
  },
});

/* ── File type filter ───────────────────────────────────────── */
const fileFilter = (req, file, cb) => {
  const allowed = /\.(jpg|jpeg|png|webp|gif)$/i;
  if (allowed.test(path.extname(file.originalname))) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPG, PNG, WEBP, GIF) are allowed.'), false);
  }
};

/* ── Multer instance ────────────────────────────────────────── */
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,  // 5 MB per file
    files: 5,                    // max 5 files per request
  },
});

/* ── Helper: set folder before multer runs ──────────────────── */
function setFolder(folder) {
  return (req, res, next) => {
    req._uploadFolder = folder;
    next();
  };
}

/* ── Helper: build public URL from stored file path ─────────── */
function fileUrl(req, filePath) {
  if (!filePath) return null;
  // filePath is relative to UPLOAD_DIR e.g. "custom-orders/1234.jpg"
  return `${req.protocol}://${req.get('host')}/uploads/${filePath}`;
}

/* ── Helper: normalise stored path to be relative ──────────── */
function relativePath(absPath) {
  return absPath.replace(UPLOAD_DIR + path.sep, '').replace(/\\/g, '/');
}

module.exports = { upload, setFolder, fileUrl, relativePath, UPLOAD_DIR };
