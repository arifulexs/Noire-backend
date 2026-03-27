/**
 * NOIRE — Order Routes
 * POST /api/orders           — place a new order (auth)
 * GET  /api/orders           — get current user's orders (auth)
 * GET  /api/orders/:id       — get order detail (auth, own order only)
 */

const router = require('express').Router();
const { ProductModel, OrderModel, OrderItemModel, createOrderWithItems } = require('../models/db');
const { requireAuth } = require('../middleware/auth');
const { validators } = require('../middleware/validate');

/* ─ POST /api/orders — Place Order ──────────────────────────── */
router.post('/', requireAuth, validators.placeOrder, (req, res) => {
  try {
    const { items, shipping_name, shipping_email, shipping_address, notes = '' } = req.body;

    // Validate items array
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item.' });
    }

    // Resolve products from DB and validate stock
    const resolvedItems = [];
    let total = 0;

    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ error: 'Each item requires a valid product_id and quantity.' });
      }

      const product = ProductModel.findById.get(Number(item.product_id));
      if (!product) {
        return res.status(400).json({ error: `Product ID ${item.product_id} not found.` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for "${product.name}". Available: ${product.stock}.`
        });
      }

      const itemTotal = product.price * item.quantity;
      total += itemTotal;

      resolvedItems.push({
        product_id:    product.id,
        product_name:  product.name,
        product_price: product.price,
        quantity:      Number(item.quantity),
      });
    }

    // Create order + items in single transaction
    const order = createOrderWithItems(
      {
        user_id:          req.user.id,
        total:            parseFloat(total.toFixed(2)),
        status:           'pending',
        shipping_name:    shipping_name.trim(),
        shipping_email:   shipping_email.trim().toLowerCase(),
        shipping_address: shipping_address.trim(),
        notes:            notes.trim(),
      },
      resolvedItems
    );

    // Get order items for response
    const orderItems = OrderItemModel.findByOrder.all(order.id);

    res.status(201).json({
      message: 'Order placed successfully.',
      order: { ...order, items: orderItems },
    });
  } catch (err) {
    console.error('[ORDERS] Place order error:', err);
    res.status(500).json({ error: 'Failed to place order. Please try again.' });
  }
});

/* ─ GET /api/orders — User's orders ─────────────────────────── */
router.get('/', requireAuth, (req, res) => {
  try {
    const orders = OrderModel.findByUser.all(req.user.id);

    // Attach items to each order
    const ordersWithItems = orders.map(o => ({
      ...o,
      items: OrderItemModel.findByOrder.all(o.id),
    }));

    res.json({ orders: ordersWithItems, total: ordersWithItems.length });
  } catch (err) {
    console.error('[ORDERS] List error:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
});

/* ─ GET /api/orders/:id — Single order detail ───────────────── */
router.get('/:id', requireAuth, (req, res) => {
  try {
    const order = OrderModel.findById.get(Number(req.params.id));
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    // Users can only see their own orders (admins can see all — use admin route)
    if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    const items = OrderItemModel.findByOrder.all(order.id);
    res.json({ order: { ...order, items } });
  } catch (err) {
    console.error('[ORDERS] Detail error:', err);
    res.status(500).json({ error: 'Failed to fetch order.' });
  }
});

module.exports = router;
