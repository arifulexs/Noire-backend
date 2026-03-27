/**
 * NOIRE — Custom Orders Routes
 * POST   /api/custom-orders           (auth) — submit request + images
 * GET    /api/custom-orders           (auth) — my requests
 * GET    /api/custom-orders/:id       (auth) — single request
 * DELETE /api/custom-orders/:id       (auth) — cancel own request
 */

const router = require('express').Router();
const path   = require('path');
const { CustomOrderModel, CustomOrderImageModel, createCustomOrderWithImages } = require('../models/db');
const { requireAuth }  = require('../middleware/auth');
const { upload, setFolder, relativePath } = require('../middleware/upload');

const VALID_CATEGORIES = ['T-Shirt','Hoodie','Jacket','Pants','Set','Dress','Accessories','Other'];
const VALID_STATUS = ['pending','reviewing','quoted','accepted','in_production','completed','cancelled'];

/* ── POST /api/custom-orders ────────────────────────────────── */
router.post(
  '/',
  requireAuth,
  setFolder('custom-orders'),
  upload.array('images', 5),
  (req, res) => {
    try {
      const { category, description, budget, quantity } = req.body;

      if (!description || description.trim().length < 10) {
        return res.status(400).json({ error: 'Description must be at least 10 characters.' });
      }
      if (category && !VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Valid: ${VALID_CATEGORIES.join(', ')}` });
      }

      const imageData = (req.files || []).map(f => ({
        image_path:    relativePath(f.path),
        original_name: f.originalname,
      }));

      const order = createCustomOrderWithImages(
        {
          user_id:     req.user.id,
          category:    category || 'Other',
          description: description.trim(),
          budget:      (budget || '').trim() || null,
          quantity:    Math.max(1, parseInt(quantity) || 1),
        },
        imageData
      );

      const images = CustomOrderImageModel.findByOrder.all(order.id);

      res.status(201).json({
        message: 'Custom order submitted! We\'ll review and reply within 24–48 hours.',
        order: { ...order, images },
      });
    } catch (err) {
      console.error('[CUSTOM-ORDERS] Create:', err);
      res.status(500).json({ error: 'Failed to submit custom order.' });
    }
  }
);

/* ── GET /api/custom-orders ─────────────────────────────────── */
router.get('/', requireAuth, (req, res) => {
  try {
    const orders = CustomOrderModel.findByUser.all(req.user.id);
    const result = orders.map(o => ({
      ...o,
      images: CustomOrderImageModel.findByOrder.all(o.id),
    }));
    res.json({ orders: result, total: result.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch custom orders.' });
  }
});

/* ── GET /api/custom-orders/:id ─────────────────────────────── */
router.get('/:id', requireAuth, (req, res) => {
  try {
    const order = CustomOrderModel.findById.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Custom order not found.' });
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const images = CustomOrderImageModel.findByOrder.all(order.id);
    res.json({ order: { ...order, images } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch custom order.' });
  }
});

/* ── DELETE /api/custom-orders/:id ─────────────────────────── */
router.delete('/:id', requireAuth, (req, res) => {
  try {
    const order = CustomOrderModel.findById.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Custom order not found.' });
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    if (!['pending','cancelled'].includes(order.status) && req.user.role !== 'admin') {
      return res.status(400).json({ error: 'Cannot cancel an order that is already in progress.' });
    }
    CustomOrderModel.delete.run(order.id);
    res.json({ message: 'Custom order cancelled.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel custom order.' });
  }
});

module.exports = router;
