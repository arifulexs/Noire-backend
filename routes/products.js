/**
 * NOIRE — Product Routes
 * GET    /api/products           (public)
 * GET    /api/products/featured  (public)
 * GET    /api/products/:id       (public)
 * POST   /api/products           (admin)
 * PUT    /api/products/:id       (admin)
 * DELETE /api/products/:id       (admin)
 */

const router = require('express').Router();
const { ProductModel } = require('../models/db');
const { requireAdmin } = require('../middleware/auth');
const { validators } = require('../middleware/validate');

/* ── GET all products ───────────────────────────────────────── */
router.get('/', (req, res) => {
  try {
    const { category, featured } = req.query;
    let products = ProductModel.findAll.all();

    if (category) {
      products = products.filter(p => p.category.toLowerCase() === category.toLowerCase());
    }
    if (featured === '1' || featured === 'true') {
      products = products.filter(p => p.is_featured);
    }

    res.json({ products, total: products.length });
  } catch (err) {
    console.error('[PRODUCTS] List error:', err);
    res.status(500).json({ error: 'Failed to fetch products.' });
  }
});

/* ── GET featured products ──────────────────────────────────── */
router.get('/featured', (req, res) => {
  try {
    const products = ProductModel.findFeatured.all();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch featured products.' });
  }
});

/* ── GET single product ─────────────────────────────────────── */
router.get('/:id', (req, res) => {
  try {
    const product = ProductModel.findById.get(Number(req.params.id));
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    res.json({ product });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product.' });
  }
});

/* ── POST create product (admin) ────────────────────────────── */
router.post('/', requireAdmin, validators.createProduct, (req, res) => {
  try {
    const { name, description = '', price, image_url = '', category = 'General',
            stock, is_featured = 0, is_limited = 0 } = req.body;

    const result = ProductModel.create.run({
      name: name.trim(),
      description: description.trim(),
      price: Number(price),
      image_url: image_url.trim(),
      category: category.trim(),
      stock: Number(stock),
      is_featured: is_featured ? 1 : 0,
      is_limited: is_limited ? 1 : 0,
    });

    const product = ProductModel.findById.get(result.lastInsertRowid);
    res.status(201).json({ message: 'Product created successfully.', product });
  } catch (err) {
    console.error('[PRODUCTS] Create error:', err);
    res.status(500).json({ error: 'Failed to create product.' });
  }
});

/* ── PUT update product (admin) ─────────────────────────────── */
router.put('/:id', requireAdmin, validators.updateProduct, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = ProductModel.findById.get(id);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    const updated = {
      id,
      name:        req.body.name        ?? existing.name,
      description: req.body.description ?? existing.description,
      price:       req.body.price       !== undefined ? Number(req.body.price) : existing.price,
      image_url:   req.body.image_url   ?? existing.image_url,
      category:    req.body.category    ?? existing.category,
      stock:       req.body.stock       !== undefined ? Number(req.body.stock) : existing.stock,
      is_featured: req.body.is_featured !== undefined ? (req.body.is_featured ? 1 : 0) : existing.is_featured,
      is_limited:  req.body.is_limited  !== undefined ? (req.body.is_limited ? 1 : 0) : existing.is_limited,
    };

    ProductModel.update.run(updated);
    const product = ProductModel.findById.get(id);
    res.json({ message: 'Product updated successfully.', product });
  } catch (err) {
    console.error('[PRODUCTS] Update error:', err);
    res.status(500).json({ error: 'Failed to update product.' });
  }
});

/* ── DELETE product (admin) ─────────────────────────────────── */
router.delete('/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    const existing = ProductModel.findById.get(id);
    if (!existing) return res.status(404).json({ error: 'Product not found.' });

    ProductModel.delete.run(id);
    res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    console.error('[PRODUCTS] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

module.exports = router;
