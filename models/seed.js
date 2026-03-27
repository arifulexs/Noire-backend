/**
 * NOIRE — Database Seed Script
 * Run: node models/seed.js
 * Creates admin user + sample product catalogue
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const { db, UserModel, ProductModel } = require('./db');

async function seed() {
  console.log('\n🌱  Seeding NOIRE database...\n');

  /* ── Admin User ─────────────────────────────────────────── */
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@noire.com';
  const adminPass  = process.env.ADMIN_PASSWORD || 'NoireAdmin2025!';
  const adminName  = process.env.ADMIN_NAME || 'NOIRE Admin';

  const existing = UserModel.findByEmail.get(adminEmail);
  if (!existing) {
    const hash = await bcrypt.hash(adminPass, 12);
    UserModel.create.run({ name: adminName, email: adminEmail, password: hash, role: 'admin' });
    console.log(`✅  Admin created: ${adminEmail} / ${adminPass}`);
  } else {
    console.log(`ℹ️   Admin already exists: ${adminEmail}`);
  }

  /* ── Sample Products ────────────────────────────────────── */
  const products = [
    {
      name: 'Obsidian Oversized Tee',
      description: 'Hand-stitched 100% Egyptian cotton tee. Drop-shoulder silhouette, heavyweight 280gsm fabric. The foundation of every elevated wardrobe.',
      price: 129,
      image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
      category: 'T-Shirts',
      stock: 47,
      is_featured: 1,
      is_limited: 1,
    },
    {
      name: 'Noir Signature Hoodie',
      description: 'Our most iconic piece. 400gsm French terry cotton blend with a structured hood, tonal embroidery, and gold hardware. Built to outlast every trend.',
      price: 249,
      image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
      category: 'Hoodies',
      stock: 34,
      is_featured: 1,
      is_limited: 0,
    },
    {
      name: 'Phantom Cargo Set',
      description: 'Matching cargo trousers and tee cut from Japanese ripstop fabric. Utility meets couture in this limited street set.',
      price: 389,
      image_url: 'https://images.unsplash.com/photo-1551537482-f2075a1d41f2?w=600&q=80',
      category: 'Sets',
      stock: 12,
      is_featured: 1,
      is_limited: 1,
    },
    {
      name: 'Gold Edition Bomber',
      description: 'Crafted from premium satin with gold thread lining. A statement jacket that commands every room. Numbers strictly limited to 150 units worldwide.',
      price: 459,
      image_url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=600&q=80',
      category: 'Outerwear',
      stock: 18,
      is_featured: 1,
      is_limited: 1,
    },
    {
      name: 'Velvet Logo Tee',
      description: 'Velvet-flocked NOIRE logo on 260gsm combed cotton. Relaxed fit with dropped shoulders.',
      price: 109,
      image_url: 'https://images.unsplash.com/photo-1503341504253-dff4815485f1?w=600&q=80',
      category: 'T-Shirts',
      stock: 60,
      is_featured: 0,
      is_limited: 0,
    },
    {
      name: 'Shadow Jogger',
      description: 'Tapered jogger in ponte knit fabric. Minimal aesthetic, maximum comfort. Ankle zip, side pockets, hidden waistband.',
      price: 189,
      image_url: 'https://images.unsplash.com/photo-1584464491033-06628f3a6b7b?w=600&q=80',
      category: 'Bottoms',
      stock: 29,
      is_featured: 0,
      is_limited: 0,
    },
  ];

  // Only insert products if table is empty
  const existing_count = db.prepare('SELECT COUNT(*) as c FROM products').get();
  if (existing_count.c === 0) {
    for (const p of products) {
      ProductModel.create.run(p);
    }
    console.log(`✅  ${products.length} products seeded`);
  } else {
    console.log(`ℹ️   Products already exist (${existing_count.c} found), skipping`);
  }

  console.log('\n✨  Seed complete!\n');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌  Seed failed:', err);
  process.exit(1);
});
