import 'dotenv/config';
import Fastify from 'fastify';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, markOverdueDebts } from './db.js';
import { signToken, requireAuth, requireOwner } from './auth.js';
import { parseDebtText } from './voice.js';
import { runReminders, startReminderScheduler } from './reminders.js';
import { handleUpdate, verifyInitData, telegramEnabled, setWebhook } from './telegram.js';
import { registerAdminRoutes, seedAdmin } from './admin.js';
import { normalizeBarcode, barcodeVariants, checkGtin } from './barcodes.js';
import { normalizePhone } from './phone.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

const app = Fastify({ logger: true, bodyLimit: 10 * 1024 * 1024 });

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

app.post<{ Body: { phone: string; code: string; shop_name?: string; ref?: string; init_data?: string } }>(
  '/auth/verify',
  async (req, reply) => {
  const { phone, code, shop_name, ref, init_data } = req.body;
  if (otpStore.get(phone) !== code) return reply.code(400).send({ error: 'invalid_code' });
  otpStore.delete(phone);
  let shop = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
  if (!shop) {
    const info = db
      .prepare('INSERT INTO shops (phone, name, referred_by) VALUES (?, ?, ?)')
      .run(phone, shop_name ?? 'Mening do‘konim', ref ?? null);
    shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(info.lastInsertRowid);
  }
  // Telegram ichidan kirilgan bo'lsa — hisobni bog'lab qo'yamiz
  if (init_data) {
    const tgUser = verifyInitData(init_data);
    if (tgUser) {
      db.prepare('UPDATE shops SET telegram_user_id = ? WHERE id = ?').run(tgUser.id, shop.id);
      shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    }
  }
  if (shop.is_blocked) return reply.code(403).send({ error: 'blocked', reason: shop.blocked_reason });
  return { token: signToken(shop.id), shop };
  }
);

// Xodim (sotuvchi) kirishi: do'kon telefoni + o'zining 4 xonali PIN-kodi.
// Egasi bu PIN-kodni "Profil → Xodimlar" bo'limida yaratadi.
app.post<{ Body: { phone: string; pin: string } }>('/auth/employee', async (req, reply) => {
  const phone = (req.body?.phone ?? '').trim();
  const pin = (req.body?.pin ?? '').trim();
  if (!phone || !/^\d{4}$/.test(pin)) return reply.code(400).send({ error: 'phone_and_pin_required' });

  const shop = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
  if (!shop) return reply.code(404).send({ error: 'shop_not_found' });
  if (shop.is_blocked) return reply.code(403).send({ error: 'blocked', reason: shop.blocked_reason });

  const emp = db
    .prepare("SELECT * FROM employees WHERE shop_id = ? AND pin = ? AND is_active = 1 AND role = 'seller'")
    .get(shop.id, pin) as any;
  if (!emp) return reply.code(401).send({ error: 'invalid_pin' });

  return {
    token: signToken(shop.id, emp.id),
    shop,
    employee: { id: emp.id, name: emp.name, role: emp.role },
  };
});

// ---------- ADMIN PANEL ----------
registerAdminRoutes(app);

// ---------- TELEGRAM ----------
// Mini App Telegram ichida ochilganda initData orqali kirish
app.post<{ Body: { init_data: string } }>('/auth/telegram', async (req, reply) => {
  const user = verifyInitData(req.body?.init_data ?? '');
  if (!user) return reply.code(401).send({ error: 'invalid_init_data' });
  const shop = db.prepare('SELECT * FROM shops WHERE telegram_user_id = ?').get(user.id) as any;
  if (!shop) {
    // Telegram hisobi hali do'konga bog'lanmagan — telefon orqali kirish kerak
    return reply.code(404).send({ error: 'not_linked', telegram_user_id: user.id, first_name: user.first_name });
  }
  return { token: signToken(shop.id), shop };
});

// Telegram webhook — bot xabarlari shu yerga keladi
app.post('/telegram/webhook', async (req, reply) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (process.env.TELEGRAM_WEBHOOK_SECRET && secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return reply.code(401).send({ error: 'bad_secret' });
  }
  // Telegram javobni kutmasligi uchun darhol 200 qaytaramiz
  reply.send({ ok: true });
  handleUpdate(req.body).catch((e) => app.log.error(e));
});

// ---------- PROFIL ----------
app.get('/me', { preHandler: requireAuth }, async (req) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) as any;
  // Xodim sessiyasida ilova cheklangan ko'rinishga o'tadi
  const employee = req.employeeId
    ? db.prepare('SELECT id, name, role FROM employees WHERE id = ?').get(req.employeeId)
    : null;
  return { ...shop, employee };
});

app.patch<{ Body: Record<string, unknown> }>('/me', { preHandler: requireOwner }, async (req) => {
  const allowed = ['name', 'owner_name', 'address', 'language', 'card_number'];
  for (const key of allowed) {
    if (key in req.body) {
      db.prepare(`UPDATE shops SET ${key} = ? WHERE id = ?`).run(req.body[key], req.shopId);
    }
  }
  return db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId);
});

// ---------- BALANS VA OBUNA ----------
function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? fallback;
}

// Tarif narxlari admin panelning sozlamalaridan olinadi — kodda qotib qolmagan.
function getPlans(): Record<string, { price: number; title: string }> {
  return {
    premium: { price: Number(getSetting('price_premium', '99000')), title: 'Premium' },
    business: { price: Number(getSetting('price_business', '199000')), title: 'Biznes' },
  };
}

app.get('/balance', { preHandler: requireOwner }, async (req) => {
  const shop = db.prepare('SELECT balance, plan, plan_expires_at FROM shops WHERE id = ?').get(req.shopId) as any;
  const transactions = db
    .prepare('SELECT * FROM balance_transactions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.shopId);
  return { ...shop, transactions, plans: getPlans(), min_topup: Number(getSetting('min_topup_amount', '10000')) };
});

// DEV: to'ldirish darhol o'tadi. PROD: Payme/Click/Uzum to'lov oqimi orqali.
app.post<{ Body: { amount: number } }>('/balance/topup', { preHandler: requireOwner }, async (req, reply) => {
  const amount = Math.round(req.body.amount);
  if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
  const minTopup = Number(getSetting('min_topup_amount', '10000'));
  if (amount < minTopup) return reply.code(400).send({ error: 'below_minimum', min: minTopup });
  db.prepare('UPDATE shops SET balance = balance + ? WHERE id = ?').run(amount, req.shopId);
  db.prepare("INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'topup', ?, ?)").run(
    req.shopId,
    amount,
    "Balans to'ldirildi"
  );
  return db.prepare('SELECT balance FROM shops WHERE id = ?').get(req.shopId);
});

// Obunani balansdan yechib faollashtirish (1 oy)
app.post<{ Body: { plan: 'premium' | 'business' } }>('/balance/subscribe', { preHandler: requireOwner }, async (req, reply) => {
  const plan = getPlans()[req.body.plan];
  if (!plan) return reply.code(400).send({ error: 'invalid_plan' });
  const shop = db.prepare('SELECT balance FROM shops WHERE id = ?').get(req.shopId) as any;
  if (shop.balance < plan.price) return reply.code(400).send({ error: 'insufficient_balance' });
  db.prepare(
    "UPDATE shops SET balance = balance - ?, plan = ?, plan_expires_at = date('now', '+30 days') WHERE id = ?"
  ).run(plan.price, req.body.plan, req.shopId);
  db.prepare("INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'subscription', ?, ?)").run(
    req.shopId,
    -plan.price,
    `${plan.title} obuna — 30 kun`
  );
  return db.prepare('SELECT balance, plan, plan_expires_at FROM shops WHERE id = ?').get(req.shopId);
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
  // Oxirgi sotuvlar — mahsulot nomlari bilan
  const recentSales = db
    .prepare(
      `SELECT s.id, s.total, s.payment_type, s.created_at, c.name AS customer_name,
              (SELECT GROUP_CONCAT(p.name || ' ×' || CAST(si.qty AS INTEGER), ', ')
               FROM sale_items si JOIN products p ON p.id = si.product_id
               WHERE si.sale_id = s.id) AS items
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = ? ORDER BY s.created_at DESC, s.id DESC LIMIT 5`
    )
    .all(req.shopId);
  // Men qarzdorman — postavshiklarga to'lanmagan qarzlar (muddati yaqinlari birinchi)
  const supplierDue = db
    .prepare(
      `SELECT sd.id, sd.amount, sd.paid_amount, sd.due_date, sd.status, sd.note,
              sup.name AS supplier_name
       FROM supplier_debts sd JOIN suppliers sup ON sup.id = sd.supplier_id
       WHERE sd.shop_id = ? AND sd.status != 'paid'
       ORDER BY (sd.due_date IS NULL), sd.due_date ASC LIMIT 5`
    )
    .all(req.shopId);
  // Bugungi ko'rsatkichlar
  const todayStats = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_type = 'card' THEN total END), 0) AS card,
              COALESCE(SUM(CASE WHEN payment_type = 'debt' THEN total END), 0) AS debt
       FROM sales WHERE shop_id = ? AND date(created_at) = date('now')`
    )
    .get(req.shopId) as any;
  const todayProfit = db
    .prepare(
      `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND date(s.created_at) = date('now')`
    )
    .get(req.shopId) as any;
  // Oxirgi 7 kunlik savdo (grafik uchun) — bo'sh kunlar 0 bilan to'ldiriladi
  const raw = db
    .prepare(
      `SELECT date(created_at) AS d, COALESCE(SUM(total), 0) AS revenue
       FROM sales WHERE shop_id = ? AND date(created_at) >= date('now', '-6 days')
       GROUP BY date(created_at)`
    )
    .all(req.shopId) as any[];
  const byDay = new Map(raw.map((r) => [r.d, r.revenue]));
  const week: { day: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    week.push({ day: key, revenue: byDay.get(key) ?? 0 });
  }
  return {
    owed_to_me: owedToMe.s,
    i_owe: iOwe.s,
    net: owedToMe.s - iOwe.s,
    today: { ...todayStats, profit: todayProfit.profit },
    week,
    due_today: dueToday,
    overdue,
    low_stock: lowStock,
    expiring_soon: expiringSoon,
    recent_sales: recentSales,
    supplier_due: supplierDue,
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
    const { name, language, note } = req.body;
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });
    // Telefonsiz mijoz bo'lmaydi: eslatma ham, qo'ng'iroq ham shu raqamga boradi
    const phone = normalizePhone(req.body.phone);
    if (!phone) return reply.code(400).send({ error: 'phone_required' });
    const dup = db
      .prepare('SELECT id, name FROM customers WHERE shop_id = ? AND phone = ?')
      .get(req.shopId, phone) as any;
    if (dup) return reply.code(409).send({ error: 'phone_taken', customer: dup });
    const shop = db.prepare('SELECT default_reminder_mode FROM shops WHERE id = ?').get(req.shopId) as any;
    const info = db
      .prepare(
        'INSERT INTO customers (shop_id, name, phone, language, note, reminder_mode) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.shopId, name.trim(), phone, language ?? 'uz', note ?? null, shop.default_reminder_mode);
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
    .all(req.params.id) as any[];
  const balance = debts
    .filter((d) => d.status !== 'paid')
    .reduce((s, d) => s + (d.amount - d.paid_amount), 0);
  return { ...customer, debts, balance };
});

app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
  '/customers/:id',
  { preHandler: requireAuth },
  async (req, reply) => {
    const customer = db
      .prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId);
    if (!customer) return reply.code(404).send({ error: 'not_found' });
    if ('phone' in req.body) {
      const phone = normalizePhone(req.body.phone as string);
      if (!phone) return reply.code(400).send({ error: 'phone_required' });
      const dup = db
        .prepare('SELECT id, name FROM customers WHERE shop_id = ? AND phone = ? AND id != ?')
        .get(req.shopId, phone, req.params.id) as any;
      if (dup) return reply.code(409).send({ error: 'phone_taken', customer: dup });
      db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, req.params.id);
    }
    for (const key of ['name', 'language', 'reminder_mode', 'note']) {
      if (key in req.body) {
        db.prepare(`UPDATE customers SET ${key} = ? WHERE id = ?`).run(req.body[key], req.params.id);
      }
    }
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  }
);

// Mijozni o'chirish — faqat ochiq qarzi bo'lmasa
app.delete<{ Params: { id: string } }>('/customers/:id', { preHandler: requireOwner }, async (req, reply) => {
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!customer) return reply.code(404).send({ error: 'not_found' });
  const open = db
    .prepare("SELECT COUNT(*) AS c FROM debts WHERE customer_id = ? AND status != 'paid'")
    .get(req.params.id) as any;
  if (open.c > 0) return reply.code(400).send({ error: 'has_open_debts' });
  db.prepare('DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE customer_id = ?)').run(req.params.id);
  db.prepare('DELETE FROM debts WHERE customer_id = ?').run(req.params.id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// ---------- ESLATMALAR ----------
app.get<{ Querystring: { limit?: string } }>('/reminders', { preHandler: requireAuth }, async (req) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 300);
  const logs = db
    .prepare(
      `SELECT r.*, c.name AS customer_name, c.phone AS customer_phone,
              d.amount, d.paid_amount, d.due_date
       FROM reminder_logs r
       LEFT JOIN customers c ON c.id = r.customer_id
       LEFT JOIN debts d ON d.id = r.debt_id
       WHERE r.shop_id = ? ORDER BY r.created_at DESC, r.id DESC LIMIT ?`
    )
    .all(req.shopId, limit);
  const shop = db.prepare('SELECT default_reminder_mode FROM shops WHERE id = ?').get(req.shopId) as any;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN channel = 'call' THEN 1 ELSE 0 END) AS calls
       FROM reminder_logs WHERE shop_id = ?`
    )
    .get(req.shopId) as any;
  return { logs, default_mode: shop.default_reminder_mode, stats };
});

// Eslatmalarni hozir hisoblab chiqish (dev/qo'lda tekshirish uchun)
app.post('/reminders/run', { preHandler: requireAuth }, async (req) => {
  return runReminders(req.shopId);
});

// Do'kon bo'yicha standart rejim — yangi mijozlarga qo'llanadi
app.patch<{ Body: { default_reminder_mode: string; apply_to_all?: boolean } }>(
  '/reminders/settings',
  { preHandler: requireOwner },
  async (req, reply) => {
    const mode = req.body.default_reminder_mode;
    if (!['off', 'soft', 'medium', 'call'].includes(mode)) {
      return reply.code(400).send({ error: 'invalid_mode' });
    }
    db.prepare('UPDATE shops SET default_reminder_mode = ? WHERE id = ?').run(mode, req.shopId);
    if (req.body.apply_to_all) {
      db.prepare('UPDATE customers SET reminder_mode = ? WHERE shop_id = ?').run(mode, req.shopId);
    }
    return { default_reminder_mode: mode };
  }
);

// ---------- QARZLAR ----------
app.post<{ Body: { customer_id?: number; customer_name?: string; customer_phone?: string; amount: number; note?: string; due_date?: string; source?: string } }>(
  '/debts',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { customer_id, customer_name, amount, note, due_date, source } = req.body;
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    const phone = normalizePhone(req.body.customer_phone);

    let cid = customer_id;
    if (!cid && customer_name) {
      // Avval raqam bo'yicha (ism takrorlanishi mumkin), so'ng ism bo'yicha
      const existing = (phone
        ? db.prepare('SELECT * FROM customers WHERE shop_id = ? AND phone = ?').get(req.shopId, phone)
        : null) ??
        db
          .prepare('SELECT * FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
          .get(req.shopId, customer_name.trim()) as any;
      if (existing) {
        cid = (existing as any).id;
      } else {
        // Yangi qarzdor — telefonsiz bo'lmaydi: eslatma va qo'ng'iroq shu raqamga boradi
        if (!phone) return reply.code(400).send({ error: 'customer_phone_required' });
        const shop = db.prepare('SELECT default_reminder_mode FROM shops WHERE id = ?').get(req.shopId) as any;
        cid = Number(
          db
            .prepare('INSERT INTO customers (shop_id, name, phone, reminder_mode) VALUES (?, ?, ?, ?)')
            .run(req.shopId, customer_name.trim(), phone, shop.default_reminder_mode).lastInsertRowid
        );
      }
    }
    if (!cid) return reply.code(400).send({ error: 'customer_required' });

    // Mavjud mijozning raqami yo'q bo'lsa — shu yerda to'ldiriladi yoki so'raladi
    const customer = db.prepare('SELECT id, name, phone FROM customers WHERE id = ? AND shop_id = ?').get(cid, req.shopId) as any;
    if (!customer) return reply.code(404).send({ error: 'customer_not_found' });
    if (!customer.phone) {
      if (!phone) {
        return reply.code(400).send({
          error: 'customer_phone_required',
          customer: { id: customer.id, name: customer.name },
        });
      }
      db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone, customer.id);
    }
    const info = db
      .prepare(
        'INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(req.shopId, cid, Math.round(amount), note ?? null, due_date ?? null, source ?? 'manual', req.employeeId);
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

app.get<{ Params: { id: string } }>('/suppliers/:id', { preHandler: requireAuth }, async (req, reply) => {
  const supplier = db
    .prepare('SELECT * FROM suppliers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!supplier) return reply.code(404).send({ error: 'not_found' });
  const debts = db
    .prepare('SELECT * FROM supplier_debts WHERE supplier_id = ? ORDER BY created_at DESC')
    .all(req.params.id);
  return { ...supplier, debts };
});

app.post<{ Params: { id: string }; Body: { amount: number } }>(
  '/supplier-debts/:id/payments',
  { preHandler: requireAuth },
  async (req, reply) => {
    const debt = db
      .prepare('SELECT * FROM supplier_debts WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!debt) return reply.code(404).send({ error: 'not_found' });
    const amount = Math.round(req.body.amount);
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    const newPaid = debt.paid_amount + amount;
    const status = newPaid >= debt.amount ? 'paid' : debt.status;
    db.prepare('UPDATE supplier_debts SET paid_amount = ?, status = ? WHERE id = ?').run(newPaid, status, debt.id);
    return db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(debt.id);
  }
);

// ---------- XODIMLAR ----------
app.get('/employees', { preHandler: requireOwner }, async (req) => {
  return db
    .prepare('SELECT id, name, role, pin, is_active, created_at FROM employees WHERE shop_id = ? ORDER BY created_at')
    .all(req.shopId);
});

app.post<{ Body: { name: string; pin: string } }>('/employees', { preHandler: requireOwner }, async (req, reply) => {
  const { name, pin } = req.body;
  if (!name?.trim() || !/^\d{4}$/.test(pin ?? '')) return reply.code(400).send({ error: 'name_and_4digit_pin_required' });
  const info = db
    .prepare("INSERT INTO employees (shop_id, name, pin, role) VALUES (?, ?, ?, 'seller')")
    .run(req.shopId, name.trim(), pin);
  return db.prepare('SELECT id, name, role, is_active FROM employees WHERE id = ?').get(info.lastInsertRowid);
});

app.patch<{ Params: { id: string }; Body: { is_active?: number } }>(
  '/employees/:id',
  { preHandler: requireOwner },
  async (req, reply) => {
    const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
    if (!emp) return reply.code(404).send({ error: 'not_found' });
    if (req.body.is_active !== undefined) {
      db.prepare('UPDATE employees SET is_active = ? WHERE id = ?').run(req.body.is_active ? 1 : 0, req.params.id);
    }
    return db.prepare('SELECT id, name, role, is_active FROM employees WHERE id = ?').get(req.params.id);
  }
);

// ---------- REFERAL ----------
app.get('/referral', { preHandler: requireOwner }, async (req) => {
  const code = `ARABIC${req.shopId}`;
  const invited = db.prepare("SELECT COUNT(*) AS c FROM shops WHERE referred_by = ?").get(code) as any;
  return {
    code,
    invited_count: invited.c,
    reward_text: "Har ulangan do'kon uchun ikkalangizga 1 oy bepul obuna",
  };
});

// ---------- OMBOR ----------

// Shtrix-kod bo'yicha qidirish: kodning barcha teng ko'rinishlari bo'yicha,
// ham products.barcode, ham qo'shimcha kodlar jadvalidan.
function findByBarcode(shopId: number, raw: string): any | undefined {
  const variants = barcodeVariants(raw);
  if (variants.length === 0) return undefined;
  const marks = variants.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT p.* FROM products p
       WHERE p.shop_id = ? AND (
         REPLACE(REPLACE(UPPER(TRIM(p.barcode)), ' ', ''), '-', '') IN (${marks})
         OR p.id IN (SELECT product_id FROM product_barcodes WHERE shop_id = ? AND barcode IN (${marks}))
       )
       LIMIT 1`
    )
    .get(shopId, ...variants, shopId, ...variants);
}

// Kodni mahsulotga biriktirish (takrorlanmaydi)
function attachBarcode(shopId: number, productId: number, raw: string) {
  const code = normalizeBarcode(raw);
  if (!code) return;
  db.prepare('INSERT OR IGNORE INTO product_barcodes (shop_id, product_id, barcode) VALUES (?, ?, ?)').run(
    shopId,
    productId,
    code
  );
}

app.get<{ Querystring: { q?: string; barcode?: string } }>('/products', { preHandler: requireAuth }, async (req) => {
  const { q, barcode } = req.query;
  if (barcode) {
    const product = findByBarcode(req.shopId, barcode);
    if (product) return [product];
    // markaziy katalogdan nom taklif qilamiz (kodning har qanday ko'rinishi bo'yicha)
    const variants = barcodeVariants(barcode);
    const marks = variants.map(() => '?').join(',');
    const catalog = variants.length
      ? (db.prepare(`SELECT * FROM barcode_catalog WHERE barcode IN (${marks}) LIMIT 1`).get(...variants) as any)
      : null;
    return catalog
      ? [{ id: null, barcode: normalizeBarcode(barcode), name: catalog.name, unit: catalog.unit, from_catalog: true }]
      : [];
  }
  if (q) {
    return db
      .prepare(`SELECT * FROM products WHERE shop_id = ? AND name LIKE ? ORDER BY name LIMIT 50`)
      .all(req.shopId, `%${q}%`);
  }
  return db.prepare('SELECT * FROM products WHERE shop_id = ? ORDER BY name').all(req.shopId);
});

// Kod bo'yicha to'liq javob: tovar topildimi, katalogda bormi, kod o'zi to'g'rimi.
// Kassa shu javobga qarab nima qilishni biladi.
app.get<{ Querystring: { code?: string } }>('/barcodes/lookup', { preHandler: requireAuth }, async (req) => {
  const code = normalizeBarcode(req.query.code);
  if (!code) return { code: '', valid: null, product: null, catalog: null };
  const product = findByBarcode(req.shopId, code) ?? null;
  const variants = barcodeVariants(code);
  const marks = variants.map(() => '?').join(',');
  const catalog = product
    ? null
    : (db.prepare(`SELECT barcode, name, unit FROM barcode_catalog WHERE barcode IN (${marks}) LIMIT 1`).get(...variants) ?? null);
  return { code, valid: checkGtin(code), product, catalog };
});

app.post<{ Body: { barcode?: string; name: string; unit?: string; cost_price?: number; sell_price?: number; qty?: number; expiry_date?: string; image?: string } }>(
  '/products/intake',
  { preHandler: requireOwner },
  async (req, reply) => {
    const { name, unit, cost_price, sell_price, qty, expiry_date, image } = req.body;
    const barcode = normalizeBarcode(req.body.barcode);
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });

    // 1) kod bo'yicha, 2) nom bo'yicha qidiramiz — shunda bir tovar
    // ikki marta yaratilib, qoldig'i ikkiga bo'linib ketmaydi
    let product = (barcode ? findByBarcode(req.shopId, barcode) : undefined) as any;
    if (!product) {
      product = db
        .prepare('SELECT * FROM products WHERE shop_id = ? AND name = ? COLLATE NOCASE')
        .get(req.shopId, name.trim()) as any;
    }

    if (!product) {
      const info = db
        .prepare(
          'INSERT INTO products (shop_id, barcode, name, unit, cost_price, sell_price, stock, expiry_date) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
        )
        .run(req.shopId, barcode || null, name.trim(), unit ?? 'dona', cost_price ?? 0, sell_price ?? 0, expiry_date ?? null);
      product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    } else if (barcode && !product.barcode) {
      // ilgari kodsiz yozilgan tovarga endi kod berildi
      db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(barcode, product.id);
      product.barcode = barcode;
    }

    if (barcode) {
      attachBarcode(req.shopId, product.id, barcode);
      // markaziy katalogni boyitamiz
      if (!db.prepare('SELECT 1 FROM barcode_catalog WHERE barcode = ?').get(barcode)) {
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
    if (image) {
      const url = saveImage(image, product.id);
      if (url) db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(url, product.id);
    }
    return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  }
);

// Mahsulot rasmi: base64 dataURL qabul qilib, faylga saqlaymiz
function saveImage(dataUrl: string, productId: number): string | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const filename = `product-${productId}.${ext}`;
  writeFileSync(join(UPLOADS_DIR, filename), Buffer.from(match[2], 'base64'));
  return `/uploads/${filename}`;
}

app.post<{ Params: { id: string }; Body: { image: string } }>(
  '/products/:id/image',
  { preHandler: requireAuth },
  async (req, reply) => {
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });
    const url = saveImage(req.body.image, product.id);
    if (!url) return reply.code(400).send({ error: 'invalid_image' });
    db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(url, product.id);
    return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  }
);

// Mahsulotning shtrix-kodlari
app.get<{ Params: { id: string } }>('/products/:id/barcodes', { preHandler: requireAuth }, async (req) => {
  return db
    .prepare('SELECT id, barcode, created_at FROM product_barcodes WHERE shop_id = ? AND product_id = ? ORDER BY id')
    .all(req.shopId, req.params.id);
});

// Skanerda topilmagan kodni mahsulotga biriktirish — kassachi ham qila oladi,
// shunda keyingi safar skaner darhol topadi.
app.post<{ Params: { id: string }; Body: { barcode: string } }>(
  '/products/:id/barcodes',
  { preHandler: requireAuth },
  async (req, reply) => {
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });

    const code = normalizeBarcode(req.body?.barcode);
    if (!code) return reply.code(400).send({ error: 'barcode_required' });

    // kod boshqa tovarga biriktirilgan bo'lsa — aytamiz, jimgina ko'chirmaymiz
    const owner = findByBarcode(req.shopId, code);
    if (owner && owner.id !== product.id) {
      return reply.code(409).send({ error: 'barcode_taken', product: { id: owner.id, name: owner.name } });
    }

    attachBarcode(req.shopId, product.id, code);
    if (!product.barcode) db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(code, product.id);
    if (!db.prepare('SELECT 1 FROM barcode_catalog WHERE barcode = ?').get(code)) {
      db.prepare('INSERT INTO barcode_catalog (barcode, name, unit, created_by_shop) VALUES (?, ?, ?, ?)').run(
        code,
        product.name,
        product.unit,
        req.shopId
      );
    }
    return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  }
);

app.delete<{ Params: { id: string; code: string } }>(
  '/products/:id/barcodes/:code',
  { preHandler: requireOwner },
  async (req, reply) => {
    const code = normalizeBarcode(req.params.code);
    const info = db
      .prepare('DELETE FROM product_barcodes WHERE shop_id = ? AND product_id = ? AND barcode = ?')
      .run(req.shopId, req.params.id, code);
    if (!info.changes) return reply.code(404).send({ error: 'not_found' });
    // asosiy kod o'chirilgan bo'lsa — qolganidan birini asosiy qilamiz
    const rest = db
      .prepare('SELECT barcode FROM product_barcodes WHERE shop_id = ? AND product_id = ? ORDER BY id LIMIT 1')
      .get(req.shopId, req.params.id) as any;
    db.prepare('UPDATE products SET barcode = ? WHERE id = ? AND shop_id = ?').run(
      rest?.barcode ?? null,
      req.params.id,
      req.shopId
    );
    return { ok: true };
  }
);

app.get<{ Params: { file: string } }>('/uploads/:file', async (req, reply) => {
  const safe = req.params.file.replace(/[^a-zA-Z0-9._-]/g, '');
  const path = join(UPLOADS_DIR, safe);
  if (!existsSync(path)) return reply.code(404).send({ error: 'not_found' });
  const ext = safe.split('.').pop();
  reply.header('Content-Type', ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg');
  reply.header('Cache-Control', 'public, max-age=86400');
  return reply.send(readFileSync(path));
});

// Mahsulotni tahrirlash va o'chirish
app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
  '/products/:id',
  { preHandler: requireOwner },
  async (req, reply) => {
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });
    for (const key of ['name', 'barcode', 'unit', 'cost_price', 'sell_price', 'low_stock_threshold', 'expiry_date', 'stock']) {
      if (key in req.body) {
        const value = key === 'barcode' ? normalizeBarcode(req.body[key] as string) || null : (req.body[key] as any);
        db.prepare(`UPDATE products SET ${key} = ? WHERE id = ?`).run(value, product.id);
      }
    }
    // asosiy kod o'zgargan bo'lsa — kodlar ro'yxatiga ham qo'shamiz
    if (typeof req.body.barcode === 'string') attachBarcode(req.shopId, product.id, req.body.barcode);
    if (typeof req.body.image === 'string') {
      const url = saveImage(req.body.image, product.id);
      if (url) db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(url, product.id);
    }
    return db.prepare('SELECT * FROM products WHERE id = ?').get(product.id);
  }
);

app.delete<{ Params: { id: string } }>('/products/:id', { preHandler: requireOwner }, async (req, reply) => {
  const product = db
    .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!product) return reply.code(404).send({ error: 'not_found' });
  const sold = db.prepare('SELECT COUNT(*) AS c FROM sale_items WHERE product_id = ?').get(req.params.id) as any;
  if (sold.c > 0) return reply.code(400).send({ error: 'has_sales' });
  db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// Inventarizatsiya — haqiqiy qoldiqni kiritish, farqni yozib qo'yish
app.post<{ Body: { items: { product_id: number; actual: number }[] } }>(
  '/inventory/count',
  { preHandler: requireAuth },
  async (req, reply) => {
    const items = req.body.items ?? [];
    if (!items.length) return reply.code(400).send({ error: 'items_required' });
    const result: { product_id: number; name: string; before: number; actual: number; diff: number }[] = [];
    const tx = db.transaction(() => {
      for (const item of items) {
        const p = db
          .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
          .get(item.product_id, req.shopId) as any;
        if (!p) continue;
        const diff = item.actual - p.stock;
        if (diff !== 0) {
          db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(item.actual, p.id);
          db.prepare("INSERT INTO stock_movements (shop_id, product_id, type, qty) VALUES (?, ?, 'adjust', ?)").run(
            req.shopId,
            p.id,
            diff
          );
        }
        result.push({ product_id: p.id, name: p.name, before: p.stock, actual: item.actual, diff });
      }
    });
    tx();
    return { items: result, changed: result.filter((r) => r.diff !== 0).length };
  }
);

// ---------- KASSA ----------
app.post<{ Body: { items: { product_id: number; qty: number }[]; payment_type: 'cash' | 'card' | 'debt'; customer_id?: number; customer_name?: string; customer_phone?: string; due_date?: string; allow_negative?: boolean } }>(
  '/sales',
  { preHandler: requireAuth },
  async (req, reply) => {
    const { items, payment_type, customer_id, customer_name, due_date } = req.body;
    if (!items?.length) return reply.code(400).send({ error: 'items_required' });

    // Qoldiqdan ko'p sotishga yo'l qo'yilmaydi: ombor minusga tushib ketmasin.
    // Do'konchi baribir sotmoqchi bo'lsa (qoldiq noto'g'ri kiritilgan bo'lishi mumkin),
    // ilova tasdiqlatib, allow_negative bilan qayta yuboradi.
    const shortage: { product_id: number; name: string; stock: number; qty: number }[] = [];
    for (const item of items) {
      const p = db
        .prepare('SELECT id, name, stock FROM products WHERE id = ? AND shop_id = ?')
        .get(item.product_id, req.shopId) as any;
      if (!p) return reply.code(404).send({ error: 'product_not_found' });
      if (item.qty > p.stock) shortage.push({ product_id: p.id, name: p.name, stock: p.stock, qty: item.qty });
    }
    if (shortage.length > 0 && !req.body.allow_negative) {
      return reply.code(409).send({ error: 'insufficient_stock', items: shortage });
    }

    // Qarzga sotishda qarzdorning telefoni shart — eslatma va qo'ng'iroq shunga boradi
    const debtPhone = normalizePhone(req.body.customer_phone);
    if (payment_type === 'debt') {
      let known: any = customer_id
        ? db.prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?').get(customer_id, req.shopId)
        : null;
      if (!known && debtPhone) {
        known = db.prepare('SELECT * FROM customers WHERE shop_id = ? AND phone = ?').get(req.shopId, debtPhone);
      }
      if (!known && customer_name?.trim()) {
        known = db
          .prepare('SELECT * FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
          .get(req.shopId, customer_name.trim());
      }
      if (!known && !customer_name?.trim()) return reply.code(400).send({ error: 'customer_required_for_debt' });
      if ((!known || !known.phone) && !debtPhone) {
        return reply.code(400).send({
          error: 'customer_phone_required',
          customer: known ? { id: known.id, name: known.name } : null,
        });
      }
    }

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
        .prepare('INSERT INTO sales (shop_id, total, payment_type, customer_id, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(req.shopId, Math.round(total), payment_type, customer_id ?? null, req.employeeId);
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
        if (!cid) {
          const existing = ((debtPhone
            ? db.prepare('SELECT * FROM customers WHERE shop_id = ? AND phone = ?').get(req.shopId, debtPhone)
            : null) ??
            (customer_name
              ? db
                  .prepare('SELECT * FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
                  .get(req.shopId, customer_name.trim())
              : null)) as any;
          if (existing) {
            cid = existing.id;
            if (!existing.phone && debtPhone) {
              db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(debtPhone, existing.id);
            }
          } else {
            const shop = db.prepare('SELECT default_reminder_mode FROM shops WHERE id = ?').get(req.shopId) as any;
            cid = Number(
              db
                .prepare('INSERT INTO customers (shop_id, name, phone, reminder_mode) VALUES (?, ?, ?, ?)')
                .run(req.shopId, customer_name!.trim(), debtPhone, shop.default_reminder_mode).lastInsertRowid
            );
          }
        } else if (debtPhone) {
          db.prepare('UPDATE customers SET phone = COALESCE(NULLIF(phone, ""), ?) WHERE id = ?').run(debtPhone, cid);
        }
        if (!cid) throw new Error('customer_required_for_debt');
        const noteText = lines.map((l) => `${l.product.name} x${l.qty}`).join(', ');
        db.prepare(
          'INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source, sale_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(req.shopId, cid, Math.round(total), noteText, due_date ?? null, 'pos', saleId, req.employeeId);
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

// Sotuvlar tarixi
app.get<{ Querystring: { limit?: string } }>('/sales', { preHandler: requireAuth }, async (req) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  return db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone,
              (SELECT GROUP_CONCAT(p.name || ' ×' || CAST(si.qty AS INTEGER), ', ')
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS items
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = ? ORDER BY s.created_at DESC, s.id DESC LIMIT ?`
    )
    .all(req.shopId, limit);
});

app.get<{ Params: { id: string } }>('/sales/:id', { preHandler: requireAuth }, async (req, reply) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!sale) return reply.code(404).send({ error: 'not_found' });
  const items = db
    .prepare(
      `SELECT si.*, p.name, p.unit FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?`
    )
    .all(sale.id);
  const customer = sale.customer_id
    ? db.prepare('SELECT name, phone FROM customers WHERE id = ?').get(sale.customer_id)
    : null;
  return { ...sale, items, customer };
});

// Chekni mijozga yuborish (jurnalga yoziladi; provayder ulanganda SMS/Telegram ketadi)
app.post<{ Params: { id: string } }>('/sales/:id/receipt', { preHandler: requireAuth }, async (req, reply) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!sale) return reply.code(404).send({ error: 'not_found' });
  if (!sale.customer_id) return reply.code(400).send({ error: 'no_customer' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id) as any;
  if (!customer?.phone) return reply.code(400).send({ error: 'no_phone' });
  const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(req.shopId) as any;
  const items = db
    .prepare(
      `SELECT p.name, si.qty, si.price FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?`
    )
    .all(sale.id) as any[];
  const lines = items.map((i) => `${i.name} ×${i.qty} — ${new Intl.NumberFormat('uz-UZ').format(i.price * i.qty)}`);
  const text = `«${shop.name}» cheki:\n${lines.join('\n')}\nJami: ${new Intl.NumberFormat('uz-UZ').format(sale.total)}`;
  db.prepare(
    `INSERT INTO reminder_logs (shop_id, customer_id, channel, kind, status, payload)
     VALUES (?, ?, 'sms', 'receipt', 'sent', ?)`
  ).run(req.shopId, customer.id, text);
  return { ok: true, text };
});

// ---------- HISOBOTLAR ----------
app.get<{ Querystring: { period?: string } }>('/reports/summary', { preHandler: requireOwner }, async (req) => {
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

// Hisobotni CSV (Excel ochadi) qilib yuklab olish
app.get<{ Querystring: { period?: string } }>('/reports/export', { preHandler: requireOwner }, async (req, reply) => {
  const period = req.query.period === 'week' ? '-7 days' : req.query.period === 'month' ? '-30 days' : '-1 day';
  const rows = db
    .prepare(
      `SELECT s.created_at AS sana, s.total AS summa, s.payment_type AS tolov,
              COALESCE(c.name, '') AS mijoz,
              (SELECT GROUP_CONCAT(p.name || ' x' || CAST(si.qty AS INTEGER), '; ')
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS mahsulotlar
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = ? AND s.created_at >= datetime('now', ?)
       ORDER BY s.created_at DESC`
    )
    .all(req.shopId, period) as any[];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['Sana', 'Mahsulotlar', "To'lov turi", 'Mijoz', 'Summa'].map(esc).join(','),
    ...rows.map((r) => [r.sana, r.mahsulotlar, r.tolov, r.mijoz, r.summa].map(esc).join(',')),
  ].join('\n');
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="hisobot-${req.query.period ?? 'day'}.csv"`);
  return reply.send('\uFEFF' + csv); // BOM — Excel kirillchani to'g'ri ochadi
});

const port = Number(process.env.PORT ?? 3000);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  seedAdmin();
  markOverdueDebts();
  runReminders();
  startReminderScheduler();
  if (telegramEnabled() && process.env.PUBLIC_URL) {
    setWebhook(process.env.PUBLIC_URL).then((r: any) =>
      console.log('[telegram] webhook:', r.ok ? 'ulandi' : r.description ?? r.error)
    );
  }
  console.log(`ARABIC.ONE backend :${port}`);
});
