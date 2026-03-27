/**
 * NOIRE — Input Validation Middleware
 * Centralised validators for all routes.
 */

/* ── Generic validator factory ─────────────────────────────── */
function validate(schema) {
  return (req, res, next) => {
    const errors = [];
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      for (const rule of rules) {
        const err = rule(value, field);
        if (err) { errors.push(err); break; }
      }
    }
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], errors });
    }
    next();
  };
}

/* ── Rule builders ──────────────────────────────────────────── */
const rules = {
  required: (v, f) => (!v && v !== 0) ? `${f} is required` : null,
  string:   (v, f) => (v !== undefined && typeof v !== 'string') ? `${f} must be a string` : null,
  minLen:   (n) => (v, f) => (v && v.length < n) ? `${f} must be at least ${n} characters` : null,
  maxLen:   (n) => (v, f) => (v && v.length > n) ? `${f} must not exceed ${n} characters` : null,
  email:    (v, f) => (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) ? `${f} must be a valid email address` : null,
  number:   (v, f) => (v !== undefined && isNaN(Number(v))) ? `${f} must be a number` : null,
  positive: (v, f) => (v !== undefined && Number(v) < 0) ? `${f} must be a positive number` : null,
  integer:  (v, f) => (v !== undefined && !Number.isInteger(Number(v))) ? `${f} must be an integer` : null,
  role:     (v, f) => (v && !['user','admin'].includes(v)) ? `${f} must be 'user' or 'admin'` : null,
  status:   (v, f) => (v && !['pending','processing','shipped','delivered','cancelled'].includes(v))
                      ? `Invalid order status` : null,
};

/* ── Pre-built validator schemas ────────────────────────────── */
const validators = {
  signup: validate({
    name:     [rules.required, rules.string, rules.minLen(2), rules.maxLen(80)],
    email:    [rules.required, rules.email, rules.maxLen(200)],
    password: [rules.required, rules.string, rules.minLen(8), rules.maxLen(128)],
  }),

  login: validate({
    email:    [rules.required, rules.email],
    password: [rules.required, rules.string],
  }),

  forgotPassword: validate({
    email: [rules.required, rules.email],
  }),

  resetPassword: validate({
    token:    [rules.required, rules.string],
    password: [rules.required, rules.string, rules.minLen(8)],
  }),

  createProduct: validate({
    name:        [rules.required, rules.string, rules.minLen(2), rules.maxLen(200)],
    description: [rules.string, rules.maxLen(2000)],
    price:       [rules.required, rules.number, rules.positive],
    stock:       [rules.required, rules.integer],
  }),

  updateProduct: validate({
    name:  [rules.string, rules.minLen(2), rules.maxLen(200)],
    price: [rules.number, rules.positive],
    stock: [rules.integer],
  }),

  placeOrder: validate({
    items:            [rules.required],
    shipping_name:    [rules.required, rules.string, rules.minLen(2)],
    shipping_email:   [rules.required, rules.email],
    shipping_address: [rules.required, rules.string, rules.minLen(10)],
  }),

  updateOrderStatus: validate({
    status: [rules.required, rules.status],
  }),
};

module.exports = { validators, validate, rules };
