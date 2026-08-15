import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { hit, reset } from './ratelimit.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from './db.js';
import { uzDayShift } from './tz.js';

// Admin panel: alohida autentifikatsiya (login + parol) va boshqaruv API'si.
// Do'konchi tokeni bilan admin API'ga kirib bo'lmaydi — token turi ajratilgan.

const SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod';
const TTL = 12 * 60 * 60 * 1000; // 12 soat

/* ─────────── Parol va token ─────────── */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

function signAdminToken(adminId: number, role: string): string {
  const exp = Date.now() + TTL;
  const body = `adm.${adminId}.${role}.${exp}`;
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verifyAdminToken(token: string): { id: number; role: string } | null {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== 'adm') return null;
  const [, id, role, exp, sig] = parts;
  const expected = createHmac('sha256', SECRET).update(`adm.${id}.${role}.${exp}`).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return { id: Number(id), role };
}

declare module 'fastify' {
  interface FastifyRequest {
    admin?: { id: number; role: string };
  }
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const admin = token ? verifyAdminToken(token) : null;
  if (!admin) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  const row = db.prepare('SELECT is_active FROM admins WHERE id = ?').get(admin.id) as any;
  if (!row?.is_active) {
    reply.code(403).send({ error: 'blocked' });
    return reply;
  }
  req.admin = admin;
}

async function requireSuper(req: FastifyRequest, reply: FastifyReply) {
  const res = await requireAdmin(req, reply);
  if (res) return res;
  if (req.admin?.role !== 'super') {
    reply.code(403).send({ error: 'super_only' });
    return reply;
  }
}

function log(adminId: number, action: string, target?: string, details?: string) {
  db.prepare('INSERT INTO admin_logs (admin_id, action, target, details) VALUES (?, ?, ?, ?)').run(
    adminId,
    action,
    target ?? null,
    details ?? null
  );
}

/* ─────────── Birinchi admin ─────────── */

export function seedAdmin() {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM admins').get() as any).c;
  if (count > 0) return;
  const username = process.env.ADMIN_USER ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  db.prepare("INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, 'super')").run(
    username,
    hashPassword(password),
    'Super admin'
  );
  console.log(`[admin] birinchi admin yaratildi: ${username}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.warn('[admin] DIQQAT: standart parol "admin123" — .env da ADMIN_PASSWORD ni o‘zgartiring!');
  }
}

/* ─────────── Marshrutlar ─────────── */

export function registerAdminRoutes(app: FastifyInstance) {
  // Kirish
  app.post<{ Body: { username: string; password: string } }>('/admin/login', async (req, reply) => {
    const { username, password } = req.body ?? {};
    // Parolni terib topishga urinishlar cheklanadi
    const gate = hit(`adm:${username ?? ''}`, { max: 6, windowMs: 10 * 60_000, blockMs: 20 * 60_000 });
    if (!gate.ok) return reply.code(429).send({ error: 'too_many_attempts', retry_after: gate.retryAfter });
    const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username) as any;
    if (!admin || !admin.is_active || !checkPassword(password ?? '', admin.password_hash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    reset(`adm:${username}`);
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
    log(admin.id, 'login');
    return {
      token: signAdminToken(admin.id, admin.role),
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
    };
  });

  app.get('/admin/me', { preHandler: requireAdmin }, async (req) => {
    return db
      .prepare('SELECT id, username, name, role, last_login_at FROM admins WHERE id = ?')
      .get(req.admin!.id);
  });

  // Bosh sahifa statistikasi
  app.get('/admin/stats', { preHandler: requireAdmin }, async () => {
    const shops = db.prepare('SELECT COUNT(*) AS c FROM shops').get() as any;
    const active = db
      .prepare("SELECT COUNT(*) AS c FROM shops WHERE plan != 'free' AND plan_expires_at >= date('now', '+5 hours')")
      .get() as any;
    const blocked = db.prepare('SELECT COUNT(*) AS c FROM shops WHERE is_blocked = 1').get() as any;
    const todayNew = db
      .prepare("SELECT COUNT(*) AS c FROM shops WHERE date(created_at, '+5 hours') = date('now', '+5 hours')")
      .get() as any;
    const revenue = db
      .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM balance_transactions WHERE type = 'topup'")
      .get() as any;
    const monthRevenue = db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM balance_transactions WHERE type = 'topup' AND created_at >= datetime('now', '-30 days')"
      )
      .get() as any;
    const mrr = db
      .prepare(
        "SELECT COALESCE(-SUM(amount), 0) AS s FROM balance_transactions WHERE type = 'subscription' AND created_at >= datetime('now', '-30 days')"
      )
      .get() as any;
    const debts = db.prepare("SELECT COUNT(*) AS c FROM debts").get() as any;
    const reminders = db.prepare('SELECT COUNT(*) AS c FROM reminder_logs').get() as any;
    const calls = db.prepare("SELECT COUNT(*) AS c FROM reminder_logs WHERE channel = 'call'").get() as any;

    // Oxirgi 14 kunlik ro'yxatdan o'tishlar
    const raw = db
      .prepare(
        "SELECT date(created_at, '+5 hours') AS d, COUNT(*) AS c FROM shops WHERE date(created_at, '+5 hours') >= date('now', '+5 hours', '-13 days') GROUP BY date(created_at, '+5 hours')"
      )
      .all() as any[];
    const byDay = new Map(raw.map((r) => [r.d, r.c]));
    const signups: { day: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const key = uzDayShift(-i);
      signups.push({ day: key, count: byDay.get(key) ?? 0 });
    }

    return {
      shops: shops.c,
      active_subs: active.c,
      blocked: blocked.c,
      today_new: todayNew.c,
      total_topups: revenue.s,
      month_topups: monthRevenue.s,
      mrr: mrr.s,
      debts: debts.c,
      reminders: reminders.c,
      calls: calls.c,
      signups,
    };
  });

  // Do'konlar ro'yxati
  app.get<{ Querystring: { q?: string; plan?: string; limit?: string; offset?: string } }>(
    '/admin/shops',
    { preHandler: requireAdmin },
    async (req) => {
      const { q, plan } = req.query;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      const where: string[] = [];
      const params: any[] = [];
      if (q) {
        where.push('(s.name LIKE ? OR s.phone LIKE ? OR s.owner_name LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      if (plan && plan !== 'all') {
        where.push('s.plan = ?');
        params.push(plan);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const rows = db
        .prepare(
          `SELECT s.*,
                  (SELECT COUNT(*) FROM customers c WHERE c.shop_id = s.id) AS customers_count,
                  (SELECT COUNT(*) FROM debts d WHERE d.shop_id = s.id) AS debts_count,
                  (SELECT MAX(created_at) FROM debts d WHERE d.shop_id = s.id) AS last_activity
           FROM shops s ${clause} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);
      const total = db.prepare(`SELECT COUNT(*) AS c FROM shops s ${clause}`).get(...params) as any;
      return { rows, total: total.c };
    }
  );

  // Do'kon tafsiloti
  app.get<{ Params: { id: string } }>('/admin/shops/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id);
    if (!shop) return reply.code(404).send({ error: 'not_found' });
    const stats = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM customers WHERE shop_id = ?) AS customers,
           (SELECT COUNT(*) FROM debts WHERE shop_id = ?) AS debts,
           (SELECT COALESCE(SUM(amount - paid_amount), 0) FROM debts WHERE shop_id = ? AND status != 'paid') AS open_debt,
           (SELECT COUNT(*) FROM sales WHERE shop_id = ?) AS sales,
           (SELECT COUNT(*) FROM products WHERE shop_id = ?) AS products,
           (SELECT COUNT(*) FROM employees WHERE shop_id = ?) AS employees,
           (SELECT COUNT(*) FROM reminder_logs WHERE shop_id = ?) AS reminders`
      )
      .get(req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id, req.params.id);
    const transactions = db
      .prepare('SELECT * FROM balance_transactions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 30')
      .all(req.params.id);
    return { ...(shop as any), stats, transactions };
  });

  // Do'konni boshqarish: bloklash, obuna berish, balans qo'shish
  app.patch<{ Params: { id: string }; Body: { is_blocked?: boolean; reason?: string } }>(
    '/admin/shops/:id/block',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      const blocked = req.body.is_blocked ? 1 : 0;
      db.prepare('UPDATE shops SET is_blocked = ?, blocked_reason = ? WHERE id = ?').run(
        blocked,
        req.body.reason ?? null,
        shop.id
      );
      log(req.admin!.id, blocked ? 'block_shop' : 'unblock_shop', `shop:${shop.id}`, req.body.reason);
      return db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    }
  );

  app.post<{ Params: { id: string }; Body: { plan: string; days?: number } }>(
    '/admin/shops/:id/grant',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      const days = Math.max(1, Math.min(Number(req.body.days ?? 30), 365));
      db.prepare(
        `UPDATE shops SET plan = ?, plan_expires_at = date(
           CASE WHEN plan_expires_at > date('now', '+5 hours') THEN plan_expires_at ELSE date('now', '+5 hours') END, '+' || ? || ' days')
         WHERE id = ?`
      ).run(req.body.plan, days, shop.id);
      // Sovg'a — pul harakati emas, shuning uchun alohida tur bilan yoziladi
      db.prepare(
        "INSERT INTO balance_transactions (shop_id, type, amount, note, admin_id) VALUES (?, 'grant', 0, ?, ?)"
      ).run(shop.id, `Admin sovg'asi: ${req.body.plan} — ${days} kun`, req.admin!.id);
      log(req.admin!.id, 'grant_plan', `shop:${shop.id}`, `${req.body.plan} ${days}d`);
      return db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    }
  );

  app.post<{ Params: { id: string }; Body: { amount: number; note?: string } }>(
    '/admin/shops/:id/balance',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      const amount = Math.round(req.body.amount);
      if (!amount) return reply.code(400).send({ error: 'amount_required' });
      db.prepare('UPDATE shops SET balance = balance + ? WHERE id = ?').run(amount, shop.id);
      db.prepare("INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'topup', ?, ?)").run(
        shop.id,
        amount,
        req.body.note ?? 'Admin tomonidan'
      );
      log(req.admin!.id, 'adjust_balance', `shop:${shop.id}`, String(amount));
      return db.prepare('SELECT balance FROM shops WHERE id = ?').get(shop.id);
    }
  );

  // To'lovlar jurnali — filtrlar, sahifalash va umumiy ko'rsatkichlar bilan
  app.get<{
    Querystring: { type?: string; shop_id?: string; from?: string; to?: string; q?: string; limit?: string; offset?: string };
  }>('/admin/payments', { preHandler: requireAdmin }, async (req) => {
    const limit = Math.min(Number(req.query.limit ?? 20), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.type && req.query.type !== 'all') {
      // "kirim" va "chiqim" — summaning ishorasi bo'yicha
      if (req.query.type === 'in') where.push('b.amount > 0');
      else if (req.query.type === 'out') where.push('b.amount < 0');
      else {
        where.push('b.type = ?');
        params.push(req.query.type);
      }
    }
    if (req.query.shop_id) {
      where.push('b.shop_id = ?');
      params.push(Number(req.query.shop_id));
    }
    if (req.query.from) {
      where.push("date(COALESCE(b.paid_at, b.created_at)) >= date(?)");
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push("date(COALESCE(b.paid_at, b.created_at)) <= date(?)");
      params.push(req.query.to);
    }
    if (req.query.q) {
      where.push('(s.name LIKE ? OR s.phone LIKE ? OR b.note LIKE ? OR b.doc_no LIKE ? OR b.payer LIKE ?)');
      const like = `%${req.query.q}%`;
      params.push(like, like, like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const rows = db
      .prepare(
        `SELECT b.*, s.name AS shop_name, s.phone AS shop_phone, a.username AS admin_username
         FROM balance_transactions b
         JOIN shops s ON s.id = b.shop_id
         LEFT JOIN admins a ON a.id = b.admin_id
         ${clause}
         ORDER BY COALESCE(b.paid_at, b.created_at) DESC, b.id DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset);

    const total = (db
      .prepare(`SELECT COUNT(*) AS c FROM balance_transactions b JOIN shops s ON s.id = b.shop_id ${clause}`)
      .get(...params) as any).c;

    // Filtr bo'yicha jamlanma (sahifadagi emas, butun tanlov bo'yicha)
    const agg = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN b.amount > 0 AND b.type != 'refund' THEN b.amount END), 0) AS kirim,
           COALESCE(-SUM(CASE WHEN b.amount < 0 THEN b.amount END), 0) AS chiqim,
           COALESCE(SUM(CASE WHEN b.type = 'refund' THEN ABS(b.amount) END), 0) AS qaytarilgan
         FROM balance_transactions b JOIN shops s ON s.id = b.shop_id ${clause}`
      )
      .get(...params) as any;

    // Qoldiq — barcha do'konlar balansi; Qarz — minusga tushganlari
    const bal = db
      .prepare(
        `SELECT COALESCE(SUM(CASE WHEN balance > 0 THEN balance END), 0) AS qoldiq,
                COALESCE(-SUM(CASE WHEN balance < 0 THEN balance END), 0) AS qarz
         FROM shops`
      )
      .get() as any;

    return { rows, total, summary: { ...agg, ...bal, count: total } };
  });

  // Qo'lda to'lov kiritish (bank o'tkazmasi, naqd va h.k.)
  app.post<{
    Body: {
      shop_id: number;
      direction?: 'in' | 'out';
      amount: number;
      paid_at?: string;
      method?: string;
      doc_no?: string;
      payer?: string;
      note?: string;
      type?: string;
    };
  }>('/admin/payments', { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? ({} as any);
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(b.shop_id) as any;
    if (!shop) return reply.code(404).send({ error: 'shop_not_found' });
    const abs = Math.abs(Math.round(Number(b.amount) || 0));
    if (!abs) return reply.code(400).send({ error: 'amount_required' });
    // Chiqim bo'lsa balansdan yechiladi
    const signed = b.direction === 'out' ? -abs : abs;
    const type = b.type ?? (b.direction === 'out' ? 'withdraw' : 'topup');

    const tx = db.transaction(() => {
      db.prepare('UPDATE shops SET balance = balance + ? WHERE id = ?').run(signed, shop.id);
      const info = db
        .prepare(
          `INSERT INTO balance_transactions (shop_id, type, amount, note, method, doc_no, payer, admin_id, paid_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          shop.id,
          type,
          signed,
          b.note ?? null,
          b.method ?? null,
          b.doc_no ?? null,
          b.payer ?? null,
          req.admin!.id,
          b.paid_at ?? null
        );
      return info.lastInsertRowid;
    });
    const id = tx();
    log(req.admin!.id, 'add_payment', `shop:${shop.id}`, String(signed));
    return db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(id);
  });

  // To'lovni o'chirish (xato kiritilgan bo'lsa) — balans qaytariladi
  app.delete<{ Params: { id: string } }>('/admin/payments/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(req.params.id) as any;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    db.transaction(() => {
      db.prepare('UPDATE shops SET balance = balance - ? WHERE id = ?').run(row.amount, row.shop_id);
      db.prepare('DELETE FROM balance_transactions WHERE id = ?').run(row.id);
    })();
    log(req.admin!.id, 'delete_payment', `tx:${row.id}`, String(row.amount));
    return { ok: true };
  });

  // Do'konlar bo'yicha umumiy ko'rsatkichlar (ro'yxat tepasidagi kartochkalar)
  app.get('/admin/shops/summary', { preHandler: requireAdmin }, async () =>
    db
      .prepare(
        `SELECT
           COUNT(*) AS jami,
           COALESCE(SUM(CASE WHEN is_blocked = 0 THEN 1 END), 0) AS faol,
           COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 END), 0) AS bloklangan,
           COALESCE(SUM(CASE WHEN plan = 'free' THEN 1 END), 0) AS bepul,
           COALESCE(SUM(CASE WHEN plan = 'premium' THEN 1 END), 0) AS premium,
           COALESCE(SUM(CASE WHEN plan = 'business' THEN 1 END), 0) AS biznes
         FROM shops`
      )
      .get()
  );

  // Eslatmalar va qo'ng'iroqlar monitoringi
  app.get<{ Querystring: { channel?: string; limit?: string } }>(
    '/admin/reminders',
    { preHandler: requireAdmin },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 100), 500);
      const channel = req.query.channel && req.query.channel !== 'all' ? req.query.channel : null;
      const rows = db
        .prepare(
          `SELECT r.*, s.name AS shop_name, c.name AS customer_name, c.phone AS customer_phone
           FROM reminder_logs r
           JOIN shops s ON s.id = r.shop_id
           LEFT JOIN customers c ON c.id = r.customer_id
           ${channel ? 'WHERE r.channel = ?' : ''}
           ORDER BY r.created_at DESC, r.id DESC LIMIT ?`
        )
        .all(...(channel ? [channel, limit] : [limit]));
      const stats = db
        .prepare(
          `SELECT channel, COUNT(*) AS c FROM reminder_logs GROUP BY channel`
        )
        .all();
      return { rows, stats };
    }
  );

  // Sozlamalar
  app.get('/admin/settings', { preHandler: requireAdmin }, async () => {
    const rows = db.prepare('SELECT * FROM settings').all() as any[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  app.patch<{ Body: Record<string, string> }>('/admin/settings', { preHandler: requireAdmin }, async (req) => {
    for (const [key, value] of Object.entries(req.body ?? {})) {
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
        key,
        String(value),
        String(value)
      );
      log(req.admin!.id, 'set_setting', key, String(value));
    }
    const rows = db.prepare('SELECT * FROM settings').all() as any[];
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  });

  // Referal statistikasi
  app.get('/admin/referrals', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        `SELECT s.referred_by AS code, COUNT(*) AS invited,
                (SELECT name FROM shops o WHERE 'ARABIC' || o.id = s.referred_by) AS inviter
         FROM shops s WHERE s.referred_by IS NOT NULL
         GROUP BY s.referred_by ORDER BY invited DESC`
      )
      .all();
  });

  // Adminlar (faqat super-admin)
  app.get('/admin/admins', { preHandler: requireSuper }, async () => {
    return db.prepare('SELECT id, username, name, role, is_active, last_login_at, created_at FROM admins').all();
  });

  app.post<{ Body: { username: string; password: string; name?: string; role?: string } }>(
    '/admin/admins',
    { preHandler: requireSuper },
    async (req, reply) => {
      const { username, password, name, role } = req.body ?? {};
      if (!username?.trim() || !password || password.length < 6) {
        return reply.code(400).send({ error: 'username_and_password6_required' });
      }
      try {
        const info = db
          .prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
          .run(username.trim(), hashPassword(password), name ?? null, role === 'super' ? 'super' : 'admin');
        log(req.admin!.id, 'create_admin', username);
        return db
          .prepare('SELECT id, username, name, role, is_active FROM admins WHERE id = ?')
          .get(info.lastInsertRowid);
      } catch {
        return reply.code(400).send({ error: 'username_taken' });
      }
    }
  );

  app.patch<{ Params: { id: string }; Body: { is_active?: boolean; password?: string } }>(
    '/admin/admins/:id',
    { preHandler: requireSuper },
    async (req, reply) => {
      const target = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.params.id) as any;
      if (!target) return reply.code(404).send({ error: 'not_found' });
      if (target.id === req.admin!.id && req.body.is_active === false) {
        return reply.code(400).send({ error: 'cannot_block_self' });
      }
      if (req.body.is_active !== undefined) {
        db.prepare('UPDATE admins SET is_active = ? WHERE id = ?').run(req.body.is_active ? 1 : 0, target.id);
      }
      if (req.body.password && req.body.password.length >= 6) {
        db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(req.body.password), target.id);
      }
      log(req.admin!.id, 'update_admin', `admin:${target.id}`);
      return db.prepare('SELECT id, username, name, role, is_active FROM admins WHERE id = ?').get(target.id);
    }
  );

  // Audit jurnali
  app.get('/admin/logs', { preHandler: requireAdmin }, async () => {
    return db
      .prepare(
        // "shop:2" o'rniga do'kon nomi ko'rinsin
        `SELECT l.*, a.username,
                (SELECT s.name FROM shops s
                  WHERE 'shop:' || s.id = l.target) AS target_name
         FROM admin_logs l LEFT JOIN admins a ON a.id = l.admin_id
         ORDER BY l.created_at DESC, l.id DESC LIMIT 200`
      )
      .all();
  });
}
