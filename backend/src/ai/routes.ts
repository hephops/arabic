// AI yordamchining API yo'llari.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { getSetting } from '../billing.js';
import { can } from '../auth.js';
import { ask, AiError, spend, purgeOld } from './agent.js';
import { KEEP_DAYS, aiEnabled, aiKey, model as aiModel, dailyLimit, questionPrice } from './config.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function registerAiRoutes(app: FastifyInstance, opts: { requireAi: Guard; requireAdmin: Guard }) {
  /** Holat: yoqilganmi, bugun nechta savol qolgan */
  app.get('/ai/status', { preHandler: opts.requireAi }, async (req) => {
    const s = spend(req.shopId!);
    const limit = dailyLimit();
    return {
      enabled: aiEnabled(),
      model: aiModel(),
      daily_limit: limit,
      asked_today: s.savollar,
      left_today: limit > 0 ? Math.max(0, limit - s.savollar) : null,
      // Bitta savol qancha turadi (0 — bepul). Ilova buni oldindan
      // ko'rsatadi: do'konchi bilib tursin, keyin "pulim qayoqqa
      // ketdi" degan savol tug'ilmasin.
      price: questionPrice(),
    };
  });

  /**
   * Admin uchun holat: kalit qo'yilganmi, qaysi model, sarf qancha.
   *
   * Alohida yo'l — do'konchining /ai/status'i unga faqat o'z
   * chegarasini aytadi. Platforma egasiga esa "nega ishlamayapti"
   * degan savolga javob kerak, va u serverga kirmasdan bilishi kerak.
   */
  app.get('/admin/ai/status', { preHandler: opts.requireAdmin }, async () => {
    const key = aiKey();
    const month = db
      .prepare(
        `SELECT COALESCE(SUM(cost_uzs), 0) AS s, COUNT(*) AS c, COUNT(DISTINCT shop_id) AS d
         FROM ai_usage WHERE created_at >= datetime('now', '-30 days')`
      )
      .get() as any;
    // Do'konchilardan yechilgan pul — bu DAROMAD, yuqoridagisi esa
    // Anthropic'ga to'lanadigan TANNARX. Ikkalasi yonma-yon turishi
    // kerak: narx tannarxni qoplayaptimi yoki yo'q, shundan ko'rinadi.
    const earned = db
      .prepare(
        `SELECT COALESCE(-SUM(amount), 0) AS s, COUNT(*) AS c FROM balance_transactions
         WHERE type = 'ai' AND created_at >= datetime('now', '-30 days')`
      )
      .get() as any;
    return {
      enabled: aiEnabled(),
      // Kalitning O'ZI hech qachon qaytarilmaydi — faqat bor-yo'qligi
      // va oxirgi to'rt belgisi, "qaysi kalit turibdi" ni bilish uchun
      key_tail: key ? key.slice(-4) : null,
      model: aiModel(),
      daily_limit: dailyLimit(),
      question_price: questionPrice(),
      keep_days: KEEP_DAYS,
      // Kalit .env dan kelayaptimi yoki admin paneldan — "nega
      // o'chirmayapti" degan savolga javob shu yerda
      from_env: !getSetting('anthropic_api_key', '') && !!process.env.ANTHROPIC_API_KEY,
      cost_month: month.s,
      calls_month: month.c,
      shops_month: month.d,
      earned_month: earned.s,
      paid_questions_month: earned.c,
    };
  });

  /**
   * Kalitni sinab ko'rish.
   *
   * "Yozdim, lekin ishlamayapti" degan holatni bir bosishda hal
   * qiladi: eng arzon so'rov yuboriladi va modelning javobi yoki
   * xatoning O'ZI qaytariladi — taxmin qilib o'tirilmaydi.
   */
  app.post('/admin/ai/test', { preHandler: opts.requireAdmin }, async (reply) => {
    if (!aiEnabled()) return { ok: false, error: 'Kalit qo\'yilmagan' };
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const c = new Anthropic({
        apiKey: aiKey(),
        ...(process.env.ANTHROPIC_BASE_URL ? { baseURL: process.env.ANTHROPIC_BASE_URL } : {}),
      });
      const r = await c.messages.create({
        model: aiModel(),
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Javob: "ishlayapti" deb yoz.' }],
      });
      const text = r.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join(' ');
      return { ok: true, model: aiModel(), answer: text.trim().slice(0, 120) };
    } catch (e: any) {
      // Anthropic xatosini o'zgartirmasdan qaytaramiz — "kalit
      // noto'g'ri" bilan "hisobda pul yo'q" ni ajratish uchun
      return { ok: false, error: e?.error?.error?.message || e?.message || 'Nomalum xato' };
    }
  });

  /** Savol berish */
  app.post<{ Body: { question?: string; deep?: boolean } }>(
    '/ai/ask',
    { preHandler: opts.requireAi },
    async (req, reply) => {
      try {
        const r = await ask({
          shopId: req.shopId!,
          employeeId: req.employeeId,
          // Chegirma qo'yish alohida ruxsat. Ega uchun doim ochiq.
          canAct: can(req, 'ai_actions'),
          question: String(req.body?.question ?? ''),
          channel: 'app',
          deep: !!req.body?.deep,
        });
        // Sarf do'konchiga ko'rsatilmaydi — u obunaga kirgan, har
        // savolda "shuncha so'm ketdi" deb turish bezovta qiladi
        return { text: r.text, chat_id: r.chat_id, tools_used: r.tools_used, charged: r.charged };
      } catch (e: any) {
        if (e instanceof AiError) {
          const code = e.code === 'daily_limit' ? 429 : e.code === 'no_balance' ? 402 : 400;
        return reply.code(code).send({ error: e.code, message: e.message });
        }
        req.log.error(e);
        // Model tomonidagi xato do'konchiga tushunarli tilda.
        // Kutish muddati tugagani alohida: "xato" emas, "sekin" —
        // do'konchi savolni qisqartirsa o'tib ketadi.
        const slow = e?.name === 'APIConnectionTimeoutError' || /timeout/i.test(String(e?.message ?? ''));
        return reply.code(502).send({
          error: slow ? 'ai_timeout' : 'ai_failed',
          message: slow
            ? "Javob juda uzoq davom etdi. Savolni qisqaroq qilib qayta yozing."
            : "Yordamchi javob bera olmadi. Birozdan keyin urinib ko'ring.",
        });
      }
    }
  );

  /** Suhbat tarixi */
  app.get('/ai/history', { preHandler: opts.requireAi }, async (req) => {
    const chat = db
      .prepare(
        `SELECT id FROM ai_chats WHERE shop_id = ? AND channel = 'app'
           AND ((employee_id IS NULL AND ? IS NULL) OR employee_id = ?)
         ORDER BY id DESC LIMIT 1`
      )
      .get(req.shopId, req.employeeId, req.employeeId) as any;
    if (!chat) return [];
    // Faqat ko'rinadigan matn: vosita chaqiruvlari ekranda kerak emas
    return db
      .prepare(
        `SELECT role, text, created_at FROM ai_messages
         WHERE chat_id = ? AND text IS NOT NULL AND text != '' ORDER BY id LIMIT 100`
      )
      .all(chat.id);
  });

  /** Suhbatni tozalash — do'konchi o'zi o'chira olsin */
  app.delete('/ai/history', { preHandler: opts.requireAi }, async (req) => {
    const chats = db
      .prepare(
        `SELECT id FROM ai_chats WHERE shop_id = ?
           AND ((employee_id IS NULL AND ? IS NULL) OR employee_id = ?)`
      )
      .all(req.shopId, req.employeeId, req.employeeId) as any[];
    for (const c of chats) {
      db.prepare('DELETE FROM ai_messages WHERE chat_id = ?').run(c.id);
      db.prepare('DELETE FROM ai_chats WHERE id = ?').run(c.id);
    }
    return { ok: true, deleted: chats.length };
  });
}

/** Eski suhbatlarni kuniga bir marta tozalash */
export function startAiCleanup() {
  const run = () => {
    try {
      purgeOld(KEEP_DAYS);
    } catch {
      /* tozalash ishlamasa ilova to'xtamasin */
    }
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
