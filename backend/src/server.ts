import Fastify from 'fastify';
import { db, markOverdueDebts } from './db.js';
import { signToken, requireAuth } from './auth.js';
import { parseDebtText } from './voice.js';

const app = Fastify({ logger: true });

// CORS (Mini App va admin panel boshqa domendan keladi)
app.addHook('onSend', async (_req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
});
app.options('*', async (_req, reply) => reply.code(204).send());

// ---------- AUTH ----------
const otpStore = new Map<string, string>();

app.post<{ Body: { phone: string } }>('/auth/request-otp', async (req) => {
  const { phone } = req.body;
  // DEV: kod doim 123456. PROD: Eskiz.uz orqali SMS yuboriladi.
  const code = process.env.NODE_ENV === 'production' ? String(Math.floor(100000 + Math.random() * 900000)) : '123456';
  otpStore.set(phone, code);
  return { ok: true, dev_hint: process.env.NODE_ENV === 'production' ? undefined : code };
});

app.post<{ Body: { phone: string; code: string; shop_name?: string } }>('/auth/verify', async (req, reply) => {
  const { phone, code, shop_name } = req.body;
  if (otpStore.get(phone) !== code) return reply.code(400).send({ error: 'invalid_code' });
  otpStore.delete(phone);
  let shop = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
  if (!shop) {
    const info = db
      .prepare('INSERT INTO shops (phone, name) VALUES (?, ?)')
      .run(phone, shop_name ?? 'Mening do‘konim');
    shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(info.lastInsertRowid);
  }
  return { token: signToken(shop.id), shop };
});

// ---------- PROFIL ----------
app.get('/me', { preHandler: requireAuth }, async (req) => {
  return db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId);
});

app.patch<{ Body: Record<string, unknown> }>('/me', { preHandler: requireAuth }, async (req) => {
  const allowed = ['name', 'owner_name', 'address', 'language', 'card_number'];
  for (const key of allowed) {
    if (key in req.body) {
      db.prepare(`UPDATE shops SET ${key} = ? WHERE id = ?`).run(req.body[key], req.shopId);
    }
  }
  return db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId);
});

// ---------- DASHBOARD ----------
app.get('/dashboard', { preHandler: requireAuth }, async (req) => {
  markOverdueDebts();
  const owedToMe = db
    .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM debts WHERE shop_id = ? AND status != 'paid'`)
    .get(req.shopId) as any;
  const iOwe = db
    .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM supplier_debts WHERE shop_id = ? AND status != 'paid'`)
    .get(req.shopId) as any;
  const dueToday = db
    .prepare(
      `SELECT d.*, c.name AS customer_name FROM debts d JOIN customers c ON c.id = d.customer_id
       WHERE d.shop_id = ? AND d.status != 'paid' AND d.due_date = date('now') ORDER BY d.amount DESC`
    )
    .all(req.shopId);
  const overdue = db
    .prepare(
      `SELECT d.*, c.name AS customer_name FROM debts d JOIN customers c ON c.id = d.customer_id
       WHERE d.shop_id = ? AND d.status = 'overdue' ORDER BY d.due_date ASC`
    )
    .all(req.shopId);
  const lowStock = db
    .prepare(`SELECT * FROM products WHERE shop_id = ? AND stock <= low_stock_threshold ORDER BY stock ASC LIMIT 10`)
    .all(req.shopId);
  const expiringSoon = db
    .prepare(
      `SELECT * FROM products WHERE shop_id = ? AND expiry_date IS NOT NULL
       AND expiry_date <= date('now', '+7 days') ORDER BY expiry_date ASC LIMIT 10`
    )
    .all(req.shopId);
  return {
    owed_to_me: owedToMe.s,
    i_owe: iOwe.s,
    net: owedToMe.s - iOwe.s,
    due_today: dueToday,
    overdue,
    low_stock: lowStock,
    expiring_soon: expiringSoon,
  };
});

// ---------- MIJOZLAR ----------
app.get('/customers', { preHandler: requireAuth }, async (req) => {
  return db
    .prepare(
      `SELECT c.*, COALESCE(SUM(CASE WHEN d.status != 'paid' THEN d.amount - d.paid_amount END), 0) AS balance,
              MAX(d.created_at) AS last_activity
       FROM customers c LEFT JOIN debts d ON d.customer_id = c.id
       WHERE c.shop_id = ? GROUP BY c.id ORDER BY balance DESC`
    )
    .all(req.shopId);
});

app.post<{ Body: { name: string; phone?: string; language?: string; note?: string } }>(
  '/customers',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { name, phone, language, note } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });
    const info = db
      .prepare('INSERT INTO customers (shop_id, name, phone, language, note) VALUES (?, ?, ?, ?, ?)')
      .run(req.shopId, name.trim(), phone ?? null, language ?? 'uz', note ?? null);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  }
);

app.get<{ Params: { id: string } }>('/customers/:id', { preHandler: requireAuth }, async (req, reply) => {
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!customer) return reply.code(404).send({ error: 'not_found' });
  const debts = db
    .prepare('SELECT * FROM debts WHERE customer_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  return { ...customer, debts };
});

// ---------- QARZLAR ----------
app.post<{ Body: { customer_id?: number; customer_name?: string; amount: number; note?: string; due_date?: string; source?: string } }>(
  '/debts',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { customer_id, customer_name, amount, note, due_date, source } = req.body;
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    let cid = customer_id;
    if (!cid && customer_name) {
      const existing = db
        .prepare('SELECT id FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
        .get(req.shopId, customer_name.trim()) as any;
      cid = existing
        ? existing.id
        : Number(
            db.prepare('INSERT INTO customers (shop_id, name) VALUES (?, ?)').run(req.shopId, customer_name.trim())
              .lastInsertRowid
          );
    }
    if (!cid) return reply.code(400).send({ error: 'customer_required' });
    const info = db
      .prepare('INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source) VALUES (?, ?, ?, ?, ?, ?)')
      .run(req.shopId, cid, Math.round(amount), note ?? null, due_date ?? null, source ?? 'manual');
    return db.prepare('SELECT * FROM debts WHERE id = ?').get(info.lastInsertRowid);
  }
);

app.post<{ Params: { id: string }; Body: { amount: number } }>(
  '/debts/:id/payments',
  { preHandler: requireAuth },
  async (req, reply) => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
    if (!debt) return reply.code(404).send({ error: 'not_found' });
    const amount = Math.round(req.body.amount);
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    db.prepare('INSERT INTO debt_payments (debt_id, amount) VALUES (?, ?)').run(debt.id, amount);
    const newPaid = debt.paid_amount + amount;
    const status = newPaid >= debt.amount ? 'paid' : debt.status;
    db.prepare('UPDATE debts SET paid_amount = ?, status = ? WHERE id = ?').run(newPaid, status, debt.id);
    return db.prepare('SELECT * FROM debts WHERE id = ?').get(debt.id);
  }
);

// ---------- OVOZLI KIRITISH ----------
// DEV: matn qabul qiladi (STT keyin ulanadi: audio -> Mohir.ai -> matn -> shu parser)
app.post<{ Body: { text: string } }>('/voice/parse', { preHandler: requireAuth }, async (req, reply) => {
  if (!req.body.text?.trim()) return reply.code(400).send({ error: 'text_required' });
  const parsed = parseDebtText(req.body.text);
  if (!parsed) return reply.code(422).send({ error: 'could_not_parse' });
  return parsed;
});

// ---------- POSTAVSHIKLAR ----------
app.get('/suppliers', { preHandler: requireAuth }, async (req) => {
  return db
    .prepare(
      `SELECT s.*, COALESCE(SUM(CASE WHEN d.status != 'paid' THEN d.amount - d.paid_amount END), 0) AS balance
       FROM suppliers s LEFT JOIN supplier_debts d ON d.supplier_id = s.id
       WHERE s.shop_id = ? GROUP BY s.id ORDER BY balance DESC`
    )
    .all(req.shopId);
});

app.post<{ Body: { supplier_id?: number; supplier_name?: string; amount: number; note?: string; due_date?: string } }>(
  '/supplier-debts',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { supplier_id, supplier_name, amount, note, due_date } = req.body;
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    let sid = supplier_id;
    if (!sid && supplier_name) {
      const existing = db
        .prepare('SELECT id FROM suppliers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
        .get(req.shopId, supplier_name.trim()) as any;
      sid = existing
        ? existing.id
        : Number(
            db.prepare('INSERT INTO suppliers (shop_id, name) VALUES (?, ?)').run(req.shopId, supplier_name.trim())
              .lastInsertRowid
          );
    }
    if (!sid) return reply.code(400).send({ error: 'supplier_required' });
    const info = db
      .prepare('INSERT INTO supplier_debts (shop_id, supplier_id, amount, note, due_date) VALUES (?, ?, ?, ?, ?)')
      .run(req.shopId, sid, Math.round(amount), note ?? null, due_date ?? null);
    return db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(info.lastInsertRowid);
  }
);

// ---------- OMBOR ----------
app.get<{ Querystring: { q?: string; barcode?: string } }>('/products', { preHandler: requireAuth }, async (req) => {
  const { q, barcode } = req.query;
  if (barcode) {
    const product = db
      .prepare('SELECT * FROM products WHERE shop_id = ? AND barcode = ?')
      .get(req.shopId, barcode);
    if (product) return [product];
    // markaziy katalogdan nom taklif qilamiz
    const catalog = db.prepare('SELECT * FROM barcode_catalog WHERE barcode = ?').get(barcode) as any;
    return catalog ? [{ id: null, barcode, name: catalog.name, unit: catalog.unit, from_catalog: true }] : [];
  }
  if (q) {
    return db
      .prepare(`SELECT * FROM products WHERE shop_id = ? AND name LIKE ? ORDER BY name LIMIT 50`)
      .all(req.shopId, `%${q}%`);
  }
  return db.prepare('SELECT * FROM products WHERE shop_id = ? ORDER BY name').all(req.shopId);
});

app.post<{ Body: { barcode?: string; name: string; unit?: string; cost_price?: number; sell_price?: number; qty?: number; expiry_date?: string } }>(
  '/products/intake',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { barcode, name, unit, cost_price, sell_price, qty, expiry_date } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });
    let product = barcode
      ? (db.prepare('SELECT * FROM products WHERE shop_id = ? AND barcode = ?').get(req.shopId, barcode) as any)
      : (db.prepare('SELECT * FROM products WHERE shop_id = ? AND name = ? COLLATE NOCASE AND barcode IS NULL').get(req.shopId, name.trim()) as any);
    if (!product) {
      const info = db
        .prepare(
          'INSERT INTO products (shop_id, barcode, name, unit, cost_price, sell_price, stock, expiry_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
        )
        .run(req.shopId, barcode ?? null, name.trim(), unit ?? 'dona', cost_price ?? 0, sell_price ?? 0, expiry_date ?? null);
      product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
      // markaziy katalogni boyitamiz
      if (barcode && !db.prepare('SELECT 1 FROM barcode_catalog WHERE barcode = ?').get(barcode)) {
        db.prepare('INSERT INTO barcode_catalog (barcode, name, unit, created_by_shop) VALUES (?, ?, ?, ?)').run(
          barcode,
          name.trim(),
          unit ?? 'dona',
          req.shopId
        );
      }
    }
    const addQty = qty ?? 0;
    if (addQty > 0) {
      db.prepare('UPDATE products SET stock = stock + ?, cost_price = ?, sell_price = ?, expiry_date = COALESCE(?, expiry_date) WHERE id = ?').run(
        addQty,
        cost_price ?? product.cost_price,
        sell_price ?? product.sell_price,
        expiry_date ?? null,
        product.id
      );
      db.prepare('INSERT INTO stock_movements (shop_id, product_id, type, qty, expiry_date) VALUES (?, ?, ?, ?, ?)').run(
        req.shopId,
        product.id,
        'in',
        addQty,
        expiry_date ?? null
      );
    }
    return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  }
);

// ---------- KASSA ----------
app.post<{ Body: { items: { product_id: number; qty: number }[]; payment_type: 'cash' | 'card' | 'debt'; customer_id?: number; customer_name?: string; due_date?: string } }>(
  '/sales',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { items, payment_type, customer_id, customer_name, due_date } = req.body;
    if (!items?.length) return reply.code(400).send({ error: 'items_required' });

    const tx = db.transaction(() => {
      let total = 0;
      const lines: { product: any; qty: number }[] = [];
      for (const item of items) {
        const product = db
          .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
          .get(item.product_id, req.shopId) as any;
        if (!product) throw new Error('product_not_found');
        total += product.sell_price * item.qty;
        lines.push({ product, qty: item.qty });
      }
      const saleInfo = db
        .prepare('INSERT INTO sales (shop_id, total, payment_type, customer_id) VALUES (?, ?, ?, ?)')
        .run(req.shopId, Math.round(total), payment_type, customer_id ?? null);
      const saleId = Number(saleInfo.lastInsertRowid);
      for (const { product, qty } of lines) {
        db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)').run(
          saleId,
          product.id,
          qty,
          product.sell_price
        );
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, product.id);
        db.prepare('INSERT INTO stock_movements (shop_id, product_id, type, qty) VALUES (?, ?, ?, ?)').run(
          req.shopId,
          product.id,
          'sale',
          -qty
        );
      }
      // "Qarzga sotish" — savdo avtomatik qarz daftariga tushadi
      if (payment_type === 'debt') {
        let cid = customer_id;
        if (!cid && customer_name) {
          const existing = db
            .prepare('SELECT id FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
            .get(req.shopId, customer_name.trim()) as any;
          cid = existing
            ? existing.id
            : Number(
                db.prepare('INSERT INTO customers (shop_id, name) VALUES (?, ?)').run(req.shopId, customer_name.trim())
                  .lastInsertRowid
              );
        }
        if (!cid) throw new Error('customer_required_for_debt');
        const noteText = lines.map((l) => `${l.product.name} x${l.qty}`).join(', ');
        db.prepare(
          'INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source, sale_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(req.shopId, cid, Math.round(total), noteText, due_date ?? null, 'pos', saleId);
        db.prepare('UPDATE sales SET customer_id = ? WHERE id = ?').run(cid, saleId);
      }
      return saleId;
    });

    try {
      const saleId = tx();
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
      const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);
      return { ...(sale as any), items: saleItems };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  }
);

// ---------- HISOBOTLAR ----------
app.get<{ Querystring: { period?: string } }>('/reports/summary', { preHandler: requireAuth }, async (req) => {
  const period = req.query.period === 'week' ? '-7 days' : req.query.period === 'month' ? '-30 days' : '-1 day';
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_type = 'card' THEN total END), 0) AS card,
              COALESCE(SUM(CASE WHEN payment_type = 'debt' THEN total END), 0) AS debt
       FROM sales WHERE shop_id = ? AND created_at >= datetime('now', ?)`
    )
    .get(req.shopId, period) as any;
  const profit = db
    .prepare(
      `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= datetime('now', ?)`
    )
    .get(req.shopId, period) as any;
  const topProducts = db
    .prepare(
      `SELECT p.name, SUM(si.qty) AS sold, SUM(si.price * si.qty) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= datetime('now', ?)
       GROUP BY p.id ORDER BY sold DESC LIMIT 10`
    )
    .all(req.shopId, period);
  return { ...sales, profit: profit.profit, top_products: topProducts };
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  markOverdueDebts();
  console.log(`ARABIC.ONE backend :${port}`);
});
