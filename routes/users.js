/**
 * NOIRE — User Routes
 * GET  /api/users/profile  — current user profile
 * PUT  /api/users/profile  — update name
 * GET  /api/users/orders   — current user's order history (alias)
 */

const router = require('express').Router();
const { UserModel, OrderModel, OrderItemModel } = require('../models/db');
const { requireAuth } = require('../middleware/auth');

/* ─ GET /api/users/profile ──────────────────────────────────── */
router.get('/profile', requireAuth, (req, res) => {
  try {
    const user = UserModel.findById.get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const orders = OrderModel.findByUser.all(user.id);

    res.json({
      user: {
        id:         user.id,
        name:       user.name,
        email:      user.email,
        role:       user.role,
        created_at: user.created_at,
      },
      order_count: orders.length,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile.' });
  }
});

/* ─ PUT /api/users/profile ──────────────────────────────────── */
router.put('/profile', requireAuth, (req, res) => {
  try {
    const { name } = req.body;
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name must be at least 2 characters.' });
    }
    UserModel.updateProfile.run({ id: req.user.id, name: name.trim() });
    const updated = UserModel.findById.get(req.user.id);
    res.json({ message: 'Profile updated.', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

/* ─ GET /api/users/orders ───────────────────────────────────── */
router.get('/orders', requireAuth, (req, res) => {
  try {
    const orders = OrderModel.findByUser.all(req.user.id);
    const ordersWithItems = orders.map(o => ({
      ...o,
      items: OrderItemModel.findByOrder.all(o.id),
    }));
    res.json({ orders: ordersWithItems, total: ordersWithItems.length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

module.exports = router;
