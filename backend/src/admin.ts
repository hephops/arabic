import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';
import { hit, reset } from './ratelimit.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from './db.js';
import { rateState } from './ai/ratelimit.js';
import { uzDayShift, uzToday } from './tz.js';
import {
  dailyPrice,
  lowBalanceDays,
  serviceState,
  chargeShop,
  setSetting,
  typeSetting,
  parseTypeKey,
  TYPE_SETTING_KEYS,
  SETTING_DEFAULTS,
  settingDefault,
} from './billing.js';
import { agentByPhone, linkAgent, agentBonus } from './agentcore.js';
import { SHOP_TYPES } from './shopTypes.js';
import { signToken } from './auth.js';

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

/**
 * Panelga kirgan HAR QANDAY foydalanuvchi — targ'ovchi xodim ham.
 *
 * Bu qo'riqchi faqat "kim ekanini" aniqlaydi. Bo'limlarga kirish
 * huquqini requireAdmin/requireSuper hal qiladi.
 */
export async function requireStaff(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const admin = token ? verifyAdminToken(token) : null;
  if (!admin) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  const row = db.prepare('SELECT is_active, role FROM admins WHERE id = ?').get(admin.id) as any;
  if (!row?.is_active) {
    reply.code(403).send({ error: 'blocked' });
    return reply;
  }
  // Rol tokenda ham bor, lekin bazadagisi ustun turadi: rol o'zgartirilsa
  // eski token bilan eski huquq qolib ketmasin
  req.admin = { id: admin.id, role: String(row.role) };
}

/**
 * Boshqaruv bo'limlari: do'konlar, to'lovlar, katalog, sozlamalar.
 *
 * Targ'ovchi xodim (agent) bu yerga KIRMAYDI — u panelga faqat o'z
 * natijasini ko'rish uchun kiradi. Ilgari bunday rol yo'q edi va
 * har bir kirgan odam hamma do'konni ko'rardi.
 */
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  const res = await requireStaff(req, reply);
  if (res) return res;
  if (req.admin?.role === 'agent') {
    reply.code(403).send({ error: 'staff_only' });
    return reply;
  }
}

export async function requireSuper(req: FastifyRequest, reply: FastifyReply) {
  const res = await requireStaff(req, reply);
  if (res) return res;
  if (req.admin?.role !== 'super') {
    reply.code(403).send({ error: 'super_only' });
    return reply;
  }
}

export function log(adminId: number, action: string, target?: string, details?: string) {
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
    // Login KATTA-KICHIK harfga qaramaydi.
    //
    // Targ'ovchi xodim yaratilganda logini kichik harfga o'giriladi
    // ("Aziz" -> "aziz"), lekin kirishda AYNAN yozilgani qidirilardi —
    // ya'ni xodim o'zi bergan login bilan hech qachon kira olmasdi.
    const key = String(username ?? '').trim().toLowerCase();
    // Parolni terib topishga urinishlar cheklanadi
    const gate = hit(`adm:${key}`, { max: 6, windowMs: 10 * 60_000, blockMs: 20 * 60_000 });
    if (!gate.ok) return reply.code(429).send({ error: 'too_many_attempts', retry_after: gate.retryAfter });
    // Bir xil nom faqat harf o'lchami bilan farq qilsa (eski bazada
    // qolgan bo'lishi mumkin) — kimligi noaniq, kiritmaymiz.
    const topilgan = db.prepare('SELECT * FROM admins WHERE username = ? COLLATE NOCASE').all(key) as any[];
    const admin = topilgan.length === 1 ? topilgan[0] : null;
    if (!admin || !admin.is_active || !checkPassword(password ?? '', admin.password_hash)) {
      return reply.code(401).send({ error: 'invalid_credentials' });
    }
    reset(`adm:${key}`);
    db.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").run(admin.id);
    log(admin.id, 'login');
    return {
      token: signAdminToken(admin.id, admin.role),
      admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role },
    };
  });

  app.get('/admin/me', { preHandler: requireStaff }, async (req) => {
    return db
      .prepare('SELECT id, username, name, role, phone, last_login_at FROM admins WHERE id = ?')
      .get(req.admin!.id);
  });

  // Bosh sahifa statistikasi
  app.get('/admin/stats', { preHandler: requireAdmin }, async () => {
    const today = uzToday();
    const shops = db.prepare('SELECT COUNT(*) AS c FROM shops').get() as any;
    // Faol = xizmati bugungi kunga to'langan va bloklanmagan
    const active = db
      .prepare('SELECT COUNT(*) AS c FROM shops WHERE is_blocked = 0 AND charged_through >= ?')
      .get(today) as any;
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
    // Oxirgi 30 kunda kunlik to'lov sifatida yechilgani — haqiqiy tushum
    const earned = db
      .prepare(
        "SELECT COALESCE(-SUM(amount), 0) AS s FROM balance_transactions WHERE type = 'daily' AND created_at >= datetime('now', '-30 days')"
      )
      .get() as any;
    const price = dailyPrice();
    // Do'konlar balansida turgan, hali ishlatilmagan pul — bu bizning
    // oldimizdagi majburiyat, tushum emas
    const held = db.prepare('SELECT COALESCE(SUM(balance), 0) AS s FROM shops WHERE balance > 0').get() as any;
    // Balansi tugayotganlar: pul tashlamasa yaqin kunda to'xtaydi
    const lowDays = lowBalanceDays();
    const lowBalance = db
      .prepare(
        `SELECT COUNT(*) AS c FROM shops
         WHERE is_blocked = 0 AND charged_through >= ?
           AND (CAST(julianday(charged_through) - julianday(?) AS INTEGER)
                + CASE WHEN ? > 0 THEN balance / ? ELSE 0 END) <= ?`
      )
      .get(today, today, price, price, lowDays) as any;
    // To'xtaganlar: xizmati to'lanmagan
    const stopped = db
      .prepare('SELECT COUNT(*) AS c FROM shops WHERE is_blocked = 0 AND (charged_through IS NULL OR charged_through < ?)')
      .get(today) as any;
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

    // AI xarajati — bu BIZNING xarajatimiz, do'konchining emas.
    // Tushumdan qancha ulush olayotganini ko'rib turish kerak: kesh
    // buzilsa yoki savol ko'paysa raqam jimgina o'sib ketadi.
    const ai = db
      .prepare(
        `SELECT COALESCE(SUM(cost_uzs), 0) AS oy, COUNT(DISTINCT shop_id) AS dokonlar, COUNT(*) AS chaqiruvlar,
                COALESCE(SUM(cache_read), 0) AS keshdan, COALESCE(SUM(input_tokens), 0) AS yangi
         FROM ai_usage WHERE created_at >= datetime('now', '-30 days')`
      )
      .get() as any;
    const aiToday = db
      .prepare(
        `SELECT COALESCE(SUM(cost_uzs), 0) AS s FROM ai_usage
         WHERE date(created_at, '+5 hours') = date('now', '+5 hours')`
      )
      .get() as any;

    // Anthropic chegarasining hozirgi holati — "yuz do'kon bir vaqtda
    // ishlatsa yetadimi?" degan savolga taxmin emas, haqiqiy raqam.
    // Sarlavhalardan bepul o'qiladi (ai/ratelimit.ts).
    const rate = rateState();

    return {
      ai_rate: rate,
      ai_cost_month: ai.oy,
      ai_cost_today: aiToday.s,
      ai_shops: ai.dokonlar,
      ai_calls: ai.chaqiruvlar,
      // Keshdan o'qilgan ulush. Pasayib ketsa xarajat ~2 barobar oshadi
      // va buni boshqa hech narsa aytmaydi.
      ai_cache_hit: ai.keshdan + ai.yangi > 0 ? Math.round((ai.keshdan * 100) / (ai.keshdan + ai.yangi)) : 0,
      shops: shops.c,
      active_shops: active.c,
      blocked: blocked.c,
      today_new: todayNew.c,
      total_topups: revenue.s,
      month_topups: monthRevenue.s,
      /** kunlik narx × faol do'kon — bugungi kutilayotgan tushum */
      daily_income: active.c * price,
      daily_price: price,
      month_earned: earned.s,
      held_balance: held.s,
      low_balance: lowBalance.c,
      stopped: stopped.c,
      debts: debts.c,
      reminders: reminders.c,
      calls: calls.c,
      signups,
    };
  });

  // Do'konlar ro'yxati
  app.get<{ Querystring: { q?: string; status?: string; limit?: string; offset?: string } }>(
    '/admin/shops',
    { preHandler: requireAdmin },
    async (req) => {
      const { q, status } = req.query;
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);
      const where: string[] = [];
      const params: any[] = [];
      if (q) {
        where.push('(s.name LIKE ? OR s.phone LIKE ? OR s.owner_name LIKE ?)');
        params.push(`%${q}%`, `%${q}%`, `%${q}%`);
      }
      // Holat: ishlayapti / to'xtagan / bloklangan
      if (status === 'active') {
        where.push('s.is_blocked = 0 AND s.charged_through >= ?');
        params.push(uzToday());
      } else if (status === 'stopped') {
        where.push('s.is_blocked = 0 AND (s.charged_through IS NULL OR s.charged_through < ?)');
        params.push(uzToday());
      } else if (status === 'blocked') {
        where.push('s.is_blocked = 1');
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      // Balansning O'ZI kam narsa aytadi: sinov muddatidagi do'konda u
      // doim 0 turadi. Shuning uchun yoniga PUL AYLANMASI qo'shiladi —
      // jami qancha to'lagani va qancha yechilgani, hamda AI tannarxi.
      // Shunda kim haqiqiy pul to'layotgani va kim ko'p ishlatayotgani
      // ro'yxatning o'zidan ko'rinadi.
      //
      // Manfiy balansli do'kon TEPAGA chiqadi: u qarzda, ya'ni birinchi
      // navbatda ko'rilishi kerak.
      const rows = db
        .prepare(
          `SELECT s.*,
                  (SELECT COUNT(*) FROM customers c WHERE c.shop_id = s.id) AS customers_count,
                  (SELECT COUNT(*) FROM debts d WHERE d.shop_id = s.id) AS debts_count,
                  (SELECT MAX(created_at) FROM debts d WHERE d.shop_id = s.id) AS last_activity,
                  COALESCE((SELECT SUM(amount) FROM balance_transactions b
                            WHERE b.shop_id = s.id AND b.amount > 0), 0) AS paid_total,
                  COALESCE((SELECT -SUM(amount) FROM balance_transactions b
                            WHERE b.shop_id = s.id AND b.amount < 0), 0) AS spent_total,
                  COALESCE((SELECT SUM(cost_uzs) FROM ai_usage u WHERE u.shop_id = s.id), 0) AS ai_cost,
                  (SELECT a.name FROM admins a WHERE a.id = s.agent_id) AS agent_name
           FROM shops s ${clause}
           ORDER BY (s.balance < 0) DESC, s.created_at DESC LIMIT ? OFFSET ?`
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
    return { ...(shop as any), stats, transactions, service: serviceState(shop) };
  });


  /* ═══════════ Do'kon jurnali (loglar) ═══════════
   *
   * Do'konda BO'LIB O'TGAN hamma narsa bir ro'yxatda: savdo, qaytarish,
   * qarz, kirim, xarajat, xodim kirishi, eslatma, AI savoli, admin
   * amallari...
   *
   * Alohida "jurnal" jadvali OCHILMADI va har amalga yozuv qo'shilmadi.
   * Ikki sabab:
   *   1) Butun tarix ALLAQACHON jadvallarda turibdi — yangi jadval
   *      bugundan boshlab yozardi, ya'ni o'tgan oylar ko'rinmasdi.
   *   2) Har yo'lga qo'lda "log yoz" qatorini qo'shish kerak bo'lardi
   *      va bittasi unutilsa, jurnal jimgina to'liqmas bo'lib qolardi.
   *
   * Shuning uchun mavjud jadvallar o'qib, vaqt bo'yicha birlashtiriladi.
   * Har manba alohida so'rov: har biri o'z indeksidan foydalanadi,
   * bitta ulkan UNION esa hammasini skanerlashga majbur qilardi.
   */
  app.get<{ Params: { id: string }; Querystring: { limit?: string; kind?: string } }>(
    '/admin/shops/:id/activity',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shopId = Number(req.params.id);
      const shop = db.prepare('SELECT id FROM shops WHERE id = ?').get(shopId) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      // Har manbadan shuncha oxirgi yozuv olinadi, keyin birlashtirib
      // eng yangisidan kesiladi
      const limit = Math.min(Math.max(Number(req.query.limit) || 200, 20), 500);
      const per = limit;

      // Kim qilgani: xodim ismi yoki "Ega"
      const emp = new Map<number, string>();
      for (const e of db.prepare('SELECT id, name FROM employees WHERE shop_id = ?').all(shopId) as any[]) {
        emp.set(Number(e.id), String(e.name));
      }
      const kim = (id: number | null) => (id ? (emp.get(Number(id)) ?? `Xodim #${id}`) : 'Ega');

      type Row = {
        at: string;
        kind: string;
        title: string;
        detail?: string | null;
        amount?: number | null;
        who?: string | null;
      };
      const rows: Row[] = [];
      const q = (sql: string, ...args: any[]) => db.prepare(sql).all(...args) as any[];

      const pul = (n: any) => Math.round(Number(n) || 0);
      const TOLOV: Record<string, string> = { cash: 'naqd', card: 'karta', debt: 'qarzga' };

      // ── Savdo
      for (const r of q(
        `SELECT s.id, s.total, s.payment_type, s.created_by, s.created_at, c.name AS mijoz,
                (SELECT COUNT(*) FROM sale_items si WHERE si.sale_id = s.id) AS satr
           FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
          WHERE s.shop_id = ? ORDER BY s.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'savdo',
          title: `Savdo #${r.id}`,
          detail: [`${r.satr} xil tovar`, TOLOV[r.payment_type] ?? r.payment_type, r.mijoz].filter(Boolean).join(' · '),
          amount: pul(r.total),
          who: kim(r.created_by),
        });
      }

      // ── Qaytarish
      for (const r of q(
        `SELECT r.id, r.total, r.reason, r.refund_type, r.created_by, r.created_at, c.name AS mijoz
           FROM returns r LEFT JOIN customers c ON c.id = r.customer_id
          WHERE r.shop_id = ? ORDER BY r.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'qaytarish',
          title: `Qaytarish #${r.id}`,
          detail: [TOLOV[r.refund_type] ?? r.refund_type, r.mijoz, r.reason].filter(Boolean).join(' · '),
          amount: -pul(r.total),
          who: kim(r.created_by),
        });
      }

      // ── Qarz yozildi
      for (const r of q(
        `SELECT d.id, d.amount, d.note, d.due_date, d.created_by, d.created_at, c.name AS mijoz
           FROM debts d LEFT JOIN customers c ON c.id = d.customer_id
          WHERE d.shop_id = ? ORDER BY d.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'qarz',
          title: `Qarz yozildi — ${r.mijoz ?? 'mijoz'}`,
          detail: [r.due_date ? `muddat ${r.due_date}` : null, r.note].filter(Boolean).join(' · '),
          amount: pul(r.amount),
          who: kim(r.created_by),
        });
      }

      // ── Qarz to'lovi
      for (const r of q(
        `SELECT p.id, p.amount, p.created_by, p.created_at, c.name AS mijoz
           FROM debt_payments p
           JOIN debts d ON d.id = p.debt_id
           LEFT JOIN customers c ON c.id = d.customer_id
          WHERE d.shop_id = ? ORDER BY p.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'qarz_tolov',
          title: `Qarz to'lovi — ${r.mijoz ?? 'mijoz'}`,
          amount: pul(r.amount),
          who: kim(r.created_by),
        });
      }

      // ── Ombor harakati
      const HARAKAT: Record<string, string> = {
        in: 'Tovar kirimi',
        out: 'Tovar chiqimi',
        return: 'Tovar qaytdi',
        adjust: 'Qoldiq to\'g\'rilandi',
        writeoff: 'Hisobdan chiqarildi',
      };
      for (const r of q(
        `SELECT m.id, m.type, m.qty, m.created_by, m.created_at, p.name AS tovar, p.unit
           FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
          WHERE m.shop_id = ? ORDER BY m.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'ombor',
          title: HARAKAT[r.type] ?? `Ombor: ${r.type}`,
          detail: `${r.tovar ?? "o'chirilgan tovar"} — ${r.qty} ${r.unit ?? ''}`.trim(),
          who: kim(r.created_by),
        });
      }

      // ── Xarajat
      for (const r of q(
        `SELECT id, category, amount, note, spent_at, created_by, created_at
           FROM expenses WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'xarajat',
          title: `Xarajat — ${r.category ?? 'boshqa'}`,
          detail: [r.spent_at, r.note].filter(Boolean).join(' · '),
          amount: -pul(r.amount),
          who: kim(r.created_by),
        });
      }

      // ── Balans (to'ldirish, kunlik yechim, bonus...)
      const BALANS: Record<string, string> = {
        topup: "Balans to'ldirildi",
        daily: 'Kunlik xizmat haqi',
        withdraw: 'Balansdan yechildi',
        refund: 'Balans qaytarildi',
        grant: 'Bepul berildi',
        referral: 'Taklif bonusi',
        ai: 'AI savoli uchun yechildi',
      };
      for (const r of q(
        `SELECT id, type, amount, note, method, payer, created_at
           FROM balance_transactions WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'balans',
          title: BALANS[r.type] ?? `Balans: ${r.type}`,
          detail: [r.method, r.payer, r.note].filter(Boolean).join(' · '),
          amount: pul(r.amount),
        });
      }

      // ── Eslatmalar
      for (const r of q(
        `SELECT r.id, r.channel, r.status, r.created_at, c.name AS mijoz
           FROM reminder_logs r LEFT JOIN customers c ON c.id = r.customer_id
          WHERE r.shop_id = ? ORDER BY r.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'eslatma',
          title: r.channel === 'call' ? "AI qo'ng'iroq" : `Eslatma (${r.channel})`,
          detail: [r.mijoz, r.status === 'sent' ? 'yuborildi' : r.status].filter(Boolean).join(' · '),
        });
      }

      // ── Xodim kirishlari
      for (const r of q(
        `SELECT id, employee_name, created_at FROM employee_logins
          WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({ at: r.created_at, kind: 'kirish', title: 'Xodim kirdi', who: r.employee_name });
      }

      // ── Xodim qo'shildi
      for (const r of q(
        `SELECT id, name, role, created_at FROM employees WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({ at: r.created_at, kind: 'xodim', title: `Xodim qo'shildi — ${r.name}`, detail: r.role });
      }

      // ── Mijoz qo'shildi
      for (const r of q(
        `SELECT id, name, phone, created_at FROM customers WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({ at: r.created_at, kind: 'mijoz', title: `Yangi mijoz — ${r.name}`, detail: r.phone });
      }

      // ── Yangi tovar
      for (const r of q(
        `SELECT id, name, barcode, created_at FROM products WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({ at: r.created_at, kind: 'tovar', title: `Yangi tovar — ${r.name}`, detail: r.barcode });
      }

      // ── Ta'minotchi va unga qarz
      for (const r of q(
        `SELECT id, name, phone, created_at FROM suppliers WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({ at: r.created_at, kind: 'taminotchi', title: `Yangi ta'minotchi — ${r.name}`, detail: r.phone });
      }
      for (const r of q(
        `SELECT d.id, d.amount, d.note, d.created_at, s.name AS taminotchi
           FROM supplier_debts d LEFT JOIN suppliers s ON s.id = d.supplier_id
          WHERE d.shop_id = ? ORDER BY d.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'taminotchi_qarz',
          title: `Ta'minotchiga qarz — ${r.taminotchi ?? '—'}`,
          detail: r.note,
          amount: pul(r.amount),
        });
      }

      // ── Buyurtmalar
      for (const r of q(
        `SELECT o.id, o.status, o.note, o.created_at, o.created_by, s.name AS taminotchi
           FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
          WHERE o.shop_id = ? ORDER BY o.created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'buyurtma',
          title: `Buyurtma #${r.id}`,
          detail: [r.taminotchi, r.status, r.note].filter(Boolean).join(' · '),
          who: kim(r.created_by),
        });
      }

      // ── Yuborilgan to'lov cheklari
      for (const r of q(
        `SELECT id, amount, status, agent_phone, note, created_at
           FROM payment_receipts WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'chek',
          title: 'To\'lov cheki yuborildi',
          detail: [r.status, r.agent_phone, r.note].filter(Boolean).join(' · '),
          amount: pul(r.amount),
        });
      }

      // ── AI savollari
      for (const r of q(
        `SELECT id, model, cost_uzs, created_at FROM ai_usage WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
        shopId,
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'ai',
          title: 'AI savoli',
          detail: `${r.model} · tannarx ${pul(r.cost_uzs)} so'm`,
        });
      }

      // ── Admin shu do'kon ustida qilgan amallar
      for (const r of q(
        `SELECT l.id, l.action, l.details, l.created_at, a.username
           FROM admin_logs l LEFT JOIN admins a ON a.id = l.admin_id
          WHERE l.target = ? OR l.target = ? ORDER BY l.created_at DESC LIMIT ?`,
        `shop:${shopId}`,
        String(shopId),
        per
      )) {
        rows.push({
          at: r.created_at,
          kind: 'admin',
          title: `Admin: ${r.action}`,
          detail: r.details,
          who: r.username ? `@${r.username}` : null,
        });
      }

      rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
      const kind = String(req.query.kind ?? '').trim();
      const filtered = kind ? rows.filter((r) => r.kind === kind) : rows;
      // Har turdan nechtadan borligi — panelda filtr tugmalari uchun
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r.kind] = (counts[r.kind] ?? 0) + 1;
      return { items: filtered.slice(0, limit), counts, total: filtered.length };
    }
  );

  /* ═══════════ Do'kon kabinetiga kirish ═══════════
   *
   * Texnik yordam uchun: do'konchi "menda shunday chiqyapti" desa,
   * admin uning ekranini o'z ko'zi bilan ko'radi. Parol so'ralmaydi —
   * do'konchining parolini bilish shart emas va bilinmasligi kerak.
   *
   * DO'KON TOMONIDA IZ QOLMAYDI:
   *   - employee_logins ga yozilmaydi, ya'ni do'konning "Loglar"
   *     bo'limida ko'rinmaydi;
   *   - egaga "xodim kirdi" degan Telegram xabari ketmaydi.
   * Aks holda har texnik ko'rikda do'konchi bezovta bo'lardi.
   *
   * LEKIN kompaniyaning O'Z jurnaliga (admin_logs → "Audit jurnali")
   * yoziladi: kim, qachon, qaysi do'kon kabinetiga kirgani. Panelga
   * kirish huquqi bir necha odamda, shuning uchun bu yozuv ham do'kon
   * egasi oldida, ham kompaniya ichida javobgarlik uchun kerak.
   *
   * Token qisqa muddatli (2 soat): brauzerda unutilib qolsa uzoq
   * ochiq turmasin.
   *
   * Faqat ADMIN: targ'ovchi xodim (role='agent') bu yo'lga tushmaydi.
   */
  app.post<{ Params: { id: string } }>(
    '/admin/shops/:id/login',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT id, name FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      const TTL = 2 * 60 * 60 * 1000;
      const token = signToken(shop.id, undefined, TTL);
      log(req.admin!.id, 'shop_login', `shop:${shop.id}`, shop.name ?? '');
      return { token, shop: { id: shop.id, name: shop.name }, expires_in: TTL };
    }
  );

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

  /** Bepul kun sovg'a qilish. Balansga tegilmaydi — xizmat to'langan
   *  sana oldinga suriladi, ya'ni o'sha kunlar uchun pul yechilmaydi. */
  app.post<{ Params: { id: string }; Body: { days?: number; note?: string } }>(
    '/admin/shops/:id/grant',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      const days = Math.max(1, Math.min(Number(req.body.days ?? 30), 365));
      db.prepare(
        `UPDATE shops SET charged_through = date(
           CASE WHEN charged_through > date('now', '+5 hours') THEN charged_through ELSE date('now', '+5 hours') END,
           '+' || ? || ' days')
         WHERE id = ?`
      ).run(days, shop.id);
      // Sovg'a — pul harakati emas, shuning uchun summasi nol
      db.prepare(
        "INSERT INTO balance_transactions (shop_id, type, amount, note, admin_id) VALUES (?, 'grant', 0, ?, ?)"
      ).run(shop.id, req.body.note?.trim() || `Bepul kun sovg'asi — ${days} kun`, req.admin!.id);
      log(req.admin!.id, 'grant_days', `shop:${shop.id}`, `${days}d`);
      const fresh = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id) as any;
      return { ...fresh, service: serviceState(fresh) };
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
      // Xizmat to'xtab turgan bo'lsa — pul tushishi bilan qayta ochiladi
      chargeShop(shop.id);
      const fresh = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id) as any;
      return { ...fresh, service: serviceState(fresh) };
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

    // Filtr bo'yicha jamlanma (sahifadagi emas, butun tanlov bo'yicha).
    //
    // Har xil yechim alohida ajratiladi. Kunlik to'lov va AI — bizning
    // TUSHUMIMIZ; "chiqim" esa qaytarish va qo'lda yechib olishlar.
    // Ilgari AI yechimi "chiqim" ichiga qo'shilib ketardi va do'kon
    // egasi xizmatdan qancha tushayotganini ko'ra olmasdi.
    const agg = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN b.amount > 0 AND b.type != 'refund' THEN b.amount END), 0) AS kirim,
           COALESCE(-SUM(CASE WHEN b.type = 'daily' THEN b.amount END), 0) AS kunlik,
           COALESCE(-SUM(CASE WHEN b.type = 'ai' THEN b.amount END), 0) AS ai,
           COALESCE(-SUM(CASE WHEN b.amount < 0 AND b.type NOT IN ('daily','ai') THEN b.amount END), 0) AS chiqim,
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
  /**
   * Taklif qilgan do'konga bonus yozish.
   *
   * Faqat bir marta va faqat taklif qilingan do'kon haqiqiy pul
   * to'lagandan keyin. Summa taklif QILINGAN do'kon turiga qarab
   * olinadi: zargarlik do'konini olib kelish qimmatroq baholanishi
   * mumkin.
   *
   * Bonus yozilmaydigan holatlar (jimgina o'tkazib yuboriladi):
   *   - taklif kodi yo'q yoki noto'g'ri
   *   - taklif qilgan do'kon o'chirilgan
   *   - o'zini o'zi taklif qilgan
   *   - sozlamada bonus 0
   */
  function payReferral(shop: any): { inviter_id: number; amount: number } | null {
    if (!shop?.referred_by || shop.referral_paid_at) return null;
    const m = /^ARABIC(\d+)$/.exec(String(shop.referred_by).trim().toUpperCase());
    if (!m) return null;
    const inviterId = Number(m[1]);
    if (!inviterId || inviterId === shop.id) return null;
    const inviter = db.prepare('SELECT id FROM shops WHERE id = ?').get(inviterId) as any;
    if (!inviter) return null;
    const amount = Math.round(Number(typeSetting(shop.shop_type, 'referral_bonus', settingDefault('referral_bonus'))));
    if (!Number.isFinite(amount) || amount <= 0) {
      // Bonus o'chirilgan bo'lsa ham do'kon "to'landi" deb belgilanadi:
      // keyin sozlama yoqilganda eski do'konlarga birdan pul yozilmasin
      db.prepare("UPDATE shops SET referral_paid_at = datetime('now') WHERE id = ?").run(shop.id);
      return null;
    }
    db.transaction(() => {
      db.prepare('UPDATE shops SET balance = balance + ? WHERE id = ?').run(amount, inviterId);
      db.prepare(
        "INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'referral', ?, ?)"
      ).run(inviterId, amount, `Taklif bonusi — ${shop.name ?? "do'kon"} #${shop.id}`);
      db.prepare("UPDATE shops SET referral_paid_at = datetime('now') WHERE id = ?").run(shop.id);
    })();
    // Bonus tushgach taklif qilgan do'konning xizmati ham yangilanadi
    chargeShop(inviterId);
    return { inviter_id: inviterId, amount };
  }

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
      /** Qaysi chek asosida kiritilyapti (Cheklar bo'limidan) */
      receipt_id?: number;
    };
  }>('/admin/payments', { preHandler: requireAdmin }, async (req, reply) => {
    const b = req.body ?? ({} as any);
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(b.shop_id) as any;
    if (!shop) return reply.code(404).send({ error: 'shop_not_found' });

    // Chek bo'yicha kiritilyaptimi. Chek FAQAT bir marta o'tishi kerak —
    // ikki admin bir vaqtda bosса ham balansga ikki marta tushmasin.
    let receipt: any = null;
    if (b.receipt_id) {
      receipt = db.prepare('SELECT * FROM payment_receipts WHERE id = ?').get(b.receipt_id) as any;
      if (!receipt) return reply.code(404).send({ error: 'receipt_not_found' });
      if (receipt.shop_id !== shop.id) return reply.code(400).send({ error: 'receipt_shop_mismatch' });
      if (receipt.status !== 'new') return reply.code(409).send({ error: 'already_' + receipt.status });
    }
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
      if (receipt) {
        // Bandlash SHARTNING O'ZIDA: ikkinchi so'rov 0 qator o'zgartiradi
        const claim = db
          .prepare(
            `UPDATE payment_receipts
                SET status = 'approved', payment_id = ?, reviewed_by = ?, reviewed_at = datetime('now')
              WHERE id = ? AND status = 'new'`
          )
          .run(info.lastInsertRowid, req.admin!.id, receipt.id);
        if (!Number(claim.changes)) throw new Error('receipt_taken');
      }
      return info.lastInsertRowid;
    });
    let id: any;
    try {
      id = tx();
    } catch (e: any) {
      if (String(e?.message) === 'receipt_taken') return reply.code(409).send({ error: 'already_approved' });
      throw e;
    }

    // Chekda targ'ovchi xodimning raqami bo'lsa — do'kon o'shanga
    // biriktiriladi. Faqat BIR MARTA: allaqachon biriktirilgan do'kon
    // uchun mukofot qayta yozilmaydi (linkAgent ga qara).
    let linked: { id: number; name: string } | null = null;
    if (receipt?.agent_phone) {
      const agent = agentByPhone(String(receipt.agent_phone));
      if (agent && linkAgent(shop.id, agent.id)) {
        linked = agent;
        log(req.admin!.id, 'link_agent', `shop:${shop.id}`, `${agent.name} (${receipt.agent_phone})`);
      }
    }

    // Taklif bonusi. Sozlamada 'referral_bonus' turgan, admin panelda
    // ko'rinardi — lekin uni HECH KIM to'lamasdi: taklif qilgan
    // do'konchi hech qachon pul olmagan.
    //
    // Bonus ro'yxatdan o'tishda emas, BIRINCHI HAQIQIY to'lovda
    // beriladi: aks holda bir kishi o'nta soxta do'kon ochib, o'ziga
    // pul yozib olardi. Bir do'kon uchun bir marta (referral_paid_at).
    const referral = signed > 0 ? payReferral(shop) : null;

    // Pul tushgan bo'lsa — to'xtab turgan xizmat darhol qayta ochiladi
    if (signed > 0) chargeShop(shop.id);
    log(req.admin!.id, 'add_payment', `shop:${shop.id}`, String(signed));
    const row = db.prepare('SELECT * FROM balance_transactions WHERE id = ?').get(id) as any;
    if (referral) log(req.admin!.id, 'referral_bonus', `shop:${referral.inviter_id}`, String(referral.amount));
    return { ...row, agent_linked: linked, referral };
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
  /**
   * Xizmat sozlamalarini QO'LDA qo'yish: kunlik narx, balans va
   * xizmat to'langan sana.
   *
   * Ilgari bularning uchalasi ham qulflangan edi — balansga faqat
   * "qo'shish", kunga faqat "bepul kun berish" mumkin edi, narx esa
   * umumiy sozlamada turardi va uni o'zgartirish HAMMA do'konga
   * tegib ketardi. Kelishuv esa har do'kon bilan boshqacha bo'ladi.
   *
   * Balans ANIQ QIYMATGA qo'yiladi, farqi esa tranzaksiya bo'lib
   * yoziladi: hisob tarixsiz o'zgarmasin, keyin "bu pul qayerdan
   * kelgan" degan savolga javob bo'lsin.
   */
  app.patch<{
    Params: { id: string };
    Body: {
      daily_price?: number | null;
      balance?: number;
      charged_through?: string | null;
      agent_id?: number | null;
      agent_bonus?: number;
    };
  }>('/admin/shops/:id/service', { preHandler: requireAdmin }, async (req, reply) => {
    const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
    if (!shop) return reply.code(404).send({ error: 'not_found' });
    const b = req.body ?? {};

    // ── Kunlik narx. null — "umumiy sozlamaga qayt", 0 — "bu do'kondan
    // pul olinmaydi". Ikkalasi boshqa-boshqa ma'no, shuning uchun
    // undefined dan farqlanadi.
    if ('daily_price' in b) {
      if (b.daily_price === null) {
        db.prepare('UPDATE shops SET daily_price = NULL WHERE id = ?').run(shop.id);
      } else {
        const v = Math.round(Number(b.daily_price));
        if (!Number.isFinite(v) || v < 0) return reply.code(400).send({ error: 'price_invalid' });
        db.prepare('UPDATE shops SET daily_price = ? WHERE id = ?').run(v, shop.id);
      }
      log(req.admin!.id, 'shop_price', String(shop.id), String(b.daily_price));
    }

    // ── Xizmat to'langan sana
    if ('charged_through' in b) {
      const d = b.charged_through;
      if (d === null || d === '') {
        db.prepare('UPDATE shops SET charged_through = NULL WHERE id = ?').run(shop.id);
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d))) return reply.code(400).send({ error: 'date_invalid' });
        db.prepare('UPDATE shops SET charged_through = ? WHERE id = ?').run(String(d), shop.id);
      }
      log(req.admin!.id, 'shop_through', String(shop.id), String(d));
    }

    // ── Balansni aniq qiymatga qo'yish
    if (b.balance !== undefined) {
      const want = Math.round(Number(b.balance));
      if (!Number.isFinite(want)) return reply.code(400).send({ error: 'balance_invalid' });
      const farq = want - (Number(shop.balance) || 0);
      if (farq !== 0) {
        db.prepare('UPDATE shops SET balance = ? WHERE id = ?').run(want, shop.id);
        db.prepare(
          "INSERT INTO balance_transactions (shop_id, type, amount, note, admin_id) VALUES (?, ?, ?, ?, ?)"
        ).run(shop.id, farq > 0 ? 'topup' : 'withdraw', farq, 'Admin balansni qo\'lda qo\'ydi', req.admin!.id);
        log(req.admin!.id, 'shop_balance_set', String(shop.id), `${shop.balance} -> ${want}`);
      }
    }

    // ── Targ'ovchi xodim. Chek orqali o'zi biriktiriladi, lekin
    // do'konchi raqamni yozmagan yoki xato yozgan bo'lsa admin
    // qo'lda qo'ya oladi. null — biriktirish bekor qilinadi.
    if ('agent_id' in b) {
      if (b.agent_id === null) {
        db.prepare('UPDATE shops SET agent_id = NULL, agent_bonus = NULL, agent_linked_at = NULL WHERE id = ?').run(shop.id);
        log(req.admin!.id, 'shop_agent', String(shop.id), 'olib tashlandi');
      } else {
        const agent = db
          .prepare("SELECT id, name FROM admins WHERE id = ? AND role = 'agent'")
          .get(Number(b.agent_id)) as any;
        if (!agent) return reply.code(404).send({ error: 'agent_not_found' });
        const bonus =
          b.agent_bonus === undefined ? (shop.agent_bonus ?? agentBonus(shop.shop_type)) : Math.round(Number(b.agent_bonus));
        if (!Number.isFinite(bonus) || bonus < 0) return reply.code(400).send({ error: 'bonus_invalid' });
        db.prepare(
          "UPDATE shops SET agent_id = ?, agent_bonus = ?, agent_linked_at = COALESCE(agent_linked_at, datetime('now')) WHERE id = ?"
        ).run(agent.id, bonus, shop.id);
        log(req.admin!.id, 'shop_agent', String(shop.id), `${agent.name} (${bonus})`);
      }
    } else if (b.agent_bonus !== undefined && shop.agent_id) {
      // Faqat mukofot o'zgartirilyapti
      const bonus = Math.round(Number(b.agent_bonus));
      if (!Number.isFinite(bonus) || bonus < 0) return reply.code(400).send({ error: 'bonus_invalid' });
      db.prepare('UPDATE shops SET agent_bonus = ? WHERE id = ?').run(bonus, shop.id);
      log(req.admin!.id, 'shop_bonus', String(shop.id), String(bonus));
    }

    return db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
  });

  /** Do'kon ma'lumotini tahrirlash — nomi, egasi, telefoni */
  app.patch<{ Params: { id: string }; Body: { name?: string; owner_name?: string; phone?: string } }>(
    '/admin/shops/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });

      const name = String(req.body?.name ?? shop.name).trim();
      if (!name) return reply.code(400).send({ error: 'name_required' });
      const owner = String(req.body?.owner_name ?? shop.owner_name ?? '').trim();

      // Telefon — kirish kaliti: bo'sh bo'lmasin va boshqa do'konga
      // tegishli bo'lmasin, aks holda ikki do'kon bitta raqamga
      // bog'lanib qolardi va OTP qaysi biriga kirishini bilmasdi
      let phone = shop.phone;
      if (req.body?.phone != null) {
        phone = String(req.body.phone).replace(/[^\d+]/g, '');
        if (phone.length < 9) return reply.code(400).send({ error: 'phone_invalid' });
        const band = db.prepare('SELECT id FROM shops WHERE phone = ? AND id != ?').get(phone, shop.id);
        if (band) return reply.code(409).send({ error: 'phone_taken' });
      }

      db.prepare('UPDATE shops SET name = ?, owner_name = ?, phone = ? WHERE id = ?').run(
        name,
        owner || null,
        phone,
        shop.id
      );
      log(req.admin!.id, 'shop_edit', String(shop.id), `${shop.name} -> ${name}`);
      return db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    }
  );

  /**
   * Do'konni BUTUNLAY o'chirish.
   *
   * Qaytarib bo'lmaydi: mijozlari, qarzlari, tovarlari, savdolari —
   * hammasi ketadi. Shuning uchun ikki himoya bor:
   *   - so'rovda do'kon nomi aynan takrorlanishi shart (chalg'ib
   *     bosilgan tugma butun do'konni yo'q qilmasin);
   *   - hammasi BITTA tranzaksiyada, ya'ni yarim o'chgan do'kon
   *     qolib ketmaydi.
   */
  app.delete<{ Params: { id: string }; Body: { confirm?: string } }>(
    '/admin/shops/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.params.id) as any;
      if (!shop) return reply.code(404).send({ error: 'not_found' });
      if (String(req.body?.confirm ?? '').trim() !== String(shop.name).trim()) {
        return reply.code(400).send({ error: 'confirm_mismatch', expected: shop.name });
      }

      // Avval bolalar, keyin ota-onalar: tashqi kalitlar buzilmasin.
      // Ro'yxat schema.sql dagi bog'lanishlar bo'yicha tuzilgan.
      const id = shop.id;
      const tx = db.transaction(() => {
        const run = (sql: string, ...a: any[]) => {
          try {
            db.prepare(sql).run(...a);
          } catch {
            /* jadval yo'q bo'lsa (eski baza) o'chirish to'xtamasin */
          }
        };
        run('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE shop_id = ?)', id);
        run('DELETE FROM return_items WHERE return_id IN (SELECT id FROM returns WHERE shop_id = ?)', id);
        run('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE shop_id = ?)', id);
        run('DELETE FROM debt_payments WHERE debt_id IN (SELECT id FROM debts WHERE shop_id = ?)', id);
        run(
          'DELETE FROM supplier_debt_payments WHERE supplier_debt_id IN (SELECT id FROM supplier_debts WHERE shop_id = ?)',
          id
        );
        for (const t of [
          'ai_messages', 'ai_usage', 'ai_intake_drafts', 'ai_chats',
          'stock_movements', 'product_batches', 'product_barcodes', 'products',
          'debts', 'customers', 'supplier_debts', 'suppliers',
          'sales', 'returns', 'orders', 'expenses', 'reminder_logs',
          'employee_logins', 'employees', 'balance_transactions',
        ]) {
          run(`DELETE FROM ${t} WHERE shop_id = ?`, id);
        }
        run('DELETE FROM shops WHERE id = ?', id);
      });
      tx();

      log(req.admin!.id, 'shop_delete', String(id), `${shop.name} (${shop.phone})`);
      return { ok: true };
    }
  );

  app.get('/admin/shops/summary', { preHandler: requireAdmin }, async () =>
    db
      .prepare(
        `SELECT
           COUNT(*) AS jami,
           COALESCE(SUM(CASE WHEN is_blocked = 0 AND charged_through >= ? THEN 1 END), 0) AS ishlayapti,
           COALESCE(SUM(CASE WHEN is_blocked = 0 AND (charged_through IS NULL OR charged_through < ?) THEN 1 END), 0) AS toxtagan,
           COALESCE(SUM(CASE WHEN is_blocked = 1 THEN 1 END), 0) AS bloklangan,
           COALESCE(SUM(CASE WHEN balance > 0 THEN balance END), 0) AS balans,
           -- Minusga tushganlar: ular xizmatdan foydalangan-u, hisobi
           -- qoplanmagan. Alohida sanaladi, aks holda umumiy qoldiq
           -- ichida yo'qolib ketardi.
           COALESCE(SUM(CASE WHEN balance < 0 THEN 1 END), 0) AS qarzdor,
           COALESCE(SUM(CASE WHEN balance < 0 THEN -balance END), 0) AS qarz_summa
         FROM shops`
      )
      .get(uzToday(), uzToday())
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
  /**
   * Sozlamalar ichida MAXFIY qiymatlar ham bor (AI kaliti).
   * Ular hech qachon brauzerga qaytarilmaydi va jurnalga yozilmaydi:
   * admin panelga kirgan har kim kalitni ko'chirib ololmasin, jurnalni
   * o'qigan ham. Faqat "qo'yilganmi" va oxirgi 4 belgi ko'rinadi.
   */
  const SECRET_SETTINGS = new Set(['anthropic_api_key']);

  function publicSettings(): Record<string, string> {
    const rows = db.prepare('SELECT * FROM settings').all() as any[];
    const out: Record<string, string> = {};
    for (const r of rows) {
      // '_' bilan boshlanadigan kalitlar ichki belgilar (masalan
      // migratsiya bajarilganini bildiruvchi) — panelga chiqmaydi
      if (String(r.key).startsWith('_')) continue;
      if (SECRET_SETTINGS.has(r.key)) {
        // Qiymat o'rniga faqat dumi — "qaysi kalit turibdi" bilinsin
        out[r.key + '_tail'] = r.value ? String(r.value).slice(-4) : '';
        continue;
      }
      out[r.key] = r.value;
    }
    return out;
  }

  app.get('/admin/settings', { preHandler: requireAdmin }, async () => publicSettings());

  /**
   * Sozlamalar haqida ma'lumot: qaysi do'kon turlari bor va ulardan
   * qaysi sozlamani ALOHIDA qo'yish mumkin.
   *
   * Ro'yxat serverdan olinadi — admin panelga qo'lda ko'chirilsa,
   * server yangi tur qo'shganda panel eskisini ko'rsatib turardi.
   */
  app.get('/admin/settings/meta', { preHandler: requireAdmin }, async () => ({
    types: SHOP_TYPES,
    type_keys: TYPE_SETTING_KEYS,
    // Sozlama umuman qo'yilmagan bo'lsa ishlaydigan qiymatlar — panel
    // bo'sh maydonni "—" emas, haqiqatda ishlayotgan raqam bilan
    // ko'rsatsin
    defaults: SETTING_DEFAULTS,
  }));

  app.patch<{ Body: Record<string, string> }>('/admin/settings', { preHandler: requireAdmin }, async (req, reply) => {
    // Tur uchun qo'yiladigan ustama sozlama kaliti to'g'ri yozilganmi.
    // Xato yozilsa (masalan 't_oltinn_daily_price') hech qanday xato
    // chiqmasdan jimgina saqlanib ketardi va admin "nega ishlamayapti"
    // deb o'tirardi — shuning uchun oldindan rad etamiz.
    for (const key of Object.keys(req.body ?? {})) {
      if (key.startsWith('t_') && !parseTypeKey(key)) {
        return reply.code(400).send({ error: 'bad_setting_key', key });
      }
    }
    for (const [key, value] of Object.entries(req.body ?? {})) {
      const secret = SECRET_SETTINGS.has(key);
      const clean = String(value).trim();
      // Bo'sh yuborilsa maxfiy qiymat o'chiriladi (kalitni olib tashlash)
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
        key,
        clean,
        clean
      );
      // Jurnalga maxfiy qiymatning O'ZI emas, faqat o'zgargani yoziladi
      log(req.admin!.id, 'set_setting', key, secret ? (clean ? 'kalit qo\'yildi' : 'kalit o\'chirildi') : clean);
    }
    return publicSettings();
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
    // Targ'ovchi xodimlar bu ro'yxatga tushmaydi: ular "Xodimlar"
    // bo'limida, o'z hisobi bilan turadi
    return db
      .prepare(
        "SELECT id, username, name, role, is_active, last_login_at, created_at FROM admins WHERE role != 'agent'"
      )
      .all();
  });

  app.post<{ Body: { username: string; password: string; name?: string; role?: string } }>(
    '/admin/admins',
    { preHandler: requireSuper },
    async (req, reply) => {
      const { username, password, name, role } = req.body ?? {};
      if (!username?.trim() || !password || password.length < 6) {
        return reply.code(400).send({ error: 'username_and_password6_required' });
      }
      // Login har doim kichik harfda saqlanadi — kirishda ham
      // shunday qidiriladi. "Aziz" va "aziz" ikki xil hisob
      // bo'lib qolmasin.
      const login = username.trim().toLowerCase();
      if (db.prepare('SELECT id FROM admins WHERE username = ? COLLATE NOCASE').get(login)) {
        return reply.code(409).send({ error: 'username_taken' });
      }
      // Noma'lum rol JIMGINA "admin" ga aylanmasin.
      //
      // Ilgari `role === 'super' ? 'super' : 'admin'` edi: bu yo'lga
      // xato bilan 'agent' yuborilsa, targ'ovchi xodim bo'lish o'rniga
      // TO'LIQ ADMIN bo'lib qolardi — ya'ni huquq kamayish o'rniga
      // oshib ketardi. Targ'ovchi xodim o'z yo'li bilan yaratiladi
      // (/admin/agents).
      if (role !== undefined && role !== 'admin' && role !== 'super') {
        return reply.code(400).send({ error: 'bad_role', allowed: ['admin', 'super'] });
      }
      try {
        const info = db
          .prepare('INSERT INTO admins (username, password_hash, name, role) VALUES (?, ?, ?, ?)')
          .run(login, hashPassword(password), name ?? null, role === 'super' ? 'super' : 'admin');
        log(req.admin!.id, 'create_admin', login);
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
