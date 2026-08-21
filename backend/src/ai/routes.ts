// AI yordamchining API yo'llari.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db.js';
import { getSetting } from '../billing.js';
import { can } from '../auth.js';
import { ask, askStream, AiError, spend, purgeOld, dropChat, type AiEvent } from './agent.js';
import { KEEP_DAYS, aiEnabled, aiKey, model as aiModel, dailyLimit, questionPrice } from './config.js';
import { cleanBarcode } from './tools.js';
import { normalizeBarcode } from '../barcodes.js';

type Guard = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;


/**
 * Model tomonidagi xatoni do'konchi tushunadigan tilga o'girish.
 *
 * Ilgari hamma xato "Yordamchi javob bera olmadi" bo'lib chiqardi va
 * sababini bilish uchun serverga kirish kerak edi. Endi asosiy
 * sabablar aytiladi — do'konchi o'zi hal qila oladi (rasmni
 * kichraytirsin, hisobni to'ldirsin, keyinroq ursin).
 *
 * Kalit yoki ichki manzil kabi maxfiy narsalar bu yerga tushmaydi:
 * faqat bizning o'z matnlarimiz va Anthropic'ning xato TURI.
 */
function friendlyError(e: any): { code: string; message: string } {
  const name = String(e?.name ?? '');
  const raw = String(e?.error?.error?.message ?? e?.message ?? '');
  const status = Number(e?.status ?? 0);

  if (name === 'APIConnectionTimeoutError' || /timeout/i.test(raw)) {
    return { code: 'ai_timeout', message: "Javob juda uzoq davom etdi. Savolni qisqaroq qilib qayta yozing." };
  }
  if (status === 401 || /authentication|api key/i.test(raw)) {
    return { code: 'ai_key', message: "AI kaliti ishlamayapti. Admin panel > Sozlamalar dan tekshiring." };
  }
  if (status === 400 && /image/i.test(raw)) {
    return { code: 'ai_image', message: "Rasmni o'qib bo'lmadi. Boshqa rasm tanlang yoki qaytadan suratga oling." };
  }
  if (status === 429) {
    return { code: 'ai_busy', message: "Hozir band. Bir daqiqadan keyin urinib ko'ring." };
  }
  if (/credit|billing|quota/i.test(raw)) {
    return { code: 'ai_credit', message: "AI hisobida mablag' tugagan. Admin panel > Sozlamalar." };
  }
  // Noma'lum xato — sababini ham qo'shamiz, aks holda tuzatib bo'lmaydi
  return {
    code: 'ai_failed',
    message: "Yordamchi javob bera olmadi." + (raw ? ` (${raw.slice(0, 120)})` : ''),
  };
}

/**
 * Ochiq (tasdiqlanmagan) kirim takliflarining yoshi.
 *
 * Taklif 'pending' holatidan o'zi chiqmaydi: do'konchi kartani tashlab
 * ketsa u bazada abadiy qolaveradi. Ro'yxat esa beshtagacha qaytaradi —
 * shunday beshta unutilgan karta yig'ilsa, BUGUNGI nakladnoy ekranga
 * umuman chiqmay qolardi.
 *
 * Shuning uchun ikki chegara: eskirgani ro'yxatga tushmaydi va bir
 * muddatdan keyin butunlay o'chiriladi.
 */
const DRAFT_SHOW_DAYS = 2;
const DRAFT_KEEP_DAYS = 7;

/**
 * Eskirgan kirim takliflarini bazadan olib tashlash.
 *
 * Suhbat tozalagichi (purgeOld) bularga tegmaydi: taklif suhbatga
 * bog'lanmagan, o'z jadvalida turadi. Holatiga qaramay o'chiriladi —
 * tasdiqlangani ham, bekor qilingani ham bir haftadan keyin hech kimga
 * kerak emas.
 */
function purgeDrafts() {
  return Number(
    db.prepare(`DELETE FROM ai_intake_drafts WHERE created_at < datetime('now', ?)`).run(`-${DRAFT_KEEP_DAYS} days`)
      .changes
  );
}

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
  app.post<{ Body: { question?: string; deep?: boolean; image?: string } }>(
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
          image: typeof req.body?.image === 'string' ? req.body.image : undefined,
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
        const f = friendlyError(e);
        return reply.code(502).send({ error: f.code, message: f.message });
      }
    }
  );

  /**
   * Savol — javob bo'lak-bo'lak keladi (SSE).
   *
   * Oddiy /ai/ask ham qoldi: bot va sinovlar undan foydalanadi.
   * Ilova esa shu yo'ldan yuradi — do'konchi bo'sh ekranga qarab
   * o'tirmasin.
   */
  app.post<{ Body: { question?: string; deep?: boolean; image?: string } }>(
    '/ai/stream',
    { preHandler: opts.requireAi },
    async (req, reply) => {
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Nginx/proksi oqimni to'plab qo'ymasin — aks holda hammasi
        // oxirida birdaniga kelib, oqimning ma'nosi qolmaydi
        'X-Accel-Buffering': 'no',
      });
      const send = (e: AiEvent) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(e)}\n\n`);
        } catch {
          /* ulanish uzilgan bo'lsa yozib o'tirmaymiz */
        }
      };

      // Tirik ekanini bildirib turadigan bo'sh belgi.
      //
      // Uzun nakladnoyni o'qiyotganda model bir necha o'n soniya
      // davomida MATN yozmaydi — u vosita chaqiruvini tuzayotgan
      // bo'ladi. Ilova esa jim turgan oqimni uzilgan deb hisoblab,
      // "Aloqa uzilib qoldi" deb yozib qo'yardi. SSE izohi (":" bilan
      // boshlanadi) ilova tomonidan e'tiborsiz qoldiriladi, lekin
      // baytlar kelgani qorovul soatini qaytadan boshlaydi.
      const beat = setInterval(() => {
        try {
          reply.raw.write(': ping\n\n');
        } catch {
          /* ulanish uzilgan */
        }
      }, 15_000);
      beat.unref?.();

      try {
        const r = await askStream(
          {
            shopId: req.shopId!,
            employeeId: req.employeeId,
            canAct: can(req, 'ai_actions'),
            question: String(req.body?.question ?? ''),
            channel: 'app',
            deep: !!req.body?.deep,
            image: typeof req.body?.image === 'string' ? req.body.image : undefined,
          },
          send
        );
        send({ type: 'done', charged: r.charged, tools: r.tools_used });
      } catch (e: any) {
        if (e instanceof AiError) {
          send({ type: 'error', code: e.code, message: e.message });
        } else {
          req.log.error(e);
          send({ type: 'error', ...friendlyError(e) });
        }
      } finally {
        clearInterval(beat);
        reply.raw.end();
      }
    }
  );

  /**
   * Tayyor matnni Telegramga uzatish — MODELSIZ.
   *
   * Ilgari "Telegramga yubor" tugmasi butun javobni yangi savol
   * qilib modelga qaytarardi: model uni boshidan o'qib, keyin
   * yuborish vositasini chaqirardi. Bu sekin (o'n soniyalab), pullik
   * va ba'zan umuman uzilib qolardi.
   *
   * Matn allaqachon bizda turibdi — modelning bunda hech qanday ishi
   * yo'q. Endi to'g'ridan-to'g'ri ketadi: bir soniya, bepul.
   */
  app.post<{ Body: { text?: string; title?: string } }>(
    '/ai/telegram',
    { preHandler: opts.requireAi },
    async (req, reply) => {
      const text = String(req.body?.text ?? '').trim();
      if (!text) return reply.code(400).send({ error: 'empty' });
      if (text.length > 3500) return reply.code(400).send({ error: 'too_long' });

      const shop = db.prepare('SELECT name, phone, telegram_user_id FROM shops WHERE id = ?').get(req.shopId) as any;
      const link = shop?.phone
        ? (db.prepare('SELECT chat_id FROM telegram_links WHERE phone = ?').get(shop.phone) as any)
        : null;
      const chatId = link?.chat_id ?? shop?.telegram_user_id;
      if (!chatId) {
        return reply.code(400).send({
          error: 'not_linked',
          message: "Telegram ulanmagan. Botga /start yozib telefon raqamingizni ulang.",
        });
      }

      const { sendMessage, telegramEnabled, escapeHtml } = await import('../telegram.js');
      if (!telegramEnabled()) return reply.code(400).send({ error: 'tg_off', message: 'Telegram sozlanmagan' });

      const title = String(req.body?.title ?? '').trim();
      const body = (title ? `<b>${escapeHtml(title)}</b>\n\n` : '') + escapeHtml(text);
      const res: any = await sendMessage(chatId, body);
      if (res?.ok === false) return reply.code(502).send({ error: 'tg_failed', message: 'Telegram qabul qilmadi' });
      return { ok: true };
    }
  );

  /**
   * Tasdiqlanmagan ("pending") takliflar.
   *
   * Do'konchi kartadan chiqib ketsa yoki ilovani yopib qo'ysa, taklif
   * bazada turgani holda ekrandan yo'qolib ketardi va suratni qaytadan
   * yuborishga to'g'ri kelardi. Ilova ochilganda shu yo'ldan o'qib,
   * kartani joyiga qaytaradi.
   *
   * Taklif DO'KONGA tegishli, xodimga emas. Ilgari bu yerda employee_id
   * tengligi talab qilinardi, kirim_taklif vositasi esa uni umuman
   * yozmaydi (vositaga faqat shop_id beriladi) — natijada xodim
   * sifatida kirgan odam o'zi yuborgan nakladnoyni qaytarib ololmasdi.
   * Nakladnoy do'konning qog'ozi: kim suratga olgani muhim emas, kirimni
   * ega ham, kirim ruxsati bor xodim ham tasdiqlaydi. Bir taklif ikki
   * marta kirim bo'lib ketishidan tasdiqlash yo'lining o'zi saqlaydi —
   * u taklifni ishga kirishishdan oldin bandlab oladi.
   *
   * Eng YANGI beshtasi olinadi: do'konchiga hozir kerak bo'lgani —
   * hozirgina yuborgan nakladnoyi.
   */
  app.get('/ai/intake/pending', { preHandler: opts.requireAi }, async (req) => {
    const rows = db
      .prepare(
        `SELECT id, items, created_at FROM ai_intake_drafts
         WHERE shop_id = ? AND status = 'pending'
           AND created_at >= datetime('now', ?)
         ORDER BY id DESC LIMIT 5`
      )
      .all(req.shopId, `-${DRAFT_SHOW_DAYS} days`) as any[];

    const out: any[] = [];
    // Bazadan eng yangisi birinchi bo'lib keldi, ekranga esa eskidan
    // yangiga qarab chiziladi — do'konchi kartalarni o'zi yuborgan
    // tartibda ko'rsin
    for (const d of rows.reverse()) {
      // Bitta buzilgan yozuv butun ro'yxatni yiqitmasin — qolganlari
      // baribir ekranga chiqishi kerak
      try {
        out.push({ id: d.id, items: JSON.parse(d.items), created_at: d.created_at });
      } catch {
        /* o'qib bo'lmadi — o'tkazib yuboramiz */
      }
    }
    return out;
  });

  /** Saqlangan kirim taklifini o'qish */
  app.get<{ Params: { id: string } }>('/ai/intake/:id', { preHandler: opts.requireAi }, async (req, reply) => {
    const d = db
      .prepare('SELECT * FROM ai_intake_drafts WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!d) return reply.code(404).send({ error: 'not_found' });
    return { id: d.id, status: d.status, items: JSON.parse(d.items), created_at: d.created_at };
  });

  /**
   * Kirim taklifini TASDIQLASH.
   *
   * Shu yergacha omborga hech narsa tushmagan. Bu yerda ham
   * yordamchining kodi tovar yozmaydi: har qator ilovaning O'Z kirim
   * yo'liga (/products/intake) yuboriladi.
   *
   * Nega shunday: o'sha yo'lda partiya ochish, qoldiqni oshirish,
   * harakat jurnaliga yozish, birlikni tekshirish, ruxsatni tekshirish
   * — hammasi allaqachon bor va sinovdan o'tgan. Ikkinchi nusxa
   * yozilsa ular vaqt o'tib bir-biridan ajralib ketardi.
   */
  app.post<{ Body: { draft_id?: number; items?: any[] } }>(
    '/ai/intake/confirm',
    { preHandler: opts.requireAi },
    async (req, reply) => {
      const d = db
        .prepare("SELECT * FROM ai_intake_drafts WHERE id = ? AND shop_id = ?")
        .get(Number(req.body?.draft_id) || 0, req.shopId) as any;
      if (!d) return reply.code(404).send({ error: 'not_found' });
      if (d.status !== 'pending') return reply.code(409).send({ error: 'already_' + d.status });

      // Taklif ISHGA KIRISHISHDAN OLDIN bandlab olinadi.
      //
      // Ro'yxat butun do'konga ko'rinadi (yuqoriga qara), ya'ni ega
      // bilan xodim bitta kartani bir vaqtda tasdiqlashi mumkin. Har
      // qator /products/intake ga `await` bilan boradi — o'sha kutish
      // paytida ikkinchi so'rov ham holatni 'pending' ko'rib ulgurardi
      // va tovar IKKI MARTA kirim bo'lardi. Endi shart UPDATE ning
      // O'ZIDA turibdi: bandlashga faqat bittasi ulguradi, ikkinchisi
      // 409 oladi.
      const claim = db
        .prepare("UPDATE ai_intake_drafts SET status = 'done' WHERE id = ? AND status = 'pending'")
        .run(d.id);
      if (!Number(claim.changes)) {
        const cur = db.prepare('SELECT status FROM ai_intake_drafts WHERE id = ?').get(d.id) as any;
        return reply.code(409).send({ error: 'already_' + (cur?.status ?? 'done') });
      }

      // Do'konchi ekranda tuzatgan bo'lishi mumkin — o'zi yuborgan
      // ro'yxat ustun turadi, lekin uzunligi cheklanadi
      const rows: any[] = Array.isArray(req.body?.items) ? req.body!.items!.slice(0, 40) : JSON.parse(d.items);

      // SURATDAN o'qilgan kodlar. Do'konchi kartada o'zi qo'shgan kod
      // shu ro'yxatda bo'lmaydi — pastda ikkisi boshqacha ko'riladi.
      // O'qib bo'lmasa null qoladi: u holda hamma kod suratdan kelgan
      // deb hisoblanadi, ya'ni qattiqroq tekshiriladi.
      let aiCodes: Set<string> | null = null;
      try {
        aiCodes = new Set(
          (JSON.parse(d.items) as any[]).map((x) => String(x?.shtrix_kod ?? '')).filter(Boolean)
        );
      } catch {
        /* buzuq yozuv — tekshiruv qattiq qoladi */
      }

      const done: any[] = [];
      const failed: any[] = [];
      for (const r of rows) {
        let name = String(r?.nom ?? '').trim();
        const qty = Number(r?.miqdor) || 0;
        if (!name || qty <= 0) {
          failed.push({ nom: name, sabab: 'nom yoki miqdor yo\'q' });
          continue;
        }

        // Taklif tovarni omborda topgan bo'lsa (mavjud_id), kirim AYNAN
        // o'sha kartochkaga tushishi shart.
        //
        // Nega: vosita tovarni soddalashtirilgan nom bo'yicha ham
        // topadi ("Yog' 1л" ~ "Yogʻ 1 l"), /products/intake esa faqat
        // kod yoki AYNAN nom bo'yicha qidiradi. Qatorning o'z nomi bilan
        // yuborilsa ikkinchi kartochka ochilib, qoldiq ikkiga bo'linib
        // ketardi — karta "omborda bor" deb turib dublikat yasardi.
        //
        // shop_id sharti majburiy: mavjud_id ilovadan keladi, ya'ni unga
        // ishonib bo'lmaydi — begona do'konning tovari kirib qolmasin.
        const pid = Number(r?.mavjud_id) || 0;
        const stock = pid
          ? (db
              .prepare('SELECT id, name, sell_price FROM products WHERE id = ? AND shop_id = ?')
              .get(pid, req.shopId) as any)
          : null;
        // Topilmasa (tovar o'chirilgan bo'lishi mumkin) qator o'z nomi
        // bilan davom etadi — bitta qator butun so'rovni yiqitmasin
        if (stock?.name) name = String(stock.name);

        // Sotuv narxi.
        //
        // Vosita nakladnoyda narx yozilmagan qatorga ombordagini qo'yib
        // beradi (sotuv_narxi_ombordan). Do'konchi taklifni ertaga
        // tasdiqlasa, shu orada ombordagi narx o'zgargan bo'lsa ham
        // taklifdagi ESKI narx qaytib yozilib, o'zgarishni bekor
        // qilardi. Shuning uchun do'konchi QO'L TEGIZMAGAN narx umuman
        // yuborilmaydi — /products/intake sell_price kelmasa ombordagi
        // narxni o'z holicha qoldiradi. Kartada qo'lda yozilgani esa
        // albatta ketadi.
        let sellPrice: number | undefined = Number(r?.sotuv_narxi) || undefined;
        if (sellPrice && stock) {
          const ombordan = !!r?.sotuv_narxi_ombordan && Number(r?.eski_sotuv_narxi) === sellPrice;
          if (ombordan || sellPrice === Number(stock.sell_price)) sellPrice = undefined;
        }

        // Kod.
        //
        // Suratdan o'qilgani tekshiruvdan O'TISHI SHART: nakladnoyning
        // "kod" ustunida ko'pincha shtrix-kod emas, yetkazuvchining
        // ichki artikuli turadi. U tovarga yozilsa /products/intake
        // orqali umumiy barcode_catalog ga ham tushib, boshqa
        // do'konlarga tarqaladi; keyingi nakladnoyda esa boshqa
        // tovarning artikuli o'sha raqamga to'g'ri kelib, qoldiq begona
        // tovarga qo'shilib ketadi (cleanBarcode ga qara). Tekshiruvni
        // vosita ham qiladi, lekin bu yerda takrorlanadi: kartada eski,
        // hali tekshirilmagan taklif turgan bo'lishi mumkin.
        //
        // Do'konchi kartada O'ZI skaner bilan o'qigan kod esa boshqa
        // gap — u taxmin emas, tovarning o'zidan olingan (skaner harfli
        // Code-128 ni ham o'qiydi), shuning uchun ilovaning boshqa
        // joylaridagi kabi o'zgarishsiz ketadi.
        const rawCode = String(r?.shtrix_kod ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32);
        const barcode =
          (aiCodes && !aiCodes.has(rawCode) ? normalizeBarcode(rawCode) : cleanBarcode(rawCode)) || undefined;

        const res = await app.inject({
          method: 'POST',
          url: '/products/intake',
          headers: { authorization: req.headers.authorization ?? '', 'content-type': 'application/json' },
          payload: {
            name,
            unit: String(r?.birlik ?? '') || undefined,
            qty,
            // Narx o'qilmagan bo'lsa YUBORILMAYDI: /products/intake
            // nol kelsa uni haqiqiy narx deb yozib, ombordagi eski
            // narxni o'chirib yuborardi
            cost_price: Number(r?.kirim_narxi) || undefined,
            sell_price: sellPrice,
            expiry_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r?.srok ?? '')) ? String(r.srok) : undefined,
            // Kod bo'lsa tovar avval SHU kod bo'yicha qidiriladi va
            // yangi tovarga darhol biriktiriladi — keyin skaner bilan
            // sotiladi
            barcode,
          },
        });
        if (res.statusCode === 200) {
          done.push({ nom: name, miqdor: qty });
        } else {
          const body: any = res.json();
          failed.push({ nom: name, sabab: body?.message ?? body?.error ?? `HTTP ${res.statusCode}` });
        }
      }

      // Bittasi ham o'tmagan bo'lsa bandlash bekor qilinadi va taklif
      // yana ochiq qoladi — do'konchi tuzatib qayta urinsin
      if (!done.length) {
        db.prepare("UPDATE ai_intake_drafts SET status = 'pending' WHERE id = ?").run(d.id);
      }
      return { ok: done.length > 0, done, failed };
    }
  );

  /** Taklifni bekor qilish */
  app.post<{ Body: { draft_id?: number } }>(
    '/ai/intake/cancel',
    { preHandler: opts.requireAi },
    async (req, reply) => {
      const d = db
        .prepare("SELECT id, status FROM ai_intake_drafts WHERE id = ? AND shop_id = ?")
        .get(Number(req.body?.draft_id) || 0, req.shopId) as any;
      if (!d) return reply.code(404).send({ error: 'not_found' });
      if (d.status === 'pending') {
        db.prepare("UPDATE ai_intake_drafts SET status = 'cancelled' WHERE id = ?").run(d.id);
      }
      return { ok: true };
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
    // Faqat ko'rinadigan narsa: vosita chaqiruvlari ekranda kerak emas.
    // Ular ham matnsiz saqlanadi (saveMsg(..., results, '')), lekin
    // surati yo'q — shuning uchun image_url sharti ularni ochib
    // qo'ymaydi. Matnsiz, faqat suratli xabar esa endi ko'rinadi.
    return db
      .prepare(
        `SELECT role, text, image_url, created_at FROM ai_messages
         WHERE chat_id = ? AND ((text IS NOT NULL AND text != '') OR image_url IS NOT NULL)
         ORDER BY id LIMIT 100`
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
    // Suhbat bilan birga uning suratlari ham ketadi — do'konchi
    // "tozaladim" degandan keyin nakladnoyi diskda qolib ketmasin
    for (const c of chats) dropChat(c.id);
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
    // Kirim takliflari alohida: ular suhbatga bog'lanmagan, shuning
    // uchun purgeOld ularga tegmaydi
    try {
      purgeDrafts();
    } catch {
      /* tozalash ishlamasa ilova to'xtamasin */
    }
  };
  run();
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}
