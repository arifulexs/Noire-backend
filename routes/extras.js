/**
 * NOIRE — Wishlist Routes
 * GET    /api/wishlist          (auth) — my wishlist
 * POST   /api/wishlist          (auth) — add product
 * DELETE /api/wishlist/:productId (auth) — remove
 */
const wRouter = require('express').Router();
const { WishlistModel, ProductModel } = require('../models/db');
const { requireAuth } = require('../middleware/auth');

wRouter.get('/', requireAuth, (req, res) => {
  try {
    const items = WishlistModel.findByUser.all(req.user.id);
    res.json({ items, total: items.length });
  } catch { res.status(500).json({ error: 'Failed to fetch wishlist.' }); }
});

wRouter.post('/', requireAuth, (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id) return res.status(400).json({ error: 'product_id required.' });
    const product = ProductModel.findById.get(Number(product_id));
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    WishlistModel.add.run(req.user.id, product.id);
    res.status(201).json({ message: `"${product.name}" added to your wishlist.` });
  } catch { res.status(500).json({ error: 'Failed to update wishlist.' }); }
});

wRouter.delete('/:productId', requireAuth, (req, res) => {
  try {
    WishlistModel.remove.run(req.user.id, Number(req.params.productId));
    res.json({ message: 'Removed from wishlist.' });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

wRouter.get('/check/:productId', requireAuth, (req, res) => {
  try {
    const exists = WishlistModel.check.get(req.user.id, Number(req.params.productId));
    res.json({ in_wishlist: !!exists });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════════════════════════════
   REVIEWS
   GET  /api/reviews/:productId      (public) — product reviews
   POST /api/reviews                 (auth)   — submit review
   GET  /api/reviews/mine            (auth)   — my reviews
══════════════════════════════════════════════════════════════ */
const rRouter = require('express').Router();
const { ReviewModel } = require('../models/db');

rRouter.get('/mine', requireAuth, (req, res) => {
  try {
    const reviews = ReviewModel.findByUser.all(req.user.id);
    res.json({ reviews });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

rRouter.get('/:productId', (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const reviews   = ReviewModel.findByProduct.all(productId);
    const stats     = ReviewModel.stats.get(productId);
    res.json({
      reviews,
      stats: {
        avg_rating: stats?.avg_rating ? parseFloat(stats.avg_rating.toFixed(1)) : 0,
        total:      stats?.total || 0,
      },
    });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

rRouter.post('/', requireAuth, (req, res) => {
  try {
    const { product_id, order_id, rating, title, content } = req.body;
    if (!product_id || !rating || !content) {
      return res.status(400).json({ error: 'product_id, rating and content are required.' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be 1-5.' });
    }
    if (content.trim().length < 10) {
      return res.status(400).json({ error: 'Review must be at least 10 characters.' });
    }
    const result = ReviewModel.create.run({
      user_id:    req.user.id,
      product_id: Number(product_id),
      order_id:   order_id ? Number(order_id) : null,
      rating:     Number(rating),
      title:      (title || '').trim() || null,
      content:    content.trim(),
    });
    if (result.changes === 0) {
      return res.status(409).json({ error: 'You have already reviewed this product.' });
    }
    res.status(201).json({ message: 'Review submitted. Thank you!' });
  } catch { res.status(500).json({ error: 'Failed to submit review.' }); }
});

/* ══════════════════════════════════════════════════════════════
   COUPONS
   POST /api/coupons/validate   (auth) — validate + calculate discount
══════════════════════════════════════════════════════════════ */
const cRouter = require('express').Router();
const { CouponModel } = require('../models/db');

cRouter.post('/validate', requireAuth, (req, res) => {
  try {
    const { code, order_total } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code required.' });

    const coupon = CouponModel.findByCode.get(code.trim().toUpperCase());

    if (!coupon) return res.status(404).json({ error: 'Coupon code not found.' });
    if (!coupon.is_active) return res.status(400).json({ error: 'This coupon is no longer active.' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This coupon has expired.' });
    }
    if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
      return res.status(400).json({ error: 'This coupon has reached its usage limit.' });
    }

    const total = Number(order_total) || 0;
    if (total < coupon.min_order) {
      return res.status(400).json({
        error: `Minimum order of $${coupon.min_order.toFixed(2)} required for this coupon.`
      });
    }

    const discount = coupon.discount_type === 'percent'
      ? (total * coupon.discount_value) / 100
      : Math.min(coupon.discount_value, total);

    res.json({
      valid: true,
      code:           coupon.code,
      discount_type:  coupon.discount_type,
      discount_value: coupon.discount_value,
      discount_amount: parseFloat(discount.toFixed(2)),
      new_total:       parseFloat((total - discount).toFixed(2)),
      message: coupon.discount_type === 'percent'
        ? `${coupon.discount_value}% discount applied! You save $${discount.toFixed(2)}`
        : `$${coupon.discount_value} off applied!`,
    });
  } catch { res.status(500).json({ error: 'Failed to validate coupon.' }); }
});

module.exports = { wishlistRouter: wRouter, reviewRouter: rRouter, couponRouter: cRouter };
