// Targ'ovchi xodimlar va to'lov cheklari — API yo'llari.
// Hisob-kitob qoidalari agentcore.ts da (u yerda fastify ham, admin.ts
// ham chaqirilmaydi — admin.ts o'zi shu qoidalarga tayanadi).

import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { requireAdmin, requireSuper, requireStaff, hashPassword, log } from './admin.js';
import { agentByPhone, agentBonus, agentStats, phoneKey } from './agentcore.js';

export function registerAgentRoutes(app: FastifyInstance) {
  /* ─────────── Xodimlar ─────────── */

  app.get('/admin/agents', { preHandler: requireAdmin }, async () => {
    const rows = db
      .prepare(
        `SELECT id, username, name, phone, is_active, last_login_at, created_at
         FROM admins WHERE role = 'agent' ORDER BY is_active DESC, id DESC`
      )
      .all() as any[];
    return {
      bonus: agentBonus(),
      rows: rows.map((a) => ({ ...a, ...agentStats(a.id) })),
    };
  });

  /** Bitta xodim: ulagan do'konlari va mukofot to'lovlari bilan.
   *  Xodimning o'zi ham shu yo'l orqali o'z sahifasini ko'radi. */
  app.get<{ Params: { id: string } }>('/admin/agents/:id', { preHandler: requireStaff }, async (req, reply) => {
    const id = Number(req.params.id);
    // Xodim faqat O'ZINIKINI ko'radi
    if (req.admin!.role === 'agent' && req.admin!.id !== id) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    const agent = db
      .prepare("SELECT id, username, name, phone, is_active, created_at FROM admins WHERE id = ? AND role = 'agent'")
      .get(id) as any;
    if (!agent) return reply.code(404).send({ error: 'not_found' });
    const shops = db
      .prepare(
        `SELECT id, name, owner_name, phone, balance, agent_bonus, agent_linked_at, created_at
         FROM shops WHERE agent_id = ? ORDER BY agent_linked_at DESC, id DESC`
      )
      .all(id);
    const payouts = db
      .prepare(
        `SELECT p.*, a.username AS by_username FROM agent_payouts p
         LEFT JOIN admins a ON a.id = p.created_by
         WHERE p.agent_id = ? ORDER BY COALESCE(p.paid_at, p.created_at) DESC, p.id DESC`
      )
      .all(id);
    // Hisob alohida "stats" ichida: shu yerda "shops" — do'konlar
    // RO'YXATI, agentStats dagi "shops" esa SONI. Bir nomda tursa,
    // biri ikkinchisini bosib ketardi.
    return { agent, stats: agentStats(id), shops, payouts };
  });

  /** Panelga kirgan xodimning o'z sahifasi — id ni bilishi shart emas */
  app.get('/admin/my', { preHandler: requireStaff }, async (req) => {
    const id = req.admin!.id;
    const me = db.prepare('SELECT id, username, name, phone, role FROM admins WHERE id = ?').get(id) as any;
    const shops = db
      .prepare(
        `SELECT id, name, owner_name, phone, agent_bonus, agent_linked_at, created_at
         FROM shops WHERE agent_id = ? ORDER BY agent_linked_at DESC, id DESC`
      )
      .all(id);
    const payouts = db
      .prepare(
        'SELECT id, amount, note, paid_at, created_at FROM agent_payouts WHERE agent_id = ? ORDER BY id DESC'
      )
      .all(id);
    return { me, bonus: agentBonus(), stats: agentStats(id), shops, payouts };
  });

  app.post<{ Body: { username?: string; password?: string; name?: string; phone?: string } }>(
    '/admin/agents',
    { preHandler: requireSuper },
    async (req, reply) => {
      const username = String(req.body?.username ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const name = String(req.body?.name ?? '').trim();
      const phone = String(req.body?.phone ?? '').replace(/[^\d+]/g, '');
      if (!username || username.length < 3) return reply.code(400).send({ error: 'username_short' });
      if (password.length < 6) return reply.code(400).send({ error: 'password_short' });
      if (!name) return reply.code(400).send({ error: 'name_required' });
      // Raqam — xodimning kaliti: do'konchi chekda AYNAN shuni yozadi.
      // Ikki xodimda bir raqam bo'lsa, do'kon qaysi biriga tegishini
      // bilib bo'lmasdi.
      if (phoneKey(phone).length < 9) return reply.code(400).send({ error: 'phone_invalid' });
      if (agentByPhone(phone)) return reply.code(409).send({ error: 'phone_taken' });
      // Login kichik harfda saqlanadi; katta-kichik farqi bilan
      // ikkinchi hisob yaratilib qolmasin
      if (db.prepare('SELECT id FROM admins WHERE username = ? COLLATE NOCASE').get(username)) {
        return reply.code(409).send({ error: 'username_taken' });
      }
      try {
        const info = db
          .prepare("INSERT INTO admins (username, password_hash, name, phone, role) VALUES (?, ?, ?, ?, 'agent')")
          .run(username, hashPassword(password), name, phone);
        log(req.admin!.id, 'create_agent', `agent:${info.lastInsertRowid}`, `${name} ${phone}`);
        return db
          .prepare('SELECT id, username, name, phone, is_active FROM admins WHERE id = ?')
          .get(info.lastInsertRowid);
      } catch {
        return reply.code(409).send({ error: 'username_taken' });
      }
    }
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; phone?: string; password?: string; is_active?: boolean };
  }>('/admin/agents/:id', { preHandler: requireSuper }, async (req, reply) => {
    const agent = db.prepare("SELECT * FROM admins WHERE id = ? AND role = 'agent'").get(req.params.id) as any;
    if (!agent) return reply.code(404).send({ error: 'not_found' });
    const b = req.body ?? {};

    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name) return reply.code(400).send({ error: 'name_required' });
      db.prepare('UPDATE admins SET name = ? WHERE id = ?').run(name, agent.id);
    }
    if (b.phone !== undefined) {
      const phone = String(b.phone).replace(/[^\d+]/g, '');
      if (phoneKey(phone).length < 9) return reply.code(400).send({ error: 'phone_invalid' });
      const band = agentByPhone(phone);
      if (band && band.id !== agent.id) return reply.code(409).send({ error: 'phone_taken' });
      db.prepare('UPDATE admins SET phone = ? WHERE id = ?').run(phone, agent.id);
    }
    if (b.password) {
      if (String(b.password).length < 6) return reply.code(400).send({ error: 'password_short' });
      db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(hashPassword(String(b.password)), agent.id);
    }
    if (b.is_active !== undefined) {
      db.prepare('UPDATE admins SET is_active = ? WHERE id = ?').run(b.is_active ? 1 : 0, agent.id);
    }
    log(req.admin!.id, 'update_agent', `agent:${agent.id}`);
    return db.prepare('SELECT id, username, name, phone, is_active FROM admins WHERE id = ?').get(agent.id);
  });

  /** Xodimni o'chirish.
   *
   *  Do'konlari bor bo'lsa O'CHIRILMAYDI: hisob-kitob tarixi yo'qolib
   *  ketardi. Bunday xodimni "faol emas" qilib qo'yish kerak. */
  app.delete<{ Params: { id: string } }>('/admin/agents/:id', { preHandler: requireSuper }, async (req, reply) => {
    const agent = db.prepare("SELECT * FROM admins WHERE id = ? AND role = 'agent'").get(req.params.id) as any;
    if (!agent) return reply.code(404).send({ error: 'not_found' });
    const st = agentStats(agent.id);
    if (st.shops > 0) return reply.code(409).send({ error: 'has_shops', shops: st.shops });
    db.transaction(() => {
      db.prepare('DELETE FROM agent_payouts WHERE agent_id = ?').run(agent.id);
      // Audit yozuvlari va u ko'rgan cheklar QOLADI (kim nima qilgani
      // tarixi yo'qolmasin), faqat bog'lanish uziladi — aks holda
      // tashqi kalit o'chirishga yo'l bermasdi
      db.prepare('UPDATE admin_logs SET admin_id = NULL WHERE admin_id = ?').run(agent.id);
      db.prepare('UPDATE payment_receipts SET reviewed_by = NULL WHERE reviewed_by = ?').run(agent.id);
      db.prepare('UPDATE agent_payouts SET created_by = NULL WHERE created_by = ?').run(agent.id);
      db.prepare('DELETE FROM admins WHERE id = ?').run(agent.id);
    })();
    log(req.admin!.id, 'delete_agent', `agent:${agent.id}`, agent.name ?? agent.username);
    return { ok: true };
  });

  /* ─────────── Mukofot to'lovlari ─────────── */

  app.post<{ Params: { id: string }; Body: { amount?: number; note?: string; paid_at?: string } }>(
    '/admin/agents/:id/payouts',
    { preHandler: requireSuper },
    async (req, reply) => {
      const agent = db.prepare("SELECT * FROM admins WHERE id = ? AND role = 'agent'").get(req.params.id) as any;
      if (!agent) return reply.code(404).send({ error: 'not_found' });
      const amount = Math.round(Number(req.body?.amount) || 0);
      if (amount <= 0) return reply.code(400).send({ error: 'amount_required' });
      const paidAt = String(req.body?.paid_at ?? '');
      if (paidAt && !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) return reply.code(400).send({ error: 'date_invalid' });
      const info = db
        .prepare('INSERT INTO agent_payouts (agent_id, amount, note, paid_at, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(agent.id, amount, String(req.body?.note ?? '').trim() || null, paidAt || null, req.admin!.id);
      log(req.admin!.id, 'agent_payout', `agent:${agent.id}`, String(amount));
      return db.prepare('SELECT * FROM agent_payouts WHERE id = ?').get(info.lastInsertRowid);
    }
  );

  app.delete<{ Params: { id: string } }>('/admin/payouts/:id', { preHandler: requireSuper }, async (req, reply) => {
    const row = db.prepare('SELECT * FROM agent_payouts WHERE id = ?').get(req.params.id) as any;
    if (!row) return reply.code(404).send({ error: 'not_found' });
    db.prepare('DELETE FROM agent_payouts WHERE id = ?').run(row.id);
    log(req.admin!.id, 'delete_payout', `agent:${row.agent_id}`, String(row.amount));
    return { ok: true };
  });

  /* ─────────── Cheklar ─────────── */

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/admin/receipts',
    { preHandler: requireAdmin },
    async (req) => {
      const status = String(req.query?.status ?? 'new');
      const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 100));
      const where = status === 'all' ? '' : 'WHERE r.status = ?';
      const params = status === 'all' ? [] : [status];
      const rows = db
        .prepare(
          `SELECT r.*, s.name AS shop_name, s.phone AS shop_phone, s.owner_name,
                  s.balance AS shop_balance, s.agent_id AS shop_agent_id,
                  ag.name AS shop_agent_name,
                  a.username AS reviewed_username
           FROM payment_receipts r
           JOIN shops s ON s.id = r.shop_id
           LEFT JOIN admins ag ON ag.id = s.agent_id
           LEFT JOIN admins a ON a.id = r.reviewed_by
           ${where}
           ORDER BY r.id DESC LIMIT ?`
        )
        .all(...params, limit) as any[];

      // Chekda yozilgan raqam qaysi xodimniki — admin tasdiqlashdan
      // OLDIN ko'rib tursin
      const withAgent = rows.map((r) => ({ ...r, agent_match: r.agent_phone ? agentByPhone(r.agent_phone) : null }));

      const counts = db
        .prepare(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'new' THEN 1 END), 0) AS yangi,
             COALESCE(SUM(CASE WHEN status = 'approved' THEN 1 END), 0) AS tasdiqlangan,
             COALESCE(SUM(CASE WHEN status = 'rejected' THEN 1 END), 0) AS rad,
             COALESCE(SUM(CASE WHEN status = 'new' THEN amount END), 0) AS yangi_summa
           FROM payment_receipts`
        )
        .get() as any;
      return { rows: withAgent, counts };
    }
  );

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/receipts/:id/reject',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const r = db.prepare('SELECT * FROM payment_receipts WHERE id = ?').get(req.params.id) as any;
      if (!r) return reply.code(404).send({ error: 'not_found' });
      if (r.status !== 'new') return reply.code(409).send({ error: 'already_' + r.status });
      db.prepare(
        `UPDATE payment_receipts
            SET status = 'rejected', review_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
          WHERE id = ?`
      ).run(String(req.body?.reason ?? '').trim() || null, req.admin!.id, r.id);
      log(req.admin!.id, 'reject_receipt', `receipt:${r.id}`, String(r.amount));
      return { ok: true };
    }
  );
}
