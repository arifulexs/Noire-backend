/**
 * NOIRE — Admin Routes v2 (all require admin role)
 * Dashboard stats, users, orders, custom orders,
 * messaging (with auto-delete), coupons, reviews
 */

const router = require('express').Router();
const {
  UserModel, ProductModel, OrderModel, OrderItemModel,
  CustomOrderModel, CustomOrderImageModel,
  ConversationModel, MessageModel,
  ReviewModel, CouponModel,
} = require('../models/db');
const { requireAdmin } = require('../middleware/auth');
const { upload, setFolder, relativePath } = require('../middleware/upload');

router.use(requireAdmin);

/* ══════════════════════════════════════
   DASHBOARD STATS
══════════════════════════════════════ */
router.get('/stats', (req, res) => {
  try {
    const totalUsers      = UserModel.count.get().total;
    const totalProducts   = ProductModel.count.get().total;
    const totalOrders     = OrderModel.count.get().total;
    const revenue         = OrderModel.revenue.get().total_revenue;
    const orderStatuses   = OrderModel.countByStatus.all();
    const customPending   = CustomOrderModel.countPending.get().total;
    const unreadMessages  = ConversationModel.countUnread.get().total;
    const totalReviews    = ReviewModel.count.get().total;
    const recentOrders    = OrderModel.recent.all();
    const statusMap = orderStatuses.reduce((a, s) => { a[s.status] = s.count; return a; }, {});

    res.json({
      stats: {
        total_users: totalUsers, total_products: totalProducts,
        total_orders: totalOrders, total_revenue: parseFloat(revenue.toFixed(2)),
        orders_pending:    statusMap.pending    || 0,
        orders_processing: statusMap.processing || 0,
        orders_shipped:    statusMap.shipped    || 0,
        orders_delivered:  statusMap.delivered  || 0,
        orders_cancelled:  statusMap.cancelled  || 0,
        custom_pending:    customPending,
        unread_messages:   unreadMessages,
        total_reviews:     totalReviews,
      },
      recent_orders: recentOrders,
    });
  } catch (err) {
    console.error('[ADMIN] Stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats.' });
  }
});

/* ══════════════════════════════════════
   USERS
══════════════════════════════════════ */
router.get('/users', (req, res) => {
  try {
    res.json({ users: UserModel.findAll.all() });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/users/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
    const user = UserModel.findById.get(id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    UserModel.delete.run(id);
    res.json({ message: `User "${user.name}" deleted.` });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════
   ORDERS
══════════════════════════════════════ */
router.get('/orders', (req, res) => {
  try {
    const { status } = req.query;
    let orders = OrderModel.findAll.all();
    if (status) orders = orders.filter(o => o.status === status);
    const result = orders.map(o => ({ ...o, items: OrderItemModel.findByOrder.all(o.id) }));
    res.json({ orders: result, total: result.length });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.put('/orders/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending','processing','shipped','delivered','cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    const order = OrderModel.findById.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    OrderModel.updateStatus.run(status, order.id);
    res.json({ message: `Status updated to "${status}".`, order: OrderModel.findById.get(order.id) });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════
   CUSTOM ORDERS
══════════════════════════════════════ */
router.get('/custom-orders', (req, res) => {
  try {
    const orders = CustomOrderModel.findAll.all();
    const result = orders.map(o => ({
      ...o, images: CustomOrderImageModel.findByOrder.all(o.id),
    }));
    res.json({ orders: result, total: result.length });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.put('/custom-orders/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const order = CustomOrderModel.findById.get(id);
    if (!order) return res.status(404).json({ error: 'Custom order not found.' });
    const { status, admin_notes, quoted_price } = req.body;
    const validStatuses = ['pending','reviewing','quoted','accepted','in_production','completed','cancelled'];
    if (status && !validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
    CustomOrderModel.updateStatus.run({
      id,
      status:       status || order.status,
      admin_notes:  admin_notes !== undefined ? admin_notes : order.admin_notes,
      quoted_price: quoted_price !== undefined ? Number(quoted_price) : order.quoted_price,
    });
    res.json({ message: 'Custom order updated.', order: CustomOrderModel.findById.get(id) });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════
   CONVERSATIONS & MESSAGING (Admin side)
══════════════════════════════════════ */
router.get('/conversations', (req, res) => {
  try {
    const convs = ConversationModel.findAll.all();
    res.json({ conversations: convs });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.get('/conversations/:id/messages', (req, res) => {
  try {
    const convId = Number(req.params.id);
    const conv   = ConversationModel.findById.get(convId);
    if (!conv) return res.status(404).json({ error: 'Not found.' });
    const messages = MessageModel.findByConv.all(convId);
    MessageModel.markRead.run(convId, 'user');
    res.json({ conversation: conv, messages });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.post(
  '/conversations/:id/messages',
  setFolder('messages'),
  upload.single('image'),
  (req, res) => {
    try {
      const convId = Number(req.params.id);
      const conv   = ConversationModel.findById.get(convId);
      if (!conv) return res.status(404).json({ error: 'Not found.' });

      const content   = (req.body.content || '').trim();
      const imagePath = req.file ? relativePath(req.file.path) : null;

      if (!content && !imagePath) {
        return res.status(400).json({ error: 'Message must have text or an image.' });
      }

      const msgResult = MessageModel.create.run({
        conversation_id: convId,
        sender_id:   req.user.id,
        sender_role: 'admin',
        content:     content || null,
        image_path:  imagePath,
      });
      ConversationModel.updateLastMsg.run(convId);

      res.status(201).json({
        message: {
          id: msgResult.lastInsertRowid,
          conversation_id: convId,
          sender_id:   req.user.id,
          sender_role: 'admin',
          sender_name: req.user.name,
          content, image_path: imagePath,
          is_read: 0,
          created_at: new Date().toISOString(),
        }
      });
    } catch (err) {
      console.error('[ADMIN MESSAGES]', err);
      res.status(500).json({ error: 'Failed to send.' });
    }
  }
);

/* Set auto-delete policy on a conversation */
router.put('/conversations/:id/auto-delete', (req, res) => {
  try {
    const convId = Number(req.params.id);
    const conv   = ConversationModel.findById.get(convId);
    if (!conv) return res.status(404).json({ error: 'Not found.' });

    const { days } = req.body; // null = never, or number of days
    let deleteAfter = null;
    if (days !== null && days !== undefined) {
      const d = parseInt(days);
      if (isNaN(d) || d < 1) return res.status(400).json({ error: 'days must be a positive integer.' });
      const dt = new Date();
      dt.setDate(dt.getDate() + d);
      deleteAfter = dt.toISOString().replace('T', ' ').slice(0, 19);
    }
    ConversationModel.setAutoDelete.run({ id: convId, days: days ? parseInt(days) : null, delete_after: deleteAfter });
    res.json({ message: days ? `Auto-delete set to ${days} days.` : 'Auto-delete disabled.', delete_after: deleteAfter });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* Archive/delete a conversation */
router.delete('/conversations/:id', (req, res) => {
  try {
    const conv = ConversationModel.findById.get(Number(req.params.id));
    if (!conv) return res.status(404).json({ error: 'Not found.' });
    MessageModel.deleteByConv.run(conv.id);
    MessageModel.deleteConv.run(conv.id);
    res.json({ message: 'Conversation deleted.' });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════
   COUPONS
══════════════════════════════════════ */
router.get('/coupons', (req, res) => {
  try { res.json({ coupons: CouponModel.findAll.all() }); }
  catch { res.status(500).json({ error: 'Failed.' }); }
});

router.post('/coupons', (req, res) => {
  try {
    const { code, discount_type, discount_value, min_order, max_uses, expires_at } = req.body;
    if (!code || !discount_value) return res.status(400).json({ error: 'code and discount_value required.' });
    if (!['percent','fixed'].includes(discount_type)) return res.status(400).json({ error: 'discount_type must be percent or fixed.' });
    if (discount_type === 'percent' && (discount_value <= 0 || discount_value > 100)) {
      return res.status(400).json({ error: 'Percent discount must be 1-100.' });
    }
    const existing = CouponModel.findByCode.get(code.trim().toUpperCase());
    if (existing) return res.status(409).json({ error: 'Coupon code already exists.' });
    const result = CouponModel.create.run({
      code: code.trim().toUpperCase(),
      discount_type: discount_type || 'percent',
      discount_value: Number(discount_value),
      min_order: Number(min_order) || 0,
      max_uses: max_uses ? Number(max_uses) : null,
      expires_at: expires_at || null,
    });
    res.status(201).json({ message: 'Coupon created.', coupon: CouponModel.findById.get(result.lastInsertRowid) });
  } catch { res.status(500).json({ error: 'Failed to create coupon.' }); }
});

router.patch('/coupons/:id/toggle', (req, res) => {
  try {
    const coupon = CouponModel.findById.get(Number(req.params.id));
    if (!coupon) return res.status(404).json({ error: 'Not found.' });
    CouponModel.toggleActive.run(coupon.is_active ? 0 : 1, coupon.id);
    res.json({ message: `Coupon ${coupon.is_active ? 'deactivated' : 'activated'}.` });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/coupons/:id', (req, res) => {
  try {
    const coupon = CouponModel.findById.get(Number(req.params.id));
    if (!coupon) return res.status(404).json({ error: 'Not found.' });
    CouponModel.delete.run(coupon.id);
    res.json({ message: 'Coupon deleted.' });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

/* ══════════════════════════════════════
   REVIEWS
══════════════════════════════════════ */
router.get('/reviews', (req, res) => {
  try { res.json({ reviews: ReviewModel.findAll.all() }); }
  catch { res.status(500).json({ error: 'Failed.' }); }
});

router.patch('/reviews/:id/approve', (req, res) => {
  try {
    const { approved } = req.body;
    ReviewModel.updateApproval.run(approved ? 1 : 0, Number(req.params.id));
    res.json({ message: `Review ${approved ? 'approved' : 'hidden'}.` });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

router.delete('/reviews/:id', (req, res) => {
  try {
    ReviewModel.delete.run(Number(req.params.id));
    res.json({ message: 'Review deleted.' });
  } catch { res.status(500).json({ error: 'Failed.' }); }
});

module.exports = router;
