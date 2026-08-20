// AI yordamchining API yo'llari.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { ask, AiError, spend, purgeOld } from './agent.js';
import { DAILY_LIMIT, KEEP_DAYS, MODEL, aiEnabled } from './config.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export function registerAiRoutes(app: FastifyInstance, opts: { requireAi: Guard }) {
  /** Holat: yoqilganmi, bugun nechta savol qolgan */
  app.get('/ai/status', { preHandler: opts.requireAi }, async (req) => {
    const s = spend(req.shopId!);
    return {
      enabled: aiEnabled(),
      model: MODEL,
      daily_limit: DAILY_LIMIT,
      asked_today: s.savollar,
      left_today: DAILY_LIMIT > 0 ? Math.max(0, DAILY_LIMIT - s.savollar) : null,
    };
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
          question: String(req.body?.question ?? ''),
          channel: 'app',
          deep: !!req.body?.deep,
        });
        // Sarf do'konchiga ko'rsatilmaydi — u obunaga kirgan, har
        // savolda "shuncha so'm ketdi" deb turish bezovta qiladi
        return { text: r.text, chat_id: r.chat_id, tools_used: r.tools_used };
      } catch (e: any) {
        if (e instanceof AiError) {
          return reply.code(e.code === 'daily_limit' ? 429 : 400).send({ error: e.code, message: e.message });
        }
        req.log.error(e);
        // Model tomonidagi xato do'konchiga tushunarli tilda
        return reply.code(502).send({
          error: 'ai_failed',
          message: "Yordamchi javob bera olmadi. Birozdan keyin urinib ko'ring.",
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
