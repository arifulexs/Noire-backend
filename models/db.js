/**
 * NOIRE — Database Model v2 (SQLite via better-sqlite3)
 * Full schema: users, products, orders, custom_orders,
 * conversations, messages, wishlist, reviews, coupons
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'noire.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* ═══════════════════════════════════════
   SCHEMA
═══════════════════════════════════════ */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin')),
    avatar TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price REAL NOT NULL CHECK(price >= 0),
    image_url TEXT NOT NULL DEFAULT '',
    category TEXT NOT NULL DEFAULT 'General',
    stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
    is_featured INTEGER NOT NULL DEFAULT 0,
    is_limited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','processing','shipped','delivered','cancelled')),
    coupon_code TEXT,
    discount_amount REAL NOT NULL DEFAULT 0,
    shipping_name TEXT,
    shipping_email TEXT,
    shipping_address TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0)
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL DEFAULT 'T-Shirt',
    description TEXT NOT NULL,
    budget TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','reviewing','quoted','accepted','in_production','completed','cancelled')),
    admin_notes TEXT,
    quoted_price REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS custom_order_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    custom_order_id INTEGER NOT NULL REFERENCES custom_orders(id) ON DELETE CASCADE,
    image_path TEXT NOT NULL,
    original_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    custom_order_id INTEGER REFERENCES custom_orders(id) ON DELETE SET NULL,
    subject TEXT NOT NULL DEFAULT 'General Inquiry',
    auto_delete_days INTEGER,
    delete_after TEXT,
    last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_role TEXT NOT NULL DEFAULT 'user' CHECK(sender_role IN ('user','admin')),
    content TEXT,
    image_path TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title TEXT,
    content TEXT NOT NULL,
    is_approved INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    discount_type TEXT NOT NULL DEFAULT 'percent' CHECK(discount_type IN ('percent','fixed')),
    discount_value REAL NOT NULL CHECK(discount_value > 0),
    min_order REAL NOT NULL DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_users_email        ON users(email);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id     ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status      ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_order_items_order  ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_reset_token        ON password_resets(token);
  CREATE INDEX IF NOT EXISTS idx_custom_orders_user ON custom_orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_conv_user          ON conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_conv      ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_messages_created   ON messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_wishlist_user      ON wishlist(user_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_product    ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_coupon_code        ON coupons(code);
`);

/* ─── USER ──────────────────────────────────────────────────── */
const UserModel = {
  findAll:        db.prepare(`SELECT id,name,email,role,avatar,created_at,updated_at FROM users ORDER BY created_at DESC`),
  findById:       db.prepare(`SELECT id,name,email,role,avatar,created_at,updated_at FROM users WHERE id=?`),
  findByEmail:    db.prepare(`SELECT * FROM users WHERE email=? COLLATE NOCASE`),
  create:         db.prepare(`INSERT INTO users(name,email,password,role) VALUES(@name,@email,@password,@role)`),
  updatePassword: db.prepare(`UPDATE users SET password=?,updated_at=datetime('now') WHERE id=?`),
  updateProfile:  db.prepare(`UPDATE users SET name=@name,updated_at=datetime('now') WHERE id=@id`),
  delete:         db.prepare(`DELETE FROM users WHERE id=?`),
  count:          db.prepare(`SELECT COUNT(*) as total FROM users`),
};

/* ─── PRODUCT ───────────────────────────────────────────────── */
const ProductModel = {
  findAll:      db.prepare(`SELECT * FROM products ORDER BY created_at DESC`),
  findFeatured: db.prepare(`SELECT * FROM products WHERE is_featured=1 AND stock>0 ORDER BY created_at DESC LIMIT 8`),
  findById:     db.prepare(`SELECT * FROM products WHERE id=?`),
  categories:   db.prepare(`SELECT DISTINCT category FROM products ORDER BY category`),
  create:       db.prepare(`INSERT INTO products(name,description,price,image_url,category,stock,is_featured,is_limited) VALUES(@name,@description,@price,@image_url,@category,@stock,@is_featured,@is_limited)`),
  update:       db.prepare(`UPDATE products SET name=@name,description=@description,price=@price,image_url=@image_url,category=@category,stock=@stock,is_featured=@is_featured,is_limited=@is_limited,updated_at=datetime('now') WHERE id=@id`),
  decrementStock: db.prepare(`UPDATE products SET stock=MAX(0,stock-?),updated_at=datetime('now') WHERE id=?`),
  delete:       db.prepare(`DELETE FROM products WHERE id=?`),
  count:        db.prepare(`SELECT COUNT(*) as total FROM products`),
};

/* ─── ORDER ─────────────────────────────────────────────────── */
const OrderModel = {
  findAll:     db.prepare(`SELECT o.*,u.name as user_name,u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC`),
  findById:    db.prepare(`SELECT o.*,u.name as user_name,u.email as user_email FROM orders o LEFT JOIN users u ON o.user_id=u.id WHERE o.id=?`),
  findByUser:  db.prepare(`SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC`),
  create:      db.prepare(`INSERT INTO orders(user_id,total,status,coupon_code,discount_amount,shipping_name,shipping_email,shipping_address,notes) VALUES(@user_id,@total,@status,@coupon_code,@discount_amount,@shipping_name,@shipping_email,@shipping_address,@notes)`),
  updateStatus: db.prepare(`UPDATE orders SET status=?,updated_at=datetime('now') WHERE id=?`),
  count:        db.prepare(`SELECT COUNT(*) as total FROM orders`),
  countByStatus:db.prepare(`SELECT status,COUNT(*) as count FROM orders GROUP BY status`),
  revenue:      db.prepare(`SELECT COALESCE(SUM(total),0) as total_revenue FROM orders WHERE status!='cancelled'`),
  recent:       db.prepare(`SELECT o.id,o.total,o.status,o.created_at,u.name as user_name FROM orders o JOIN users u ON o.user_id=u.id ORDER BY o.created_at DESC LIMIT 8`),
};

const OrderItemModel = {
  create:      db.prepare(`INSERT INTO order_items(order_id,product_id,product_name,product_price,quantity) VALUES(@order_id,@product_id,@product_name,@product_price,@quantity)`),
  findByOrder: db.prepare(`SELECT oi.*,p.image_url FROM order_items oi LEFT JOIN products p ON oi.product_id=p.id WHERE oi.order_id=?`),
};

/* ─── PASSWORD RESET ────────────────────────────────────────── */
const ResetModel = {
  create:      db.prepare(`INSERT INTO password_resets(user_id,token,expires_at) VALUES(@user_id,@token,@expires_at)`),
  findByToken: db.prepare(`SELECT pr.*,u.email,u.id as uid FROM password_resets pr JOIN users u ON pr.user_id=u.id WHERE pr.token=? AND pr.used=0 AND pr.expires_at>datetime('now')`),
  markUsed:    db.prepare(`UPDATE password_resets SET used=1 WHERE token=?`),
  cleanup:     db.prepare(`DELETE FROM password_resets WHERE expires_at<datetime('now') OR used=1`),
};

/* ─── CUSTOM ORDERS ─────────────────────────────────────────── */
const CustomOrderModel = {
  findAll:     db.prepare(`SELECT co.*,u.name as user_name,u.email as user_email FROM custom_orders co JOIN users u ON co.user_id=u.id ORDER BY co.created_at DESC`),
  findById:    db.prepare(`SELECT co.*,u.name as user_name,u.email as user_email FROM custom_orders co JOIN users u ON co.user_id=u.id WHERE co.id=?`),
  findByUser:  db.prepare(`SELECT * FROM custom_orders WHERE user_id=? ORDER BY created_at DESC`),
  create:      db.prepare(`INSERT INTO custom_orders(user_id,category,description,budget,quantity) VALUES(@user_id,@category,@description,@budget,@quantity)`),
  updateStatus: db.prepare(`UPDATE custom_orders SET status=@status,admin_notes=@admin_notes,quoted_price=@quoted_price,updated_at=datetime('now') WHERE id=@id`),
  delete:      db.prepare(`DELETE FROM custom_orders WHERE id=?`),
  count:       db.prepare(`SELECT COUNT(*) as total FROM custom_orders`),
  countPending:db.prepare(`SELECT COUNT(*) as total FROM custom_orders WHERE status='pending'`),
};

const CustomOrderImageModel = {
  create:      db.prepare(`INSERT INTO custom_order_images(custom_order_id,image_path,original_name) VALUES(@custom_order_id,@image_path,@original_name)`),
  findByOrder: db.prepare(`SELECT * FROM custom_order_images WHERE custom_order_id=?`),
};

/* ─── CONVERSATIONS & MESSAGES ──────────────────────────────── */
const ConversationModel = {
  findAll:     db.prepare(`SELECT c.*,u.name as user_name,u.email as user_email,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.is_read=0 AND m.sender_role='user') as unread_count FROM conversations c JOIN users u ON c.user_id=u.id ORDER BY c.last_message_at DESC`),
  findByUser:  db.prepare(`SELECT c.*,(SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.is_read=0 AND m.sender_role='admin') as unread_count FROM conversations c WHERE c.user_id=? AND c.is_archived=0 ORDER BY c.last_message_at DESC`),
  findById:    db.prepare(`SELECT c.*,u.name as user_name,u.email as user_email FROM conversations c JOIN users u ON c.user_id=u.id WHERE c.id=?`),
  create:      db.prepare(`INSERT INTO conversations(user_id,custom_order_id,subject) VALUES(@user_id,@custom_order_id,@subject)`),
  updateLastMsg: db.prepare(`UPDATE conversations SET last_message_at=datetime('now') WHERE id=?`),
  setAutoDelete: db.prepare(`UPDATE conversations SET auto_delete_days=@days,delete_after=@delete_after WHERE id=@id`),
  archive:     db.prepare(`UPDATE conversations SET is_archived=1 WHERE id=?`),
  findExpired: db.prepare(`SELECT id FROM conversations WHERE auto_delete_days IS NOT NULL AND delete_after IS NOT NULL AND delete_after < datetime('now')`),
  countUnread: db.prepare(`SELECT COUNT(*) as total FROM messages WHERE is_read=0 AND sender_role='user'`),
};

const MessageModel = {
  findByConv:  db.prepare(`SELECT m.*,u.name as sender_name FROM messages m JOIN users u ON m.sender_id=u.id WHERE m.conversation_id=? ORDER BY m.created_at ASC`),
  create:      db.prepare(`INSERT INTO messages(conversation_id,sender_id,sender_role,content,image_path) VALUES(@conversation_id,@sender_id,@sender_role,@content,@image_path)`),
  markRead:    db.prepare(`UPDATE messages SET is_read=1 WHERE conversation_id=? AND sender_role!=?`),
  deleteByConv:db.prepare(`DELETE FROM messages WHERE conversation_id=?`),
  deleteConv:  db.prepare(`DELETE FROM conversations WHERE id=?`),
};

/* ─── WISHLIST ──────────────────────────────────────────────── */
const WishlistModel = {
  findByUser: db.prepare(`SELECT w.*,p.name,p.price,p.image_url,p.category,p.stock,p.is_limited FROM wishlist w JOIN products p ON w.product_id=p.id WHERE w.user_id=? ORDER BY w.created_at DESC`),
  add:        db.prepare(`INSERT OR IGNORE INTO wishlist(user_id,product_id) VALUES(?,?)`),
  remove:     db.prepare(`DELETE FROM wishlist WHERE user_id=? AND product_id=?`),
  check:      db.prepare(`SELECT id FROM wishlist WHERE user_id=? AND product_id=?`),
  count:      db.prepare(`SELECT COUNT(*) as total FROM wishlist WHERE user_id=?`),
};

/* ─── REVIEWS ───────────────────────────────────────────────── */
const ReviewModel = {
  findByProduct: db.prepare(`SELECT r.*,u.name as user_name FROM reviews r JOIN users u ON r.user_id=u.id WHERE r.product_id=? AND r.is_approved=1 ORDER BY r.created_at DESC`),
  findAll:       db.prepare(`SELECT r.*,u.name as user_name,p.name as product_name FROM reviews r JOIN users u ON r.user_id=u.id JOIN products p ON r.product_id=p.id ORDER BY r.created_at DESC`),
  findByUser:    db.prepare(`SELECT r.*,p.name as product_name,p.image_url FROM reviews r JOIN products p ON r.product_id=p.id WHERE r.user_id=? ORDER BY r.created_at DESC`),
  create:        db.prepare(`INSERT OR IGNORE INTO reviews(user_id,product_id,order_id,rating,title,content) VALUES(@user_id,@product_id,@order_id,@rating,@title,@content)`),
  stats:         db.prepare(`SELECT AVG(rating) as avg_rating,COUNT(*) as total FROM reviews WHERE product_id=? AND is_approved=1`),
  updateApproval:db.prepare(`UPDATE reviews SET is_approved=? WHERE id=?`),
  delete:        db.prepare(`DELETE FROM reviews WHERE id=?`),
  count:         db.prepare(`SELECT COUNT(*) as total FROM reviews`),
};

/* ─── COUPONS ───────────────────────────────────────────────── */
const CouponModel = {
  findAll:    db.prepare(`SELECT * FROM coupons ORDER BY created_at DESC`),
  findByCode: db.prepare(`SELECT * FROM coupons WHERE code=? COLLATE NOCASE`),
  findById:   db.prepare(`SELECT * FROM coupons WHERE id=?`),
  create:     db.prepare(`INSERT INTO coupons(code,discount_type,discount_value,min_order,max_uses,expires_at) VALUES(@code,@discount_type,@discount_value,@min_order,@max_uses,@expires_at)`),
  incrementUsed: db.prepare(`UPDATE coupons SET used_count=used_count+1 WHERE code=? COLLATE NOCASE`),
  toggleActive:  db.prepare(`UPDATE coupons SET is_active=? WHERE id=?`),
  delete:     db.prepare(`DELETE FROM coupons WHERE id=?`),
};

/* ═══════════════════════════════════════
   TRANSACTIONS
═══════════════════════════════════════ */
const createOrderWithItems = db.transaction((orderData, items) => {
  const result  = OrderModel.create.run(orderData);
  const orderId = result.lastInsertRowid;
  for (const item of items) {
    OrderItemModel.create.run({ ...item, order_id: orderId });
    if (item.product_id) ProductModel.decrementStock.run(item.quantity, item.product_id);
  }
  if (orderData.coupon_code) CouponModel.incrementUsed.run(orderData.coupon_code);
  return OrderModel.findById.get(orderId);
});

const createCustomOrderWithImages = db.transaction((orderData, imagePaths) => {
  const result  = CustomOrderModel.create.run(orderData);
  const orderId = result.lastInsertRowid;
  for (const img of imagePaths) {
    CustomOrderImageModel.create.run({ custom_order_id: orderId, ...img });
  }
  // Auto-create conversation for this custom order
  ConversationModel.create.run({
    user_id: orderData.user_id,
    custom_order_id: orderId,
    subject: `Custom Order #${orderId} — ${orderData.category}`,
  });
  return CustomOrderModel.findById.get(orderId);
});

module.exports = {
  db,
  UserModel, ProductModel, OrderModel, OrderItemModel, ResetModel,
  CustomOrderModel, CustomOrderImageModel,
  ConversationModel, MessageModel,
  WishlistModel, ReviewModel, CouponModel,
  createOrderWithItems, createCustomOrderWithImages,
};
