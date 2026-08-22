import 'dotenv/config';
import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, markOverdueDebts } from './db.js';
import { signToken, requireAuth, requireOwner, requirePerm, can, verifyToken } from './auth.js';
import { PERM_GROUPS, ALL_PERMS, PRESETS, parsePerms, cleanPerms } from './perms.js';
import { hit, reset } from './ratelimit.js';
import { parseDebtText, parseCartText } from './voice.js';
import { runReminders, startReminderScheduler } from './reminders.js';
import {
  handleUpdate, verifyInitData, telegramEnabled, setWebhook, sendMessage, sendLoginCode,
  botUsername, otpDeepLink, supplierDeepLink, sendOrderToSupplier, chatForPhone,
} from './telegram.js';
import { registerAdminRoutes, seedAdmin, requireAdmin } from './admin.js';
import { registerCatalogRoutes } from './catalog.js';
import { registerAgentRoutes } from './agents.js';
import { registerAiRoutes, startAiCleanup } from './ai/routes.js';
import { seedCatalog } from './catalogSeed.js';
import { normalizeBarcode, barcodeVariants, checkGtin, makeInStoreEan13, parseScaleBarcode, makeScaleBarcode, scaleQty } from './barcodes.js';
import { normalizePhone } from './phone.js';
import { normalizeShopType, cleanGoldPrices, goldPrice, isGold, shopProfile, lowStockApplies } from './shopTypes.js';
import { agentByPhone } from './agentcore.js';
import { noteEmployeeLogin, notifyPinAttempts, recentLogins } from './staffAlert.js';
import { addBatch, consume, restore, setTotal, batchesOf, syncProduct } from './batches.js';
import { normalizeUnit, normalizePriceQty, normalizeQty } from './units.js';
import {
  chargeShop,
  chargeAllShops,
  serviceState,
  getSetting,
  shopSetting,
  shopNumber,
  settingDefault,
  dailyPrice,
  trialThrough,
} from './billing.js';
import { issueCode, checkCode, clearCode } from './otp.js';
import { dailyFigures, reportText, sendDailyReport, startDailyReportScheduler } from './dailyReport.js';
import { runLowBalanceWarnings, startLowBalanceScheduler } from './lowBalance.js';
import { xavflarniKorsat } from './safety.js';
import { customerCode, receiptText } from './customerLink.js';
import { uzToday, uzDayShift, uzDayStartUtc, uzPeriodStartUtc, uzMonthStartUtc } from './tz.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOADS_DIR = join(__dirname, '..', 'uploads');
mkdirSync(UPLOADS_DIR, { recursive: true });

// Jurnal darajasi sozlanadigan. Har bir so'rov uchun ikkita satr yozish
// (kelgani va tugagani) diskka yozuv va JSON tuzish demak — bir vaqtda
// yuzlab so'rov kelganda bu ham sezilarli qismni yeydi. Ishlab
// chiqarishda LOG_LEVEL=warn qo'yilsa faqat muammolar yoziladi.
const logLevel = process.env.LOG_LEVEL ?? 'info';
const app = Fastify({
  logger: logLevel === 'off' ? false : { level: logLevel },
  bodyLimit: 10 * 1024 * 1024,
});

// CORS (Mini App va admin panel boshqa domendan keladi)
app.addHook('onSend', async (_req, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
});
app.options('*', async (_req, reply) => reply.code(204).send());

// Balans tugaganda xizmatni to'xtatish.
//
// Odatda O'CHIQ: balansi tugagan do'kon ogohlantirish ko'radi, lekin
// ishlashda davom etadi — savdo o'rtasida do'konni yopib qo'yish
// do'konchi uchun ham, biz uchun ham yomon. Admin panelda yoqilsa,
// yozuv amallari to'xtaydi, o'qish va balans to'ldirish esa ochiq
// qoladi (aks holda do'konchi to'lay ham olmasdi).
const OPEN_PATHS = /^\/(auth|public|balance|me|telegram|health)/;
app.addHook('preHandler', async (req, reply) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return;
  if (OPEN_PATHS.test(req.url)) return;
  const header = req.headers.authorization;
  const session = header?.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
  if (!session) return; // avtorizatsiyani o'z joyidagi tekshiruv hal qiladi
  const shop = db
    .prepare('SELECT balance, charged_through, trial_ends_at, daily_price, shop_type FROM shops WHERE id = ?')
    .get(session.shopId) as any;
  if (!shop) return;
  // To'xtatish qoidasi do'kon TURIGA qarab ham qo'yilishi mumkin:
  // zargarlik to'xtatilsin, oziq-ovqat esa ishlayversin
  if (shopSetting(shop, 'block_on_empty', '0') !== '1') return;
  if (!serviceState(shop).active) {
    reply.code(402).send({ error: 'balance_empty' });
    return reply;
  }
});

// ---------- AUTH ----------
// SMS kod 5 daqiqa amal qiladi — eskisi bilan kirib bo'lmaydi

// Kirish urinishlari cheklovi (PIN/SMS kodni terib topishning oldini oladi)
const OTP_LIMIT = { max: 5, windowMs: 10 * 60_000, blockMs: 15 * 60_000 };
const PIN_LIMIT = { max: 7, windowMs: 10 * 60_000, blockMs: 15 * 60_000 };

/**
 * Kirish kodini so'rash.
 *
 * Kod SMS emas, Telegram bot orqali boradi: pul ketmaydi, darhol yetadi
 * va raqam allaqachon Telegram tomonidan tasdiqlangan bo'ladi.
 *
 * Raqam hali botga ulanmagan bo'lsa — kod baribir yasab qo'yiladi va
 * javobda botga havola qaytadi. Do'konchi botda raqamini yuborishi
 * bilan o'sha kutayotgan kod darhol jo'natiladi (telegram.ts).
 */
app.post<{ Body: { phone: string } }>('/auth/request-otp', async (req, reply) => {
  // Raqam har doim +998XXXXXXXXX ko'rinishida saqlanadi — aks holda
  // "939228889" va "+998939228889" ikki xil do'kon bo'lib ketardi
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return reply.code(400).send({ error: 'invalid_phone' });
  const code = issueCode(phone);
  // Ilgari ulangan bo'lsa kod darhol ketadi — do'konchi hech narsa
  // bosmaydi. Ulanmagan bo'lsa ilova havolani ko'rsatadi: bosilishi
  // bilan bot ochiladi, /start o'zi bosiladi va kod keladi.
  const sent = telegramEnabled() ? await sendLoginCode(phone, code) : false;
  return {
    ok: true,
    via: sent ? 'telegram' : 'none',
    bot: botUsername() || undefined,
    deep_link: otpDeepLink(phone) ?? undefined,
    // Kodni javobda qaytarish FAQAT sinov rejimida (OTP_DEV_CODE
    // qo'yilganda). Ilgari u NODE_ENV ga bog'liq edi va serverda o'sha
    // o'zgaruvchi yo'qligi uchun kod har kimga ochiq qaytardi — raqamni
    // bilgan odam so'rov yuborib, kodni javobdan o'qib olardi.
    dev_hint: process.env.OTP_DEV_CODE ? code : undefined,
  };
});

/**
 * Taklif kodi: 'ARABIC12' yoki 'ref12'. Faqat mavjud do'konning
 * kodi qabul qilinadi — yo'q do'kon yozilsa bonus hech qachon
 * to'lanmaydi va sabab ham ko'rinmaydi.
 */
function cleanRefCode(raw: unknown): string | null {
  const m = /^(?:ref|ARABIC)(\d{1,9})$/i.exec(String(raw ?? '').trim());
  if (!m) return null;
  const id = Number(m[1]);
  const exists = db.prepare('SELECT 1 FROM shops WHERE id = ?').get(id);
  return exists ? `ARABIC${id}` : null;
}

app.post<{ Body: { phone: string; code: string; shop_name?: string; ref?: string; init_data?: string } }>(
  '/auth/verify',
  async (req, reply) => {
  const { code, shop_name, ref, init_data } = req.body;
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return reply.code(400).send({ error: 'invalid_phone' });
  const gate = hit(`otp:${phone}`, OTP_LIMIT);
  if (!gate.ok) return reply.code(429).send({ error: 'too_many_attempts', retry_after: gate.retryAfter });
  const verdict = checkCode(phone, code);
  if (verdict === 'invalid') return reply.code(400).send({ error: 'invalid_code' });
  if (verdict === 'expired') return reply.code(400).send({ error: 'code_expired' });
  clearCode(phone);
  reset(`otp:${phone}`);
  let shop = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
  if (!shop) {
    // Yangi do'kon bepul kunlar bilan boshlaydi: shu muddatda balansdan
    // hech narsa yechilmaydi, do'konchi hammasini ko'rib chiqadi
    const start = trialThrough();
    // Taklif kodi tozalanadi: ilova yuborgan matn to'g'ridan-to'g'ri
    // bazaga tushmasin va mavjud bo'lmagan do'kon yozilib qolmasin
    const refCode = cleanRefCode(ref);
    const info = db
      .prepare(
        `INSERT INTO shops (phone, name, referred_by, charged_through, trial_ends_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(phone, shop_name ?? 'Mening do‘konim', refCode, start.charged_through, start.trial_ends_at);
    shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(info.lastInsertRowid);
    // Botga allaqachon ulangan bo'lsa — yangi do'konga ham bog'laymiz,
    // shunda kechki hisobot va eslatmalar shu chatga boradi
    const link = db.prepare('SELECT telegram_user_id, language FROM telegram_links WHERE phone = ?').get(phone) as any;
    if (link?.telegram_user_id) {
      db.prepare('UPDATE shops SET telegram_user_id = ?, language = COALESCE(?, language) WHERE id = ?')
        .run(link.telegram_user_id, link.language ?? null, shop.id);
      shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(shop.id);
    }
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
  const phone = normalizePhone(req.body?.phone);
  const pin = (req.body?.pin ?? '').trim();
  if (!phone || !/^\d{4}$/.test(pin)) return reply.code(400).send({ error: 'phone_and_pin_required' });
  const gate = hit(`pin:${phone}`, PIN_LIMIT);
  if (!gate.ok) {
    // PIN tanlab ko'rilyapti — egasi buni darhol bilishi kerak.
    // Xabar blok BOSHLANGANDA bir marta ketadi, har rad etilgan
    // so'rovda emas.
    if (gate.justBlocked) {
      const target = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
      if (target) notifyPinAttempts(target, gate.attempts ?? PIN_LIMIT.max).catch(() => {});
    }
    return reply.code(429).send({ error: 'too_many_attempts', retry_after: gate.retryAfter });
  }

  const shop = db.prepare('SELECT * FROM shops WHERE phone = ?').get(phone) as any;
  if (!shop) return reply.code(404).send({ error: 'shop_not_found' });
  if (shop.is_blocked) return reply.code(403).send({ error: 'blocked', reason: shop.blocked_reason });

  const emp = db
    .prepare("SELECT * FROM employees WHERE shop_id = ? AND pin = ? AND is_active = 1 AND role = 'seller'")
    .get(shop.id, pin) as any;
  if (!emp) return reply.code(401).send({ error: 'invalid_pin' });
  reset(`pin:${phone}`);

  // Kirish yozib qo'yiladi va egasiga xabar beriladi. Telegram javobini
  // kutmaymiz — xodim kassaga tezroq kirsin.
  noteEmployeeLogin(shop, emp).catch(() => {});

  return {
    token: signToken(shop.id, emp.id),
    shop,
    employee: { id: emp.id, name: emp.name, role: emp.role },
  };
});

// ---------- ADMIN PANEL ----------
registerAdminRoutes(app);
registerAgentRoutes(app);

// ---------- MARKAZIY KATALOG ----------
registerCatalogRoutes(app, { requireAuth, uploadsDir: UPLOADS_DIR });

// ---------- AI YORDAMCHI ----------
registerAiRoutes(app, { requireAi: requirePerm('ai'), requireAdmin });
startAiCleanup();

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

// Ilovaning quyi qismida ko'rsatiladigan yordam kontaktlari.
// Admin panelning sozlamalaridan olinadi — kirmagan foydalanuvchi ham ko'radi.
app.get('/public/support', async () => ({
  phone: getSetting('support_phone', ''),
  telegram: getSetting('support_telegram', ''),
}));

/**
 * Yuguruvchi e'lon — ilovaning tepasida menyu tagidan o'tib turadi.
 *
 * Sozlamalarda bitta JSON bo'lib saqlanadi: matn, ranglar, o'lcham,
 * tezlik va kimga ko'rinishi. Bitta yozuv bo'lgani uchun alohida
 * jadval ochilmadi — ustun qo'shish har o'zgarishda migratsiya
 * talab qilardi, JSON esa yangi maydonni erkin qabul qiladi.
 *
 * Ochiq yo'l: e'lon hammaga mo'ljallangan, kirmagan foydalanuvchi ham
 * ko'rishi mumkin. O'chirilgan bo'lsa bo'sh qaytadi.
 */
app.get('/public/announce', async () => {
  try {
    const raw = getSetting('announce', '');
    if (!raw) return { enabled: false };
    const a = JSON.parse(raw);
    if (!a?.enabled || !String(a?.text ?? '').trim()) return { enabled: false };
    return {
      enabled: true,
      text: String(a.text),
      color: String(a.color ?? '#ffffff'),
      bg1: String(a.bg1 ?? '#3e97f7'),
      bg2: String(a.bg2 ?? '#6b5cf6'),
      size: Number(a.size) || 14,
      weight: String(a.weight ?? 'bold'),
      speed: Number(a.speed) || 22,
      audience: String(a.audience ?? 'all'),
    };
  } catch {
    // Buzuq JSON butun ilovani to'xtatmasin — e'lon shunchaki
    // ko'rinmaydi
    return { enabled: false };
  }
});

// ---------- PROFIL ----------
app.get('/me', { preHandler: requireAuth }, async (req) => {
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) as any;
  // Xodim sessiyasida ilova cheklangan ko'rinishga o'tadi
  const employee = req.employeeId
    ? { ...(db.prepare('SELECT id, name, role FROM employees WHERE id = ?').get(req.employeeId) as any),
        permissions: req.perms ?? [] }
    : null;
  // Xizmat holati — ilova "yana N kun yetadi" deb ko'rsatadi.
  // Yechim shu yerda ham qilinadi: do'konchi ilovani ochishi bilan
  // hisob bugungi kunga keltiriladi.
  chargeShop(req.shopId!);
  const fresh = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) as any;
  return { ...fresh, employee, service: serviceState(fresh) };
});

app.patch<{ Body: Record<string, unknown> }>('/me', { preHandler: requirePerm('settings') }, async (req) => {
  const allowed = ['name', 'owner_name', 'address', 'language', 'card_number', 'daily_goal', 'report_enabled', 'report_hour', 'allow_negative_stock', 'staff_notify', 'shop_type', 'gold_prices'];
  // Karta raqami — do'konga pul tushadigan joy. Sozlamalar ruxsati
  // berilgan xodim ham unga tegmaydi: bitta raqam almashtirilsa
  // to'lovlar begona kartaga ketib qolardi.
  const forbidden = req.employeeId ? ['card_number'] : [];
  for (const key of allowed) {
    if (forbidden.includes(key)) continue;
    if (key in req.body) {
      // Tur ro'yxatdan tashqariga chiqmasin, gramm narxlari esa buzuq
      // JSON bo'lib qolmasin — ikkovi ham ilova ko'rinishini boshqaradi
      let value: any = req.body[key];
      if (key === 'shop_type') value = normalizeShopType(value);
      if (key === 'gold_prices') value = cleanGoldPrices(value);
      db.prepare(`UPDATE shops SET ${key} = ? WHERE id = ?`).run(value, req.shopId);
    }
  }
  // Bepul kunlar do'kon TURIGA qarab boshqacha bo'lishi mumkin
  // (zargarlikka 30, oziq-ovqatga 14). Tur esa ro'yxatdan o'tgandan
  // KEYIN, sozlash oynasida tanlanadi — o'sha paytda muddat umumiy
  // qoida bo'yicha allaqachon qo'yilgan bo'ladi. Shuning uchun tur
  // birinchi marta tanlanganda muddat qayta hisoblanadi.
  //
  // Faqat hali TEGILMAGAN do'konda: sinov davri davom etayotgan va
  // balansda birorta harakat bo'lmagan bo'lsa. Aks holda pul to'lagan
  // do'konning hisobini o'zgartirib yuborardik.
  if ('shop_type' in req.body) {
    const sh = db.prepare('SELECT shop_type, trial_ends_at, charged_through FROM shops WHERE id = ?').get(req.shopId) as any;
    const used = (db
      .prepare('SELECT COUNT(*) AS c FROM balance_transactions WHERE shop_id = ?')
      .get(req.shopId) as any).c as number;
    if (!used && sh?.trial_ends_at && sh.trial_ends_at >= uzToday()) {
      const start = trialThrough(new Date(), sh.shop_type);
      db.prepare('UPDATE shops SET charged_through = ?, trial_ends_at = ? WHERE id = ?').run(
        start.charged_through,
        start.trial_ends_at,
        req.shopId
      );
    }
  }

  // Til o'zgarsa botdagi xabarlar ham o'sha tilga o'tsin — do'konchi
  // ilovada ruschani tanlab, botdan o'zbekcha xabar olmasin
  if ('language' in req.body) {
    const shop = db.prepare('SELECT phone FROM shops WHERE id = ?').get(req.shopId) as any;
    if (shop?.phone) {
      db.prepare('UPDATE telegram_links SET language = ? WHERE phone = ?').run(req.body.language, shop.phone);
    }
  }
  return db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId);
});

// ---------- BALANS ----------

/**
 * Mijozga yangi qarz yozish mumkinmi?
 * Bloklangan bo'lsa yoki kredit limiti oshib ketsa — sabab qaytadi.
 */
function checkCreditAllowed(
  shopId: number,
  customerId: number,
  addAmount: number
): { ok: true } | { ok: false; error: string; details?: any } {
  const c = db
    .prepare('SELECT id, name, credit_limit, is_blocked FROM customers WHERE id = ? AND shop_id = ?')
    .get(customerId, shopId) as any;
  if (!c) return { ok: false, error: 'customer_not_found' };
  if (c.is_blocked) return { ok: false, error: 'customer_blocked', details: { name: c.name } };
  const limit = Number(c.credit_limit) || 0;
  if (limit > 0) {
    const cur = (db
      .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM debts WHERE customer_id = ? AND status != 'paid'`)
      .get(customerId) as any).s as number;
    if (cur + addAmount > limit) {
      return {
        ok: false,
        error: 'credit_limit_exceeded',
        details: { name: c.name, limit, current: cur, adding: addAmount },
      };
    }
  }
  return { ok: true };
}

app.get('/balance', { preHandler: requireOwner }, async (req) => {
  // Ko'rsatishdan oldin yechim: do'konchi ekranda har doim bugungi
  // haqiqiy holatni ko'radi, jarayon qachon ishga tushganidan qat'i nazar
  chargeShop(req.shopId!);
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) as any;
  const transactions = db
    .prepare('SELECT * FROM balance_transactions WHERE shop_id = ? ORDER BY created_at DESC, id DESC LIMIT 50')
    .all(req.shopId);
  return {
    ...serviceState(shop),
    transactions,
    // Yuborilgan cheklar: do'konchi "kutilyapti / tasdiqlandi / rad
    // etildi" holatini o'z ekranida ko'rib tursin
    receipts: db
      .prepare(
        `SELECT id, amount, image_url, agent_phone, note, review_note, status, created_at
           FROM payment_receipts WHERE shop_id = ? ORDER BY id DESC LIMIT 20`
      )
      .all(req.shopId),
    min_topup: shopNumber(shop, 'min_topup_amount'),
    // Tez to'ldirish tugmalari: do'konchi summani terib o'tirmasin
    presets: topupPresets(shop),
    // To'lov kartasi — do'konchi shu yerga pul o'tkazadi
    card: getSetting('topup_card', ''),
    card_holder: getSetting('topup_card_holder', ''),
  };
});

/** Tez to'ldirish summalari — kunlik narxdan kelib chiqadi, shunda
 *  har biri "necha kunga yetadi" degan tushunarli ma'noga ega bo'ladi */
function topupPresets(shop?: { daily_price?: number | null; shop_type?: string | null } | null): { amount: number; days: number }[] {
  const price = dailyPrice(shop);
  if (price <= 0) return [];
  return [30, 60, 90, 180, 365].map((days) => ({
    // 1000 so'mgacha yaxlitlanadi — "99 000" ko'rinishi "98 700" dan yaxshi
    amount: Math.round((days * price) / 1000) * 1000,
    days,
  }));
}

/**
 * Balansni O'ZI to'ldirish — faqat ishlab chiqish/sinov uchun.
 *
 * Bu yo'l haqiqiy to'lov emas: hech qanday to'lov tizimi tekshirmaydi,
 * shunchaki balansga son qo'shadi. Ochiq qolsa har bir do'kon egasi
 * o'ziga cheksiz pul yozib olardi (ilovada tugmasi yo'q, lekin so'rovni
 * qo'lda yuborish qiyin emas). Shuning uchun ALLOW_SELF_TOPUP=1
 * qo'yilmagan bo'lsa umuman yo'q.
 *
 * Haqiqiy oqim: do'konchi kartaga o'tkazadi va chek yuboradi
 * (/balance/receipt), admin panelda ko'rib tasdiqlaydi.
 */
app.post<{ Body: { amount: number } }>('/balance/topup', { preHandler: requireOwner }, async (req, reply) => {
  if (process.env.ALLOW_SELF_TOPUP !== '1') return reply.code(404).send({ error: 'not_found' });
  const amount = Math.round(req.body.amount);
  if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
  const topupShop = db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
  const minTopup = shopNumber(topupShop, 'min_topup_amount');
  if (amount < minTopup) return reply.code(400).send({ error: 'below_minimum', min: minTopup });
  db.prepare('UPDATE shops SET balance = balance + ? WHERE id = ?').run(amount, req.shopId);
  db.prepare("INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'topup', ?, ?)").run(
    req.shopId,
    amount,
    "Balans to'ldirildi"
  );
  // To'ldirishdan keyin darhol yechib qo'yamiz: xizmat to'xtab turgan
  // bo'lsa do'konchi kutmasdan ishlashda davom etadi
  chargeShop(req.shopId!);
  const shop = db.prepare('SELECT * FROM shops WHERE id = ?').get(req.shopId) as any;
  return serviceState(shop);
});

/**
 * To'lov cheki: do'konchi kartaga pul o'tkazgach suratini yuboradi.
 *
 * Bu yerda balansga HECH NARSA qo'shilmaydi — faqat ariza qoldiriladi.
 * Pulni admin panelda odam ko'rib tasdiqlaydi. Aks holda "chek
 * yubordim" degan har kim balansini o'zi to'ldirib olardi.
 */
app.post<{ Body: { amount?: number; image?: string; agent_phone?: string; note?: string } }>(
  '/balance/receipt',
  { preHandler: requireOwner },
  async (req, reply) => {
    const amount = Math.round(Number(req.body?.amount) || 0);
    if (amount <= 0) return reply.code(400).send({ error: 'amount_required' });

    // Ko'rilmagan chek to'planib qolmasin: bittasi ko'rilmaguncha
    // beshtadan ko'p yuborilmaydi
    const pending = (db
      .prepare("SELECT COUNT(*) AS c FROM payment_receipts WHERE shop_id = ? AND status = 'new'")
      .get(req.shopId) as any).c;
    if (pending >= 5) return reply.code(429).send({ error: 'too_many_pending' });

    const url = req.body?.image ? saveUpload(String(req.body.image), 'chek') : null;
    if (req.body?.image && !url) return reply.code(400).send({ error: 'invalid_image' });

    const phone = String(req.body?.agent_phone ?? '').replace(/[^\d+]/g, '').slice(0, 20);
    const info = db
      .prepare(
        'INSERT INTO payment_receipts (shop_id, amount, image_url, agent_phone, note) VALUES (?, ?, ?, ?, ?)'
      )
      .run(req.shopId, amount, url, phone || null, String(req.body?.note ?? '').trim().slice(0, 300) || null);

    // Raqam kimnikiligini DARHOL aytamiz: do'konchi xato raqam yozgan
    // bo'lsa shu yerda bilib, tuzatib yuboradi
    const agent = phone ? agentByPhone(phone) : null;
    return {
      ok: true,
      id: Number(info.lastInsertRowid),
      agent_name: agent?.name ?? null,
    };
  }
);

// ---------- DASHBOARD ----------
app.get('/dashboard', { preHandler: requireAuth }, async (req) => {
  // Kechikkan qarzlarni belgilash bu yerdan olib tashlandi: u BARCHA
  // do'konlarning qarzlarini yangilaydigan yozuv amali edi va bosh
  // sahifa har ochilganda ishga tushardi. Endi soatiga bir marta,
  // fonda bajariladi (pastdagi jadval) — sana kuniga bir marta
  // o'zgargani uchun bu yetarli.
  // Bugungi kun chegaralari — UTC'da, indeks ishlashi uchun
  const dayFrom = uzDayStartUtc(0);
  const dayTo = uzDayStartUtc(1);
  // "Qarzlarni ko'rish" ruxsati. Ilgari bu kalit ro'yxatda bor edi,
  // ilovada "Qarzlarni ko'rish" degan tugma bo'lib chiqardi, LEKIN uni
  // hech kim tekshirmasdi: o'chirilgan bo'lsa ham xodim bosh sahifada
  // butun qarz daftarini ko'raverardi. Ishlamaydigan tugma esa
  // do'kon egasini "himoyalanganman" deb aldab qo'yardi.
  const qarzKorsin = can(req, 'debts');
  const owedToMe = db
    .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM debts WHERE shop_id = ? AND status != 'paid'`)
    .get(req.shopId) as any;
  const iOwe = db
    .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM supplier_debts WHERE shop_id = ? AND status != 'paid'`)
    .get(req.shopId) as any;
  const dueToday = qarzKorsin
    ? db
        .prepare(
          `SELECT d.*, c.name AS customer_name FROM debts d JOIN customers c ON c.id = d.customer_id
           WHERE d.shop_id = ? AND d.status != 'paid' AND d.due_date = date('now', '+5 hours') ORDER BY d.amount DESC`
        )
        .all(req.shopId)
    : [];
  const overdue = qarzKorsin
    ? db
        .prepare(
          `SELECT d.*, c.name AS customer_name FROM debts d JOIN customers c ON c.id = d.customer_id
           WHERE d.shop_id = ? AND d.status = 'overdue' ORDER BY d.due_date ASC`
        )
        .all(req.shopId)
    : [];
  const shopRow = db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
  // hideCost: `SELECT *` kirim narxini ham olib keladi. Bosh sahifa
  // ruxsat talab qilmaydi (requireAuth), ya'ni cost_view'siz xodim
  // ham ochadi — tannarx shu yerdan sizib chiqardi.
  //
  // Yakka buyumli do'konda (telefon, zargarlik) "kam qoldi" ma'nosiz:
  // har kartochka bitta buyum, chegara bilan solishtirish esa butun
  // omborni ro'yxatga chiqarardi.
  const lowStock = lowStockApplies(shopRow)
    ? hideCost(
        req,
        db
          .prepare(
            `SELECT * FROM products WHERE shop_id = ? AND stock <= low_stock_threshold ORDER BY stock ASC LIMIT 10`
          )
          .all(req.shopId) as any[]
      )
    : [];
  const expiringSoon = hideCost(req, (
    db
      .prepare(
        `SELECT *, CAST(julianday(expiry_date) - julianday(date('now', '+5 hours')) AS INTEGER) AS days_left
         FROM products WHERE shop_id = ? AND expiry_date IS NOT NULL
         AND expiry_date <= date('now', '+5 hours', '+7 days') ORDER BY expiry_date ASC LIMIT 10`
      )
      .all(req.shopId) as any[]
  ).map((p) => ({ ...p, price_after_discount: priceWithDiscount(p) })));
  // Oxirgi sotuvlar — mahsulot nomlari bilan
  const recentSales = db
    .prepare(
      `SELECT s.id, s.total, s.payment_type, s.created_at, c.name AS customer_name,
              (SELECT GROUP_CONCAT(p.name || ' ×' || CASE WHEN si.qty = CAST(si.qty AS INTEGER)
                               THEN CAST(CAST(si.qty AS INTEGER) AS TEXT)
                               ELSE CAST(si.qty AS TEXT) END, ', ')
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
       FROM sales WHERE shop_id = ? AND created_at >= ? AND created_at < ?`
    )
    .get(req.shopId, dayFrom, dayTo) as any;
  const todayProfit = db
    .prepare(
      `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= ? AND s.created_at < ?`
    )
    .get(req.shopId, dayFrom, dayTo) as any;
  // Bugungi qaytarishlar — tushum va foydadan chiqariladi
  const todayReturns = returnsTotals(req.shopId!, '-0 days');
  // Bugungi xarajatlar — "foyda" faqat tovar ustamasi bo'lib qolmasligi uchun
  const todayExpenses = (db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE shop_id = ? AND spent_at = date('now', '+5 hours')`)
    .get(req.shopId) as any).s as number;
  const monthExpenses = (db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses
       WHERE shop_id = ? AND spent_at >= date('now', '+5 hours', 'start of month')`
    )
    .get(req.shopId) as any).s as number;
  // Oxirgi 7 kunlik savdo (grafik uchun) — bo'sh kunlar 0 bilan to'ldiriladi
  const raw = db
    .prepare(
      `SELECT date(created_at, '+5 hours') AS d, COALESCE(SUM(total), 0) AS revenue
       FROM sales WHERE shop_id = ? AND created_at >= ?
       GROUP BY date(created_at, '+5 hours')`
    )
    .all(req.shopId, uzDayStartUtc(-6)) as any[];
  const byDay = new Map(raw.map((r) => [r.d, r.revenue]));
  const week: { day: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const key = uzDayShift(-i);
    week.push({ day: key, revenue: byDay.get(key) ?? 0 });
  }
  // Foyda va xarajat — do'kon egasining raqami. Ruxsati yo'q xodimga
  // umuman yuborilmaydi: ilovada yashirish yetarli emas, so'rovni
  // brauzerdan ham ko'rish mumkin.
  const seeMoney = can(req, 'reports');
  const today = {
    ...todayStats,
    revenue: todayStats.revenue - todayReturns.total,
    returns: todayReturns.total,
    ...(seeMoney
      ? {
          profit: todayProfit.profit - (todayReturns.total - todayReturns.cost),
          expenses: todayExpenses,
          net_profit: todayProfit.profit - (todayReturns.total - todayReturns.cost) - todayExpenses,
        }
      : {}),
  };

  return {
    // Qarz summalari ham "Qarzlarni ko'rish" ruxsatiga bog'liq
    owed_to_me: qarzKorsin ? owedToMe.s : 0,
    i_owe: qarzKorsin ? iOwe.s : 0,
    net: qarzKorsin ? owedToMe.s - iOwe.s : 0,
    debts_visible: qarzKorsin,
    today,
    // Kunlik maqsad — bosh sahifada va kassada progress bo'lib ko'rinadi
    daily_goal: (db.prepare('SELECT daily_goal FROM shops WHERE id = ?').get(req.shopId) as any)?.daily_goal ?? 0,
    ...(seeMoney ? { month_expenses: monthExpenses } : {}),
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

// Qarzdorning "ishonch reytingi".
//
// Do'konchining eng katta qo'rquvi — qarz berib, pul qaytmay qolishi.
// Shu qo'rquvni yumshatish uchun har bir mijozning o'tmishdagi to'lov
// odatini bitta belgiga jamlaymiz: yashil (aytgan vaqtida to'laydi),
// sariq (kechiktiradi), qizil (hozir ham qarzi muddatidan o'tgan).
// Tarixi yo'q mijoz "yangi" — bu ogohlantirish emas, shunchaki
// "hali bilmaymiz" degani.
export type TrustLevel = 'new' | 'good' | 'warn' | 'bad';

export interface Trust {
  level: TrustLevel;
  closed: number;        // yopilgan qarzlar soni
  on_time: number;       // ulardan o'z vaqtida to'langani
  late: number;          // kechikib to'langani
  avg_late_days: number; // kechikkanlarining o'rtacha kechikishi
  overdue_days: number;  // hozirgi eng uzun kechikish (kunlarda)
}

const TRUST_SQL = `
  SELECT c.id AS customer_id,
         SUM(CASE WHEN d.status = 'paid' THEN 1 ELSE 0 END) AS closed,
         SUM(CASE WHEN d.status = 'paid' AND d.due_date IS NOT NULL
                   AND date(COALESCE((SELECT MAX(dp.created_at) FROM debt_payments dp WHERE dp.debt_id = d.id),
                                     d.created_at), '+5 hours') > date(d.due_date)
             THEN 1 ELSE 0 END) AS late,
         COALESCE(SUM(CASE WHEN d.status = 'paid' AND d.due_date IS NOT NULL
                   AND date(COALESCE((SELECT MAX(dp.created_at) FROM debt_payments dp WHERE dp.debt_id = d.id),
                                     d.created_at), '+5 hours') > date(d.due_date)
             THEN julianday(date(COALESCE((SELECT MAX(dp.created_at) FROM debt_payments dp WHERE dp.debt_id = d.id),
                                          d.created_at), '+5 hours')) - julianday(d.due_date)
             ELSE 0 END), 0) AS late_days_sum,
         COALESCE(MAX(CASE WHEN d.status != 'paid' AND d.due_date IS NOT NULL AND date(d.due_date) < date('now', '+5 hours')
             THEN julianday(date('now', '+5 hours')) - julianday(d.due_date) ELSE 0 END), 0) AS overdue_days
  FROM customers c LEFT JOIN debts d ON d.customer_id = c.id
  WHERE c.shop_id = ? GROUP BY c.id`;

function levelOf(closed: number, late: number, overdueDays: number): TrustLevel {
  // Hozir ham ikki haftadan ortiq kechikayotgan bo'lsa — boshqa hech narsa
  // muhim emas, bu qizil
  if (overdueDays >= 14) return 'bad';
  // Yopilgan qarzning yarmidan ko'pi kechikkan bo'lsa ham qizil
  if (closed >= 2 && late / closed > 0.5) return 'bad';
  if (closed === 0) return overdueDays > 0 ? 'warn' : 'new';
  if (overdueDays > 0) return 'warn';
  if (late / closed > 0.2) return 'warn';
  return 'good';
}

/** Do'kondagi barcha mijozlar uchun reyting — bitta so'rovda */
function trustMap(shopId: number): Map<number, Trust> {
  const rows = db.prepare(TRUST_SQL).all(shopId) as any[];
  const map = new Map<number, Trust>();
  for (const r of rows) {
    const closed = Number(r.closed) || 0;
    const late = Number(r.late) || 0;
    const overdue = Math.floor(Number(r.overdue_days) || 0);
    map.set(r.customer_id, {
      level: levelOf(closed, late, overdue),
      closed,
      on_time: closed - late,
      late,
      avg_late_days: late > 0 ? Math.round(Number(r.late_days_sum) / late) : 0,
      overdue_days: overdue,
    });
  }
  return map;
}

app.get('/customers', { preHandler: requirePerm('customers') }, async (req) => {
  const rows = db
    .prepare(
      `SELECT c.*, COALESCE(SUM(CASE WHEN d.status != 'paid' THEN d.amount - d.paid_amount END), 0) AS balance,
              MAX(d.created_at) AS last_activity
       FROM customers c LEFT JOIN debts d ON d.customer_id = c.id
       WHERE c.shop_id = ? GROUP BY c.id ORDER BY balance DESC`
    )
    .all(req.shopId) as any[];
  // Qarz qoldig'i va ishonch reytingi qarz tarixidan chiqadi —
  // "Qarzlarni ko'rish" ruxsati yo'q xodimga ular ko'rsatilmaydi
  if (!can(req, 'debts')) {
    return rows.map((c) => ({ ...c, balance: 0, last_activity: null, trust: null }));
  }
  const trust = trustMap(req.shopId);
  return rows.map((c) => ({ ...c, trust: trust.get(c.id) ?? null }));
});

app.post<{ Body: { name: string; phone?: string; language?: string; note?: string } }>(
  '/customers',
  { preHandler: requirePerm('customer_add') },
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
    const shop = db.prepare('SELECT default_reminder_mode, shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
    const info = db
      .prepare(
        'INSERT INTO customers (shop_id, name, phone, language, note, reminder_mode) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(req.shopId, name.trim(), phone, language ?? 'uz', note ?? null, shop.default_reminder_mode);
    return db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  }
);

/** Raqam bo'yicha mijozni tanish — kassada qarzga sotayotganda kerak.
 *  Do'konchi ismini qaytadan yozmaydi, tizim esa uning to'lov odatini
 *  darhol ko'rsatadi. */
app.get<{ Querystring: { phone?: string } }>('/customers/lookup', { preHandler: requirePerm('customers') }, async (req) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone) return { customer: null };
  const customer = db
    .prepare('SELECT * FROM customers WHERE shop_id = ? AND phone = ?')
    .get(req.shopId, phone) as any;
  if (!customer) return { customer: null };
  const balance = db
    .prepare(
      `SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM debts
       WHERE customer_id = ? AND status != 'paid'`
    )
    .get(customer.id) as any;
  return { customer: { ...customer, balance: balance.s, trust: trustMap(req.shopId).get(customer.id) ?? null } };
});

/** Mijozni Telegram'ga ulash havolasi.
 *
 *  Do'konchi shu havolani mijozga yuboradi. Mijoz bosgach, bot uni shu
 *  yozuvga bog'laydi va chek o'ziga kela boshlaydi. Kod imzolangan —
 *  raqamni o'zgartirib boshqa odamning xaridlarini ko'rib bo'lmaydi. */
app.get<{ Params: { id: string } }>('/customers/:id/telegram', { preHandler: requirePerm('customers') }, async (req, reply) => {
  const customer = db
    .prepare('SELECT id, name, telegram_user_id FROM customers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId) as any;
  if (!customer) return reply.code(404).send({ error: 'not_found' });
  const bot = process.env.TELEGRAM_BOT_USERNAME ?? '';
  const code = customerCode(customer.id);
  return {
    linked: !!customer.telegram_user_id,
    code,
    // Bot nomi sozlanmagan bo'lsa havola tuzib bo'lmaydi — ilova buni
    // aytadi, jimgina buzuq havola bermaydi
    link: bot ? `https://t.me/${bot}?start=c${code}` : null,
  };
});

/** Ulanishni uzish — mijoz so'rasa yoki raqam boshqa odamga o'tsa */
app.delete<{ Params: { id: string } }>('/customers/:id/telegram', { preHandler: requirePerm('customer_edit') }, async (req, reply) => {
  const customer = db
    .prepare('SELECT id FROM customers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId) as any;
  if (!customer) return reply.code(404).send({ error: 'not_found' });
  db.prepare('UPDATE customers SET telegram_user_id = NULL WHERE id = ?').run(customer.id);
  return { ok: true };
});

app.get<{ Params: { id: string } }>('/customers/:id', { preHandler: requirePerm('customers') }, async (req, reply) => {
  const customer = db
    .prepare('SELECT * FROM customers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!customer) return reply.code(404).send({ error: 'not_found' });
  // Qarz tarixi "Qarzlarni ko'rish" ruxsatiga bog'liq: mijozlar
  // ro'yxatiga kira oladigan xodim uning qarz daftarini ko'rishi
  // shart emas
  if (!can(req, 'debts')) return { ...customer, debts: [], balance: 0, trust: null };
  const debts = db
    .prepare('SELECT * FROM debts WHERE customer_id = ? ORDER BY created_at DESC')
    .all(req.params.id) as any[];
  const balance = debts
    .filter((d) => d.status !== 'paid')
    .reduce((s, d) => s + (d.amount - d.paid_amount), 0);
  const trust = trustMap(req.shopId).get(Number(req.params.id)) ?? null;
  return { ...customer, debts, balance, trust };
});

app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
  '/customers/:id',
  { preHandler: requirePerm('customer_edit') },
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
    // Kredit limiti va bloklash — pDaftar'dagi kabi nazorat
    if ('credit_limit' in req.body) {
      db.prepare('UPDATE customers SET credit_limit = ? WHERE id = ?').run(
        Math.max(0, Math.round(Number((req.body as any).credit_limit) || 0)),
        req.params.id
      );
    }
    if ('is_blocked' in req.body) {
      db.prepare('UPDATE customers SET is_blocked = ? WHERE id = ?').run(
        (req.body as any).is_blocked ? 1 : 0,
        req.params.id
      );
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
app.delete<{ Params: { id: string } }>('/customers/:id', { preHandler: requirePerm('customer_del') }, async (req, reply) => {
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
app.get<{ Querystring: { limit?: string } }>('/reminders', { preHandler: requirePerm('reminders') }, async (req) => {
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
  const shop = db.prepare('SELECT default_reminder_mode, shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
  const stats = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN channel = 'call' THEN 1 ELSE 0 END) AS calls
       FROM reminder_logs WHERE shop_id = ?`
    )
    .get(req.shopId) as any;
  // Shu oyda yuborilgan SMS va qo'ng'iroqlar hamda ularning taxminiy narxi —
  // do'konchi qancha sarflayotganini oldindan bilib turadi
  const month = db
    .prepare(
      `SELECT SUM(CASE WHEN channel != 'call' THEN 1 ELSE 0 END) AS sms,
              SUM(CASE WHEN channel = 'call' THEN 1 ELSE 0 END) AS calls
       FROM reminder_logs
       WHERE shop_id = ? AND status = 'sent' AND created_at >= ?`
    )
    .get(req.shopId, uzMonthStartUtc()) as any;
  // Narxlar do'kon turiga qarab boshqacha bo'lishi mumkin
  const smsPrice = shopNumber(shop, 'sms_price');
  const callPrice = shopNumber(shop, 'call_price');
  const cost = {
    sms_count: month.sms ?? 0,
    call_count: month.calls ?? 0,
    sms_price: smsPrice,
    call_price: callPrice,
    total: (month.sms ?? 0) * smsPrice + (month.calls ?? 0) * callPrice,
  };
  return { logs, default_mode: shop.default_reminder_mode, stats, cost };
});

// Eslatmalarni hozir hisoblab chiqish (dev/qo'lda tekshirish uchun)
app.post('/reminders/run', { preHandler: requirePerm('reminders') }, async (req) => {
  return runReminders(req.shopId);
});

// Do'kon bo'yicha standart rejim — yangi mijozlarga qo'llanadi
app.patch<{ Body: { default_reminder_mode: string; apply_to_all?: boolean } }>(
  '/reminders/settings',
  { preHandler: requirePerm('reminders') },
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
  { preHandler: requirePerm('debt_add') },
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
        const shop = db.prepare('SELECT default_reminder_mode, shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
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
    // Bloklangan mijoz yoki limitdan oshsa — qarz yozilmaydi
    const allowed = checkCreditAllowed(req.shopId!, cid!, Math.round(amount));
    if (!allowed.ok) return reply.code(409).send({ error: allowed.error, details: allowed.details });

    const info = db
      .prepare(
        'INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(req.shopId, cid, Math.round(amount), note ?? null, due_date ?? null, source ?? 'manual', req.employeeId);
    const debt = db.prepare('SELECT * FROM debts WHERE id = ?').get(info.lastInsertRowid) as any;
    // Qarz kimga yozilgani qaytadi: raqam bo'yicha eski mijoz topilgan bo'lsa,
    // do'konchi boshqa ism yozgan bo'lsa ham buni ko'rib turadi
    return { ...debt, customer: { id: customer.id, name: customer.name } };
  }
);

app.post<{ Params: { id: string }; Body: { amount: number } }>(
  '/debts/:id/payments',
  { preHandler: requirePerm('debt_pay') },
  async (req, reply) => {
    const debt = db.prepare('SELECT * FROM debts WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
    if (!debt) return reply.code(404).send({ error: 'not_found' });
    const amount = Math.round(req.body.amount);
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    // Qolgan qarzdan ortiq to'lov qabul qilinmaydi. Ilgari qabul
    // qilinardi va ortiqchasi hech qayerda ko'rinmasdi: mijoz ortiqcha
    // bergan pul jimgina yo'qolardi, do'konchi esa "to'landi" degan
    // yozuvni ko'rib qo'yaverardi.
    const qoldiq = Math.max(0, Number(debt.amount) - Number(debt.paid_amount));
    if (qoldiq <= 0) return reply.code(409).send({ error: 'already_paid' });
    if (amount > qoldiq) {
      return reply.code(400).send({ error: 'amount_too_big', details: { left: qoldiq } });
    }
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

/** Ovozdan savat: "uch dona non, bitta sut" -> savat satrlari.
 *
 *  Tovarlar do'konning o'z ro'yxatidan qidiriladi — shuning uchun
 *  tahlil serverda, mahsulot bazasiga yaqin joyda turadi. */
app.post<{ Body: { text: string } }>('/voice/cart', { preHandler: requirePerm('pos') }, async (req, reply) => {
  const text = (req.body?.text ?? '').trim();
  if (!text) return reply.code(400).send({ error: 'text_required' });
  const products = db
    // Qoldiq ham qaytadi: savatga qo'shishda qoldiqdan oshib ketmasligini
    // tekshirish uchun kerak (yo'qligi savat summasini NaN qilgan edi)
    .prepare('SELECT id, name, unit, price_qty, sell_price, discount_percent, stock, barcode, image_url FROM products WHERE shop_id = ?')
    .all(req.shopId) as any[];
  const lines = parseCartText(text, products);
  return {
    raw: text,
    lines,
    found: lines.filter((l) => l.product).length,
    missing: lines.filter((l) => !l.product).map((l) => l.said),
  };
});

// ---------- POSTAVSHIKLAR ----------
app.get('/suppliers', { preHandler: requirePerm('suppliers') }, async (req) => {
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
  { preHandler: requirePerm('suppliers') },
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
    // Ta'minotchi SHU do'konnikimi. Ilgari supplier_id tekshirilmasdi:
    // begona do'konning ta'minotchisi raqamini yozib yuborgan odam
    // o'sha do'konning hisobiga qarz qo'shib qo'yishi mumkin edi
    // (yozuv shop_id bilan tushardi, lekin ta'minotchi begona bo'lardi
    // va ikkala do'konning hisoboti ham buzilardi).
    const own = db.prepare('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?').get(sid, req.shopId) as any;
    if (!own) return reply.code(404).send({ error: 'supplier_not_found' });
    const info = db
      .prepare('INSERT INTO supplier_debts (shop_id, supplier_id, amount, note, due_date) VALUES (?, ?, ?, ?, ?)')
      .run(req.shopId, sid, Math.round(amount), note ?? null, due_date ?? null);
    return db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(info.lastInsertRowid);
  }
);

/**
 * Ta'minotchini botga ulash holati va bir martalik havola.
 *
 * "Postavshiklar" ekranida turadi: buyurtma yuborishga urinib
 * ko'rmasdan oldin ham ta'minotchini ulab qo'yish mumkin bo'lsin.
 */
app.get<{ Params: { id: string } }>('/suppliers/:id/telegram', { preHandler: requirePerm('suppliers') }, async (req, reply) => {
  const sup = db
    .prepare('SELECT id, name, phone FROM suppliers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId) as any;
  if (!sup) return reply.code(404).send({ error: 'not_found' });
  const phone = normalizePhone(sup.phone ?? '');
  return {
    name: sup.name,
    phone: phone || null,
    linked: phone ? chatForPhone(phone) !== null : false,
    // Bot nomi sozlanmagan yoki raqam yo'q bo'lsa havola tuzib bo'lmaydi
    invite: phone ? supplierDeepLink(phone) : null,
  };
});

app.get<{ Params: { id: string } }>('/suppliers/:id', { preHandler: requirePerm('suppliers') }, async (req, reply) => {
  const supplier = db
    .prepare('SELECT * FROM suppliers WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!supplier) return reply.code(404).send({ error: 'not_found' });
  const debts = db
    .prepare('SELECT * FROM supplier_debts WHERE supplier_id = ? ORDER BY created_at DESC')
    .all(req.params.id) as any[];
  // Qolgan qarz — ro'yxatdagi kabi shu yerda ham qaytadi, aks holda
  // kartochkada summa o'rniga bo'sh joy chiqardi
  const balance = debts.reduce((s, d) => s + (d.amount - d.paid_amount), 0);
  return { ...supplier, balance, debts };
});

app.post<{ Params: { id: string }; Body: { amount: number } }>(
  '/supplier-debts/:id/payments',
  { preHandler: requirePerm('suppliers') },
  async (req, reply) => {
    const debt = db
      .prepare('SELECT * FROM supplier_debts WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!debt) return reply.code(404).send({ error: 'not_found' });
    const amount = Math.round(req.body.amount);
    if (!amount || amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    // Qolgan qarzdan ortiq to'lov qabul qilinmaydi (mijoz qarzida ham shunday)
    const qoldiq = Math.max(0, Number(debt.amount) - Number(debt.paid_amount));
    if (qoldiq <= 0) return reply.code(409).send({ error: 'already_paid' });
    if (amount > qoldiq) {
      return reply.code(400).send({ error: 'amount_too_big', details: { left: qoldiq } });
    }
    const newPaid = debt.paid_amount + amount;
    const status = newPaid >= debt.amount ? 'paid' : debt.status;
    db.prepare('UPDATE supplier_debts SET paid_amount = ?, status = ? WHERE id = ?').run(newPaid, status, debt.id);
    return db.prepare('SELECT * FROM supplier_debts WHERE id = ?').get(debt.id);
  }
);

/** Bir necha tovarga birdan chegirma qo'yish/olib tashlash.
 *
 *  Srogi yaqin tovarlar ro'yxatidan "bularning hammasiga 20%" deb
 *  bir bosishda qo'yiladi — bittalab kirib chiqish do'konchini charchatadi. */
app.post<{ Body: { ids: number[]; percent: number } }>(
  '/products/discount',
  { preHandler: requirePerm('price_edit') },
  async (req, reply) => {
    const ids = (req.body?.ids ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return reply.code(400).send({ error: 'ids_required' });
    const percent = Math.min(90, Math.max(0, Math.round(Number(req.body?.percent) || 0)));
    const marks = ids.map(() => '?').join(',');
    const info = db
      .prepare(`UPDATE products SET discount_percent = ? WHERE shop_id = ? AND id IN (${marks})`)
      .run(percent, req.shopId, ...ids);
    return { ok: true, percent, changed: Number(info.changes) };
  }
);

// ---------- TA'MINOTCHIGA BUYURTMA ----------
//
// Do'konchi "nima tugadi" ni bilishi kam — unga "qancha buyurtma qilay"
// degan javob kerak. Shuning uchun miqdorni o'zimiz taklif qilamiz:
// oxirgi 30 kunda qancha sotilgan bo'lsa, shuncha tezlikda yana 14 kunga
// yetadigan qilib. Sotuv tarixi bo'lmasa — kam qolgan chegarasidan
// kelib chiqamiz, ya'ni hech bo'lmasa chegaradan ikki baravar ko'p.
const ORDER_DAYS = 14;

function suggestQty(row: { stock: number; low_stock_threshold: number; sold30: number }): number {
  const daily = row.sold30 / 30;
  const byVelocity = daily * ORDER_DAYS;
  const byThreshold = row.low_stock_threshold * 2;
  const target = Math.max(byVelocity, byThreshold);
  const need = target - row.stock;
  if (need <= 0) return 1;
  // Butun donaga yaxlitlaymiz — do'konchi "3.7 dona" buyurtma qilmaydi
  return Math.max(1, Math.ceil(need));
}

/** Buyurtma taklifi: kam qolgan tovarlar + tavsiya etilgan miqdor */
app.get('/orders/suggest', { preHandler: requirePerm('orders') }, async (req) => {
  // Yakka buyumli do'konda taklif ma'nosiz: aynan o'sha uzuk yoki
  // aynan o'sha IMEI qaytib kelmaydi
  if (!lowStockApplies(db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any)) return [];
  const rows = db
    .prepare(
      `SELECT p.id, p.name, p.unit, p.stock, p.low_stock_threshold, p.cost_price,
              p.supplier_id, s.name AS supplier_name,
              COALESCE((SELECT SUM(si.qty) FROM sale_items si
                        JOIN sales sa ON sa.id = si.sale_id
                        WHERE si.product_id = p.id
                          AND sa.created_at >= ?), 0) AS sold30
       FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.shop_id = ? AND p.stock <= p.low_stock_threshold
       ORDER BY (p.stock - p.low_stock_threshold) ASC, p.name`
    )
    .all(uzDayStartUtc(-29), req.shopId) as any[];
  // Tavsiya miqdori tannarxsiz ham hisoblanadi — kirim narxi esa
  // ruxsati yo'q xodimga chiqmasin
  return hideCost(req, rows.map((r) => ({ ...r, suggest_qty: suggestQty(r) })));
});

/** Saqlangan buyurtmalar — do'konchi o'tgan safargisini takrorlaydi */
app.get('/orders', { preHandler: requirePerm('orders') }, async (req) => {
  const orders = db
    .prepare(
      `SELECT o.*, s.name AS supplier_name, s.phone AS supplier_phone
       FROM orders o LEFT JOIN suppliers s ON s.id = o.supplier_id
       WHERE o.shop_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 30`
    )
    .all(req.shopId) as any[];
  const items = db
    .prepare(
      `SELECT oi.* FROM order_items oi JOIN orders o ON o.id = oi.order_id
       WHERE o.shop_id = ? ORDER BY oi.id`
    )
    .all(req.shopId) as any[];
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }));
});

app.post<{ Body: { supplier_id?: number | null; note?: string; items: { product_id?: number; name: string; unit?: string; qty: number }[] } }>(
  '/orders',
  { preHandler: requirePerm('orders') },
  async (req, reply) => {
    const { supplier_id, note, items } = req.body ?? ({} as any);
    if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'items_required' });
    if (supplier_id) {
      const own = db.prepare('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?').get(supplier_id, req.shopId);
      if (!own) return reply.code(400).send({ error: 'supplier_not_found' });
    }
    const id = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO orders (shop_id, supplier_id, note, created_by) VALUES (?, ?, ?, ?)')
        .run(req.shopId, supplier_id ?? null, note?.trim() || null, req.employeeId ?? null);
      const orderId = Number(info.lastInsertRowid);
      const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, unit, qty) VALUES (?, ?, ?, ?, ?)');
      for (const it of items) {
        if (!it.name?.trim() || !(it.qty > 0)) continue;
        ins.run(orderId, it.product_id ?? null, it.name.trim(), it.unit || 'dona', it.qty);
      }
      return orderId;
    })();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
    return { ...order, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id) };
  }
);

app.patch<{ Params: { id: string }; Body: { status?: string } }>(
  '/orders/:id',
  { preHandler: requirePerm('orders') },
  async (req, reply) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
    if (!order) return reply.code(404).send({ error: 'not_found' });
    const status = req.body?.status;
    if (status && !['draft', 'sent', 'received'].includes(status)) {
      return reply.code(400).send({ error: 'bad_status' });
    }
    if (status) {
      db.prepare(
        `UPDATE orders SET status = ?,
           sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END,
           received_at = CASE WHEN ? = 'received' THEN datetime('now') ELSE received_at END
         WHERE id = ?`
      ).run(status, status, status, order.id);
    }
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  }
);

/**
 * Buyurtmani ta'minotchining Telegramiga yuborish.
 *
 * Ta'minotchi bot bilan ulangan bo'lsa — matn to'g'ridan-to'g'ri boradi.
 * Ulanmagan bo'lsa, uni bir marta ulaydigan havolani qaytaramiz;
 * ilova o'sha havolani SMS bilan yuborishni taklif qiladi.
 */
app.post<{ Body: { supplier_id?: number | null; text?: string } }>(
  '/orders/send-telegram',
  { preHandler: requirePerm('orders') },
  async (req, reply) => {
    const text = String(req.body?.text ?? '').trim();
    if (!text) return reply.code(400).send({ error: 'no_text' });
    // Telegram bitta xabarga 4096 belgi ruxsat beradi
    if (text.length > 3500) return reply.code(400).send({ error: 'too_long' });

    const supplierId = req.body?.supplier_id;
    const supplier = supplierId
      ? (db.prepare('SELECT * FROM suppliers WHERE id = ? AND shop_id = ?').get(supplierId, req.shopId) as any)
      : null;
    if (supplierId && !supplier) return reply.code(404).send({ error: 'not_found' });

    const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(req.shopId) as any;
    const phone = normalizePhone(supplier?.phone ?? '');

    if (!supplier) return { sent: false, reason: 'no_supplier' };
    if (!phone) return { sent: false, reason: 'no_phone', name: supplier.name };
    if (!telegramEnabled()) return { sent: false, reason: 'bot_off', name: supplier.name };

    const sent = await sendOrderToSupplier(phone, shop?.name ?? 'BuySale', text);
    if (sent) return { sent: true, name: supplier.name };
    return {
      sent: false,
      reason: 'not_linked',
      name: supplier.name,
      phone,
      invite: supplierDeepLink(phone) ?? undefined,
    };
  }
);

app.delete<{ Params: { id: string } }>('/orders/:id', { preHandler: requirePerm('orders') }, async (req, reply) => {
  const order = db.prepare('SELECT id FROM orders WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!order) return reply.code(404).send({ error: 'not_found' });
  db.prepare('DELETE FROM order_items WHERE order_id = ?').run(req.params.id);
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// ---------- XODIMLAR ----------
app.get('/employees', { preHandler: requireOwner }, async (req) => {
  const rows = db
    .prepare('SELECT id, name, role, pin, permissions, is_active, created_at FROM employees WHERE shop_id = ? ORDER BY created_at')
    .all(req.shopId) as any[];
  return rows.map((e) => ({ ...e, permissions: parsePerms(e.permissions) }));
});

/** Ilova ruxsat ro'yxatini o'zi yozib o'tirmasin — serverdan oladi */
app.get('/employees/permissions', { preHandler: requireOwner }, async () => ({
  groups: PERM_GROUPS,
  all: ALL_PERMS,
  presets: PRESETS,
}));

// Kim, qachon kirdi — "Xodimlar" ekranidagi ro'yxat
app.get('/employees/logins', { preHandler: requireOwner }, async (req) => {
  return recentLogins(req.shopId!, 30);
});

app.post<{ Body: { name: string; pin: string; permissions?: string[] } }>('/employees', { preHandler: requireOwner }, async (req, reply) => {
  const { name, pin } = req.body;
  if (!name?.trim() || !/^\d{4}$/.test(pin ?? '')) return reply.code(400).send({ error: 'name_and_4digit_pin_required' });
  // Ruxsat berilmasa — oddiy sotuvchi to'plami
  const perms = req.body.permissions ? cleanPerms(req.body.permissions) : PRESETS.seller;
  const info = db
    .prepare("INSERT INTO employees (shop_id, name, pin, role, permissions) VALUES (?, ?, ?, 'seller', ?)")
    .run(req.shopId, name.trim(), pin, JSON.stringify(perms));
  const row = db.prepare('SELECT id, name, role, permissions, is_active FROM employees WHERE id = ?').get(info.lastInsertRowid) as any;
  return { ...row, permissions: parsePerms(row.permissions) };
});

app.patch<{ Params: { id: string }; Body: { is_active?: number; name?: string; pin?: string; permissions?: string[] } }>(
  '/employees/:id',
  { preHandler: requireOwner },
  async (req, reply) => {
    const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
    if (!emp) return reply.code(404).send({ error: 'not_found' });
    if (req.body.is_active !== undefined) {
      db.prepare('UPDATE employees SET is_active = ? WHERE id = ?').run(req.body.is_active ? 1 : 0, req.params.id);
    }
    if (req.body.name?.trim()) {
      db.prepare('UPDATE employees SET name = ? WHERE id = ?').run(req.body.name.trim(), req.params.id);
    }
    if (req.body.pin !== undefined) {
      if (!/^\d{4}$/.test(req.body.pin)) return reply.code(400).send({ error: 'bad_pin' });
      db.prepare('UPDATE employees SET pin = ? WHERE id = ?').run(req.body.pin, req.params.id);
    }
    // Ruxsat o'zgarishi darhol kuchga kiradi: xodim keyingi bosishdayoq
    // to'xtaydi, tokeni eskirishini kutib o'tirilmaydi (auth.ts).
    if (req.body.permissions !== undefined) {
      db.prepare('UPDATE employees SET permissions = ? WHERE id = ?')
        .run(JSON.stringify(cleanPerms(req.body.permissions)), req.params.id);
    }
    const row = db.prepare('SELECT id, name, role, permissions, is_active FROM employees WHERE id = ?').get(req.params.id) as any;
    return { ...row, permissions: parsePerms(row.permissions) };
  }
);

/** Xodimni butunlay o'chirish — ishdan bo'shagan odam ro'yxatda qolmasin */
app.delete<{ Params: { id: string } }>('/employees/:id', { preHandler: requireOwner }, async (req, reply) => {
  const emp = db.prepare('SELECT * FROM employees WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!emp) return reply.code(404).send({ error: 'not_found' });
  // Uning sotuvlari va yozuvlari o'chmaydi — faqat bog'lanish uziladi,
  // aks holda kunlik hisobot va tarix buzilardi
  for (const table of ['debts', 'debt_payments', 'stock_movements', 'sales', 'returns', 'expenses', 'orders']) {
    db.prepare(`UPDATE ${table} SET created_by = NULL WHERE created_by = ?`).run(emp.id);
  }
  db.prepare('DELETE FROM employees WHERE id = ?').run(emp.id);
  return { ok: true };
});

// ---------- REFERAL ----------
app.get('/referral', { preHandler: requireOwner }, async (req) => {
  const code = `ARABIC${req.shopId}`;
  const invited = db.prepare('SELECT COUNT(*) AS c FROM shops WHERE referred_by = ?').get(code) as any;
  // Haqiqatda to'langan bonuslar — "nechta odam chaqirdim" emas,
  // "qancha pul oldim". Ilgari bu yerda "1 oy bepul obuna" deb
  // yozilardi, holbuki hech qanday obuna berilmasdi.
  const paid = db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS s FROM balance_transactions WHERE shop_id = ? AND type = 'referral'")
    .get(req.shopId) as any;
  const me = db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
  const bonus = Math.round(Number(shopSetting(me, 'referral_bonus', settingDefault('referral_bonus')))) || 0;
  // Taklif havolasi — ULANGAN botning nomidan. Ilgari ilovada bot nomi
  // qo'lda yozib qo'yilgan edi ('ArabicOneBot') va bot nomi
  // o'zgarganda taklif qilingan odam yo'q botga tushardi.
  const bot = botUsername();
  return {
    code,
    invited_count: invited.c,
    bonus,
    earned: Number(paid.s) || 0,
    bot: bot || undefined,
    // startapp — mini-ilovani ochadi va kodni ilovaga uzatadi
    // (start bo'lsa faqat bot suhbati ochilardi)
    link: bot ? `https://t.me/${bot}?startapp=ref${req.shopId}` : undefined,
    reward_text: bonus > 0
      ? `Chaqirgan do'koningiz to'lov qilsa — balansingizga ${bonus.toLocaleString('ru-RU').replace(/\u00a0/g, ' ')} so'm`
      : "Do'stingizni taklif qiling",
  };
});

// ---------- OMBOR ----------

/**
 * Kirim (zakupka) narxini yashirish.
 *
 * Do'konchi uchun bu eng maxfiy raqam: xodim tovar qanchaga
 * olinganini bilsa, foyda ham, ta'minotchi ham oshkor bo'ladi.
 * Shuning uchun ruxsati bo'lmagan xodimga umuman yuborilmaydi —
 * ilovada yashirish yetarli emas, so'rovni qo'lda ham ko'rish mumkin.
 */
function hideCost<T>(req: FastifyRequest, row: T): T;
function hideCost<T>(req: FastifyRequest, row: T[]): T[];
function hideCost(req: FastifyRequest, row: any): any {
  if (can(req, 'cost_view')) return row;
  const strip = (r: any) => {
    if (!r || typeof r !== 'object') return r;
    const { cost_price, profit, ...rest } = r;
    return rest;
  };
  return Array.isArray(row) ? row.map(strip) : strip(row);
}


/**
 * Kirimda narx maydoni BO'SH qoldirilgan bo'lsa eskisi saqlanadi.
 *
 * Ilova bo'sh maydonni 0 qilib yuboradi, `??` esa faqat null/undefined
 * da eskisiga qaytadi — natijada mavjud tovarga qayta kirim qilinganda
 * tannarx JIMGINA NOLGA tushib qolardi. Undan keyin foyda hisoboti
 * butun sotuv summasini foyda deb ko'rsatardi.
 *
 * Ayniqsa yomoni xodim uchun: cost_view ruxsati yo'q xodimga tannarx
 * umuman yuborilmaydi, ya'ni maydon doim bo'sh — har kirimida
 * do'konning tannarxi o'chib ketardi.
 *
 * `req` berilsa, ruxsatsiz xodimning yuborgan narxi umuman inobatga
 * olinmaydi.
 */
function keepPrice(
  yangi: number | null | undefined,
  eski: number | null | undefined,
  req?: FastifyRequest
): number | null {
  if (req && !can(req, 'cost_view')) return eski ?? null;
  const n = Number(yangi);
  // 0 va bo'sh — "kiritilmagan" degani
  if (!Number.isFinite(n) || n <= 0) return eski ?? null;
  return Math.round(n);
}

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

/** Chegirma qo'llangandan keyingi narx.
 *
 *  Chegirma sotuv narxini o'zgartirmaydi — u alohida foiz bo'lib turadi,
 *  shunda chegirma olib tashlansa eski narx o'z-o'zidan qaytadi va
 *  do'konchi asl narxni qaytadan yozib o'tirmaydi. */
export function priceWithDiscount(product: { sell_price: number; discount_percent?: number }): number {
  const pct = Math.min(90, Math.max(0, Number(product.discount_percent) || 0));
  if (!pct) return product.sell_price;
  return roundPrice((product.sell_price * (100 - pct)) / 100);
}

/**
 * Chegirmadan keyingi narxni yaxlitlash.
 *
 * Kassada chaqa bilan ovora bo'lmaslik uchun 100 so'mgacha yaxlitlanadi
 * — LEKIN bu faqat narx katta bo'lganda to'g'ri. Narx BIR OMBOR
 * BIRLIGI uchun saqlanadi: millilitr, gramm yoki metrda yuritiladigan
 * tovarda u juda kichik bo'lishi mumkin.
 *
 * Ilgari qadam har doim 100 edi va shu sabab:
 *   250 so'm/g dan 10% chegirma -> 225 -> 200, ya'ni amalda 20%
 *   40 so'm/ml dan 10% chegirma -> 36  -> 0,   ya'ni TEKIN
 *
 * Endi qadam narxga qarab tanlanadi va hech qachon narxning 1% idan
 * oshmaydi — chegirma do'konchi qo'ygan foizdan sezilarli farq qilmaydi.
 */
function roundPrice(v: number): number {
  const step = v >= 10000 ? 100 : v >= 1000 ? 10 : 1;
  return Math.round(v / step) * step;
}

app.get<{ Querystring: { q?: string; barcode?: string; category?: string } }>(
  '/products',
  { preHandler: requirePerm('stock') },
  async (req) => {
  const { q, barcode, category } = req.query;
  if (barcode) {
    const product = findByBarcode(req.shopId, barcode);
    if (product) return [hideCost(req, product)];
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
  const where = ['p.shop_id = ?'];
  const params: any[] = [req.shopId];
  if (q) {
    where.push('p.name LIKE ?');
    params.push(`%${q}%`);
  }
  if (category) {
    where.push('p.category = ?');
    params.push(category);
  }
  return hideCost(
    req,
    db
      .prepare(
        `SELECT p.*, s.name AS supplier_name FROM products p
         LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE ${where.join(' AND ')} ORDER BY p.name${q ? ' LIMIT 50' : ''}`
      )
      .all(...params) as any[]
  );
});

// Do'kondagi kategoriyalar ro'yxati (tanlash uchun)
app.get('/categories', { preHandler: requireAuth }, async (req) =>
  db
    .prepare(
      `SELECT category AS name, COUNT(*) AS count FROM products
       WHERE shop_id = ? AND category IS NOT NULL AND category <> ''
       GROUP BY category ORDER BY category`
    )
    .all(req.shopId)
);

// Kod bo'yicha to'liq javob: tovar topildimi, katalogda bormi, kod o'zi to'g'rimi.
// Kassa shu javobga qarab nima qilishni biladi.
app.get<{ Querystring: { code?: string } }>('/barcodes/lookup', { preHandler: requireAuth }, async (req) => {
  const code = normalizeBarcode(req.query.code);
  if (!code) return { code: '', valid: null, product: null, catalog: null };

  // Tarozi bosgan yorliqmi? Bo'lsa og'irlik/narx kodning ichida turadi —
  // tovarni PLU bo'yicha topamiz va miqdorni o'zimiz hisoblaymiz.
  //
  // Tarozi YO'Q do'konda bu tekshiruv o'tkazib yuboriladi: 21/22 bilan
  // boshlanadigan har qanday kod (zargarlik birkasi ham bo'lishi
  // mumkin) "tarozi yorlig'i" deb o'qilib, sotuvchiga "PLU topilmadi"
  // degan noto'g'ri xato chiqarardi.
  const scaleShop = shopProfile(db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any).scale;
  const scale = scaleShop ? parseScaleBarcode(code) : null;
  if (scale) {
    const byPlu = db
      .prepare('SELECT * FROM products WHERE shop_id = ? AND plu = ?')
      .get(req.shopId, scale.plu) as any;
    if (byPlu) {
      return {
        code,
        valid: true,
        product: hideCost(req, byPlu),
        catalog: null,
        scale: { ...scale, qty: scaleQty(scale, priceWithDiscount(byPlu)) },
      };
    }
    // PLU biriktirilmagan — do'konchiga aynan shuni aytamiz
    return { code, valid: true, product: null, catalog: null, scale: { ...scale, qty: 0 } };
  }

  const product = hideCost(req, findByBarcode(req.shopId, code) ?? null);
  const variants = barcodeVariants(code);
  const marks = variants.map(() => '?').join(',');
  const catalog = product
    ? null
    : (db.prepare(`SELECT barcode, name, unit FROM barcode_catalog WHERE barcode IN (${marks}) LIMIT 1`).get(...variants) ?? null);
  return { code, valid: checkGtin(code), product, catalog };
});

/**
 * Do'kon uchun bo'sh ichki kod.
 *
 * Kirim ekranida tovar hali saqlanmagan bo'ladi, ya'ni unga kod
 * biriktirib bo'lmaydi — lekin yorliq chop etish uchun kod KERAK.
 * Shuning uchun bu yerda faqat "hech kimga tegishli bo'lmagan" kod
 * beriladi; u bazaga tovar saqlanganda yoziladi.
 *
 * "20" bilan boshlanadi — bu oraliq korxona ichida erkin ishlatish
 * uchun ajratilgan, ya'ni zavod kodi bilan urishmaydi.
 */
app.get('/barcodes/new', { preHandler: requirePerm('intake') }, async (req, reply) => {
  for (let attempt = 0; attempt < 60; attempt++) {
    // Tasodifiy qism: ketma-ket kirimlar bir xil kod olib qolmasin
    const candidate = makeInStoreEan13(req.shopId!, Math.floor(Math.random() * 900000) + 100000, attempt);
    if (!findByBarcode(req.shopId, candidate)) return { barcode: candidate };
  }
  return reply.code(409).send({ error: 'no_free_code' });
});

app.post<{
  Body: {
    barcode?: string; name: string; unit?: string; price_qty?: number; cost_price?: number;
    sell_price?: number; qty?: number; expiry_date?: string; image?: string; category?: string;
    catalog_id?: number;
    /* zargarlik buyumi — yorliqdagi to'rt qator */
    proba?: string; weight_g?: number; size?: string; stone?: string;
  };
}>(
  '/products/intake',
  { preHandler: requirePerm('intake') },
  async (req, reply) => {
    const { name, cost_price, qty, expiry_date, image, category } = req.body as any;
    let sell_price = (req.body as any).sell_price;

    // ── Zargarlik buyumi.
    //
    // Yorliqdan ko'chiriladigan to'rt qator: proba, massa, o'lcham,
    // vstavka. Narx yozilmagan bo'lsa massa × probasining gramm
    // narxidan hisoblanadi (do'kon sozlamasidagi gold_prices).
    // Do'konchi o'zi narx qo'ysa — o'shanisi qoladi: ishlov haqi
    // qo'shilgan bo'lishi mumkin.
    const shopRow = db.prepare('SELECT shop_type, gold_prices FROM shops WHERE id = ?').get(req.shopId) as any;
    const proba = String(req.body?.proba ?? '').replace(/\D/g, '').slice(0, 4) || null;
    const weightRaw = Number(String(req.body?.weight_g ?? '').replace(',', '.'));
    const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : null;
    const size = String(req.body?.size ?? '').trim().slice(0, 40) || null;
    const stone = String(req.body?.stone ?? '').trim().slice(0, 40) || null;
    if (isGold(shopRow) && !sell_price) {
      const auto = goldPrice(shopRow, proba, weight);
      if (auto) sell_price = auto;
    }
    // Katalogdan olingan bo'lsa — qaysi yozuvdan. Bu tovarning rasmi va
    // to'liq nomi keyin ham katalogdan yangilanib turishi uchun kerak.
    const catalogId = Number(req.body?.catalog_id) || null;
    // Birlik qat'iy ro'yxatdan — erkin matn kirib qolsa hisobot buzilardi
    const unit = normalizeUnit(req.body.unit);
    // Narx qaysi miqdorga aytilgani. Narxning o'zi ilovada 1 birlikka
    // aylantirilib yuboriladi, bu esa faqat "qanday ko'rsatilsin" xotirasi.
    const priceQty = normalizePriceQty(req.body.price_qty ?? 1, unit);
    const barcode = normalizeBarcode(req.body.barcode);
    if (!name?.trim()) return reply.code(400).send({ error: 'name_required' });

    // 1) kod bo'yicha, 2) nom bo'yicha qidiramiz — shunda bir tovar
    // ikki marta yaratilib, qoldig'i ikkiga bo'linib ketmaydi.
    //
    // LEKIN yakka buyumli do'konda (zargarlik, telefon) nom bo'yicha
    // birlashtirish ZARAR: ikkita "Uzuk" — biri 4.6 g 585, ikkinchisi
    // 3.1 g 750 — butunlay boshqa buyum. Bir kartochkaga qo'shilsa
    // ikkinchisining probasi ham, massasi ham yo'qolardi. Shuning
    // uchun bunday do'konda faqat KOD bo'yicha topiladi: bir birka
    // bir buyum degani.
    const unique = shopProfile(shopRow).unique;
    let product = (barcode ? findByBarcode(req.shopId, barcode) : undefined) as any;
    if (!product && !unique) {
      product = db
        .prepare('SELECT * FROM products WHERE shop_id = ? AND name = ? COLLATE NOCASE')
        .get(req.shopId, name.trim()) as any;
    }

    // Katalogdan kelgan bo'lsa — o'sha yozuvga bog'langan tovarni ham
    // qidiramiz: do'konchi nomini o'zgartirgan bo'lsa ham topilsin
    if (!product && catalogId && !unique) {
      product = db
        .prepare('SELECT * FROM products WHERE shop_id = ? AND catalog_id = ?')
        .get(req.shopId, catalogId) as any;
    }

    if (!product) {
      // Kirim huquqi bor xodim tanish tovarni qabul qila oladi, lekin
      // omborga YANGI tovar kartochkasini ochish alohida ruxsat: aks
      // holda har xato yozilgan nom yangi tovar bo'lib qolaverardi.
      if (!can(req, 'product_add')) {
        return reply.code(403).send({ error: 'no_permission', permission: 'product_add' });
      }
      // "Kam qoldi" chegarasi do'kon turidan: zargarlik va telefon
      // do'konida har buyum yakka (qoldiq 1-2), 5 chegara qo'yilsa
      // butun ombor doim "kam qolgan" bo'lib turardi va ogohlantirish
      // ma'nosini yo'qotardi.
      const lowDefault = shopProfile(shopRow).lowStock;
      const info = db
        .prepare(
          `INSERT INTO products
             (shop_id, barcode, name, unit, price_qty, cost_price, sell_price, stock, low_stock_threshold, expiry_date, category, catalog_id, proba, weight_g, size, stone)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.shopId, barcode || null, name.trim(), unit, priceQty,
          cost_price ?? 0, sell_price ?? 0, lowDefault, expiry_date ?? null, category?.trim() || null,
          catalogId, proba, weight, size, stone
        );
      product = db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid);
    } else if (category?.trim() && !product.category) {
      db.prepare('UPDATE products SET category = ? WHERE id = ?').run(category.trim(), product.id);
      product.category = category.trim();
    }
    // Yorliqdan kelgan ma'lumot mavjud kartochkaga ham yoziladi
    // (ilgari kodsiz kiritilgan buyum keyin yorliq bilan kelishi mumkin)
    for (const [key, value] of [['proba', proba], ['weight_g', weight], ['size', size], ['stone', stone]] as const) {
      if (value != null && product && product[key] == null) {
        db.prepare(`UPDATE products SET ${key} = ? WHERE id = ?`).run(value as any, product.id);
        product[key] = value;
      }
    }
    if (product && barcode && !product.barcode) {
      // ilgari kodsiz yozilgan tovarga endi kod berildi
      db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(barcode, product.id);
      product.barcode = barcode;
    }

    // Kodsiz katalog yozuviga do'konchi kod biriktirsa — markazga ham
    // yozamiz. Keyingi do'kon o'sha kodni skanerlaganda tayyor topadi.
    if (barcode && catalogId) {
      const cat = db.prepare('SELECT id, barcode FROM catalog_products WHERE id = ?').get(catalogId) as any;
      if (cat && !cat.barcode) {
        const taken = db.prepare('SELECT id FROM catalog_products WHERE barcode = ?').get(barcode);
        if (!taken) db.prepare('UPDATE catalog_products SET barcode = ? WHERE id = ?').run(barcode, catalogId);
      }
    }

    if (barcode) {
      attachBarcode(req.shopId, product.id, barcode);
      // markaziy katalogni boyitamiz
      if (!db.prepare('SELECT 1 FROM barcode_catalog WHERE barcode = ?').get(barcode)) {
        db.prepare('INSERT INTO barcode_catalog (barcode, name, unit, created_by_shop) VALUES (?, ?, ?, ?)').run(
          barcode,
          name.trim(),
          unit,
          req.shopId
        );
      }
    }
    // Miqdor tovarning O'Z birligiga moslanadi: donada, qutida yoki
    // juftda kasr bo'lmaydi (yarim quti degani yo'q), kilogrammda esa
    // bo'ladi. Ilgari bu faqat ilovada tekshirilardi va "6.7 dona"
    // yozuvi bazaga tushib ketishi mumkin edi.
    const addQty = normalizeQty(Number(qty ?? 0), product?.unit ?? unit);
    if (addQty > 0) {
      // Narx birligi tovarning o'z birligiga qarab tekshiriladi: eski
      // tovarga kirim qilinsa uning ombor birligi o'zgarmaydi
      // Tovarning expiry_date ustuni endi partiyalardan hisoblanadi
      // (eng erta tugaydigani), shuning uchun bu yerda tegilmaydi.
      db.prepare('UPDATE products SET stock = stock + ?, cost_price = ?, sell_price = ?, price_qty = ? WHERE id = ?').run(
        addQty,
        keepPrice(cost_price, product.cost_price, req),
        keepPrice(sell_price, product.sell_price),
        normalizePriceQty(req.body.price_qty ?? product.price_qty ?? 1, product.unit ?? unit),
        product.id
      );
      // Har kirim — alohida partiya: o'z sanasi va o'z srogi bilan
      addBatch(
        req.shopId!,
        product.id,
        addQty,
        keepPrice(cost_price, product.cost_price, req) ?? 0,
        expiry_date ?? null,
        req.employeeId ?? null
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
    return hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id));
  }
);

/**
 * Ixtiyoriy suratni faylga saqlash (chek va shunga o'xshashlar).
 *
 * Nomi TASODIFIY: mahsulot rasmlaridagidek "chek-7.jpg" bo'lsa,
 * raqamni birma-bir sinab boshqa do'konning chekini ochib ko'rish
 * mumkin bo'lardi.
 */
function saveUpload(dataUrl: string, prefix: string): string | null {
  const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  // 8 MB dan katta surat kutilmaydi — bodyLimit ham shuncha
  if (!buf.length || buf.length > 8 * 1024 * 1024) return null;
  const name = `${prefix}-${randomBytes(12).toString('hex')}.${ext}`;
  writeFileSync(join(UPLOADS_DIR, name), buf);
  return `/uploads/${name}`;
}

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
  { preHandler: requirePerm('product_edit') },
  async (req, reply) => {
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });
    const url = saveImage(req.body.image, product.id);
    if (!url) return reply.code(400).send({ error: 'invalid_image' });
    db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(url, product.id);
    return hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id));
  }
);

// Mahsulotning shtrix-kodlari
/**
 * Tovarning ochiq partiyalari — qachon kelgani, qanchasi qolgani,
 * har birining o'z srogi. Ombordagi kartochkada ko'rinadi.
 */
app.get<{ Params: { id: string } }>('/products/:id/batches', { preHandler: requirePerm('stock') }, async (req, reply) => {
  const p = db.prepare('SELECT id FROM products WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!p) return reply.code(404).send({ error: 'not_found' });
  return hideCost(req, batchesOf(req.shopId!, Number(req.params.id)) as any[]);
});

/** Bitta partiyaning srogini to'g'rilash */
app.patch<{ Params: { id: string; batchId: string }; Body: { expiry_date?: string | null } }>(
  '/products/:id/batches/:batchId',
  { preHandler: requirePerm('product_edit') },
  async (req, reply) => {
    const batch = db
      .prepare('SELECT id FROM product_batches WHERE id = ? AND product_id = ? AND shop_id = ?')
      .get(req.params.batchId, req.params.id, req.shopId);
    if (!batch) return reply.code(404).send({ error: 'not_found' });
    db.prepare('UPDATE product_batches SET expiry_date = ? WHERE id = ?').run(
      req.body?.expiry_date || null,
      req.params.batchId
    );
    syncProduct(Number(req.params.id));
    return hideCost(req, batchesOf(req.shopId!, Number(req.params.id)) as any[]);
  }
);

app.get<{ Params: { id: string } }>('/products/:id/barcodes', { preHandler: requirePerm('stock') }, async (req) => {
  return db
    .prepare('SELECT id, barcode, created_at FROM product_barcodes WHERE shop_id = ? AND product_id = ? ORDER BY id')
    .all(req.shopId, req.params.id);
});

// Skanerda topilmagan kodni mahsulotga biriktirish — kassachi ham qila oladi,
// shunda keyingi safar skaner darhol topadi.
/**
 * Do'konning o'z tovariga shtrix-kod yasab beradi (tarozidagi go'sht, uy
 * mahsuloti — zavod kodi yo'q narsalar). Kod "20" bilan boshlanadi, bu
 * oraliq korxona ichida erkin ishlatish uchun ajratilgan.
 */
app.post<{ Params: { id: string } }>('/products/:id/barcode', { preHandler: requirePerm('product_edit') }, async (req, reply) => {
  const product = db
    .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId) as any;
  if (!product) return reply.code(404).send({ error: 'not_found' });

  // Band bo'lsa boshqasini sinaymiz — kod hech qachon takrorlanmasin
  let code = '';
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = makeInStoreEan13(req.shopId!, product.id, attempt);
    if (!findByBarcode(req.shopId, candidate)) {
      code = candidate;
      break;
    }
  }
  if (!code) return reply.code(409).send({ error: 'no_free_code' });

  attachBarcode(req.shopId!, product.id, code);
  if (!product.barcode) db.prepare('UPDATE products SET barcode = ? WHERE id = ?').run(code, product.id);
  return { barcode: code, product: hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id)) };
});

app.post<{ Params: { id: string }; Body: { barcode: string } }>(
  '/products/:id/barcodes',
  { preHandler: requirePerm('product_edit') },
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
    return hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id));
  }
);

app.delete<{ Params: { id: string; code: string } }>(
  '/products/:id/barcodes/:code',
  { preHandler: requirePerm('product_edit') },
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

/** Tovarga tarozi raqami (PLU) berish.
 *
 *  Do'konchi bu raqamni tarozisiga kiritadi. Shundan keyin tarozi bosgan
 *  yorliqlar kassada o'zi tanilib, og'irligi bilan savatga tushadi. */
app.post<{ Params: { id: string }; Body: { plu?: string } }>(
  '/products/:id/plu',
  { preHandler: requirePerm('product_edit') },
  async (req, reply) => {
    // Tarozi yo'q do'konda (zargarlik, telefon, kiyim) PLU bermaymiz:
    // ilovada tugmasi ham ko'rinmaydi, lekin so'rov qo'lda kelishi mumkin
    const shopRow = db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
    if (!shopProfile(shopRow).scale) return reply.code(400).send({ error: 'no_scale' });
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });

    // Qo'lda berilgan raqam bo'lsa o'shani, bo'lmasa bo'shini topamiz.
    // Tarozilarda odatda 1..99999 oralig'i ishlatiladi.
    let plu = String(req.body?.plu ?? '').replace(/\D/g, '');
    if (plu) {
      plu = plu.padStart(5, '0').slice(0, 5);
      const taken = db
        .prepare('SELECT id, name FROM products WHERE shop_id = ? AND plu = ? AND id <> ?')
        .get(req.shopId, plu, product.id) as any;
      if (taken) return reply.code(409).send({ error: 'plu_taken', product: taken });
    } else {
      const used = new Set(
        (db.prepare("SELECT plu FROM products WHERE shop_id = ? AND plu IS NOT NULL AND plu <> ''").all(req.shopId) as any[])
          .map((r) => String(r.plu))
      );
      let n = 1;
      while (used.has(String(n).padStart(5, '0')) && n < 99999) n++;
      plu = String(n).padStart(5, '0');
    }

    db.prepare('UPDATE products SET plu = ? WHERE id = ?').run(plu, product.id);
    const fresh = hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id)) as any;
    return {
      ...fresh,
      // Tarozini sozlashda ko'rsatiladigan namuna: 1 kg uchun qanday kod chiqadi
      sample_barcode: makeScaleBarcode(plu, 1000, 'weight'),
    };
  }
);

app.delete<{ Params: { id: string } }>('/products/:id/plu', { preHandler: requirePerm('product_edit') }, async (req, reply) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
  if (!product) return reply.code(404).send({ error: 'not_found' });
  db.prepare('UPDATE products SET plu = NULL WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// Mahsulotni tahrirlash va o'chirish
app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
  '/products/:id',
  { preHandler: requirePerm('product_edit') },
  async (req, reply) => {
    const product = db
      .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
      .get(req.params.id, req.shopId) as any;
    if (!product) return reply.code(404).send({ error: 'not_found' });
    // Kirim narxini KO'RA olmaydigan xodim uni o'zgartira ham olmaydi.
    // Bu shunchaki qoida emas: unga tannarx yuborilmaydi, ya'ni ilovada
    // maydon doim bo'sh turadi va saqlaganda do'konning tannarxi
    // JIMGINA NOLGA tushib qolardi. Shuning uchun rad etilmaydi —
    // shunchaki e'tiborga olinmaydi, qolgan o'zgarishlar saqlanadi.
    if (!can(req, 'cost_view')) delete (req.body as any).cost_price;

    // Narx alohida ruxsat. Xodim tovar nomini to'g'rilashi mumkin, lekin
    // sotuv narxini o'zgartirish — do'kon foydasiga tegish demak.
    const priceKeys = ['cost_price', 'sell_price', 'discount_percent'];
    if (priceKeys.some((k) => k in req.body) && !can(req, 'price_edit')) {
      return reply.code(403).send({ error: 'no_permission', permission: 'price_edit' });
    }
    for (const key of ['name', 'barcode', 'unit', 'price_qty', 'cost_price', 'sell_price', 'low_stock_threshold', 'stock', 'category', 'supplier_id', 'discount_percent', 'proba', 'weight_g', 'size', 'stone']) {
      if (key in req.body) {
        let value = key === 'barcode' ? normalizeBarcode(req.body[key] as string) || null : (req.body[key] as any);
        if (key === 'unit') value = normalizeUnit(value);
        if (key === 'price_qty') {
          // Birlik shu so'rovda o'zgarayotgan bo'lsa yangisiga qaraladi
          const u = 'unit' in req.body ? normalizeUnit(req.body.unit) : product.unit;
          value = normalizePriceQty(value, u);
        }
        if (key === 'discount_percent') {
          // 0..90 oralig'ida — 100% chegirma "tekin berish" bo'lardi
          value = Math.min(90, Math.max(0, Math.round(Number(value) || 0)));
        }
        // Zargarlik maydonlari: yorliqdan ko'chiriladi
        if (key === 'proba') value = String(value ?? '').replace(/\D/g, '').slice(0, 4) || null;
        if (key === 'weight_g') {
          const w = Number(String(value).replace(',', '.'));
          value = Number.isFinite(w) && w > 0 ? w : null;
        }
        if (key === 'size' || key === 'stone') value = String(value ?? '').trim().slice(0, 40) || null;
        if (key === 'supplier_id') {
          // Begona do'konning ta'minotchisi biriktirilmasin
          value = value
            ? (db.prepare('SELECT id FROM suppliers WHERE id = ? AND shop_id = ?').get(value, req.shopId) as any)?.id ?? null
            : null;
        }
        db.prepare(`UPDATE products SET ${key} = ? WHERE id = ?`).run(value, product.id);
      }
    }
    // Qoldiq qo'lda o'zgartirilsa partiyalar ham ergashadi
    if ('stock' in req.body) setTotal(req.shopId!, product.id, Number(req.body.stock) || 0);
    // Srok endi partiyaga tegishli: eng erta tugaydigan ochiq partiyaga
    // yoziladi (kartochkadagi maydon o'sha partiyani ko'rsatadi).
    if ('expiry_date' in req.body) {
      const value = (req.body.expiry_date as string) || null;
      const open = batchesOf(req.shopId!, product.id)[0];
      if (open) {
        db.prepare('UPDATE product_batches SET expiry_date = ? WHERE id = ?').run(value, open.id);
      } else if (value) {
        // Partiyasiz tovar (qoldig'i 0) — srok saqlanib qolsin
        db.prepare('UPDATE products SET expiry_date = ? WHERE id = ?').run(value, product.id);
      }
      if (open) syncProduct(product.id);
    }
    // Birlik o'zgarib, narx birligi yangisiga to'g'ri kelmay qolgan bo'lsa
    // (kg -> dona bo'lganda "100 g uchun" ma'nosini yo'qotadi) — 1 ga qaytadi
    if ('unit' in req.body && !('price_qty' in req.body)) {
      const fixed = normalizePriceQty(product.price_qty ?? 1, normalizeUnit(req.body.unit));
      if (fixed !== (product.price_qty ?? 1)) {
        db.prepare('UPDATE products SET price_qty = ? WHERE id = ?').run(fixed, product.id);
      }
    }
    // asosiy kod o'zgargan bo'lsa — kodlar ro'yxatiga ham qo'shamiz
    if (typeof req.body.barcode === 'string') attachBarcode(req.shopId, product.id, req.body.barcode);
    if (typeof req.body.image === 'string') {
      const url = saveImage(req.body.image, product.id);
      if (url) db.prepare('UPDATE products SET image_url = ? WHERE id = ?').run(url, product.id);
    }
    return hideCost(req, db.prepare('SELECT * FROM products WHERE id = ?').get(product.id));
  }
);

app.delete<{ Params: { id: string } }>('/products/:id', { preHandler: requirePerm('product_del') }, async (req, reply) => {
  const product = db
    .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
    .get(req.params.id, req.shopId);
  if (!product) return reply.code(404).send({ error: 'not_found' });
  const sold = db.prepare('SELECT COUNT(*) AS c FROM sale_items WHERE product_id = ?').get(req.params.id) as any;
  if (sold.c > 0) return reply.code(400).send({ error: 'has_sales' });
  db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM product_batches WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  return { ok: true };
});

// Inventarizatsiya — haqiqiy qoldiqni kiritish, farqni yozib qo'yish
app.post<{ Body: { items: { product_id: number; actual: number }[] } }>(
  '/inventory/count',
  { preHandler: requirePerm('inventory') },
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
          setTotal(req.shopId!, p.id, item.actual);
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
  { preHandler: requirePerm('pos') },
  async (req, reply) => {
    const { items, payment_type, customer_id, customer_name, due_date } = req.body;
    if (!items?.length) return reply.code(400).send({ error: 'items_required' });

    // QARZGA SOTISH alohida ruxsat.
    //
    // Ilgari u faqat ekranda yashirilardi: xodimga tugma ko'rsatilmasdi,
    // lekin so'rovni to'g'ridan-to'g'ri yuborsa qarz baribir yozilaverardi.
    // Ya'ni do'kon egasi "qarzga sotmasin" deb belgilagani hech narsani
    // to'smasdi — bu esa uning pulига tegadi.
    if (payment_type === 'debt' && !can(req, 'pos_debt')) {
      return reply.code(403).send({ error: 'no_permission', permission: 'pos_debt' });
    }

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
    if (shortage.length > 0) {
      // Do'kon sozlamasida ruxsat berilmagan bo'lsa — minusga tushirmaymiz.
      // Ilgari sotuvchi "baribir sotilsinmi?" savoliga OK bosishi bilan
      // qoldiq manfiy bo'lib ketardi va ombor hisobi buzilardi.
      const shop = db.prepare('SELECT allow_negative_stock FROM shops WHERE id = ?').get(req.shopId) as any;
      if (!shop?.allow_negative_stock) {
        return reply.code(409).send({ error: 'stock_blocked', items: shortage });
      }
      if (!req.body.allow_negative) {
        return reply.code(409).send({ error: 'insufficient_stock', items: shortage });
      }
    }

    // Qarzga sotishda qarzdorning telefoni shart — eslatma va qo'ng'iroq shunga boradi
    const debtPhone = normalizePhone(req.body.customer_phone);
    let debtCustomer: any = null;
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
      if (customer_id && !known) return reply.code(404).send({ error: 'customer_not_found' });
      if (!known && !customer_name?.trim()) return reply.code(400).send({ error: 'customer_required_for_debt' });
      if ((!known || !known.phone) && !debtPhone) {
        return reply.code(400).send({
          error: 'customer_phone_required',
          customer: known ? { id: known.id, name: known.name } : null,
        });
      }
      debtCustomer = known;

      // Bloklangan mijoz yoki limitdan oshsa — sotuv qarzga yozilmaydi
      if (debtCustomer) {
        const willAdd = items.reduce((sum: number, it: any) => {
          const p = db
            .prepare('SELECT sell_price, discount_percent FROM products WHERE id = ? AND shop_id = ?')
            .get(it.product_id, req.shopId) as any;
          return sum + (p ? priceWithDiscount(p) * it.qty : 0);
        }, 0);
        const allowed = checkCreditAllowed(req.shopId!, debtCustomer.id, Math.round(willAdd));
        if (!allowed.ok) return reply.code(409).send({ error: allowed.error, details: allowed.details });
      }
    }

    const tx = db.transaction(() => {
      let total = 0;
      const lines: { product: any; qty: number; price: number }[] = [];
      for (const item of items) {
        const product = db
          .prepare('SELECT * FROM products WHERE id = ? AND shop_id = ?')
          .get(item.product_id, req.shopId) as any;
        if (!product) throw new Error('product_not_found');
        // Chegirma bo'lsa — kassa ham, chek ham, foyda ham shu narxda
        const price = priceWithDiscount(product);
        total += price * item.qty;
        lines.push({ product, qty: item.qty, price });
      }
      const saleInfo = db
        .prepare('INSERT INTO sales (shop_id, total, payment_type, customer_id, created_by) VALUES (?, ?, ?, ?, ?)')
        .run(req.shopId, Math.round(total), payment_type, customer_id ?? null, req.employeeId);
      const saleId = Number(saleInfo.lastInsertRowid);
      for (const { product, qty, price } of lines) {
        db.prepare('INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES (?, ?, ?, ?)').run(
          saleId,
          product.id,
          qty,
          price
        );
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(qty, product.id);
        // Eng erta tugaydigan partiyadan yechiladi
        consume(product.id, qty);
        db.prepare('INSERT INTO stock_movements (shop_id, product_id, type, qty) VALUES (?, ?, ?, ?)').run(
          req.shopId,
          product.id,
          'sale',
          -qty
        );
      }
      // "Qarzga sotish" — savdo avtomatik qarz daftariga tushadi
      if (payment_type === 'debt') {
        let cid = debtCustomer?.id;
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
            const shop = db.prepare('SELECT default_reminder_mode, shop_type FROM shops WHERE id = ?').get(req.shopId) as any;
            cid = Number(
              db
                .prepare('INSERT INTO customers (shop_id, name, phone, reminder_mode) VALUES (?, ?, ?, ?)')
                .run(req.shopId, customer_name!.trim(), debtPhone, shop.default_reminder_mode).lastInsertRowid
            );
          }
        } else if (debtPhone) {
          db.prepare('UPDATE customers SET phone = COALESCE(NULLIF(phone, \'\'), ?) WHERE id = ?').run(debtPhone, cid);
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
      const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
      const saleItems = db.prepare('SELECT * FROM sale_items WHERE sale_id = ?').all(saleId);

      // Mijoz Telegram'ga ulangan bo'lsa chek o'ziga darhol boradi.
      // Mijoz buni o'zi tanlagan (havolani bosgan), shuning uchun
      // qo'shimcha so'rov shart emas. Yuborish sotuvni kutdirmaydi:
      // Telegram javob bermasa ham savdo yakunlangan bo'lib qolaveradi.
      if (sale.customer_id) {
        const c = db.prepare('SELECT telegram_user_id FROM customers WHERE id = ?').get(sale.customer_id) as any;
        if (c?.telegram_user_id) {
          const text = receiptText(saleId) ?? '';
          sendMessage(c.telegram_user_id, text)
            .then((res: any) => {
              if (res?.ok) {
                db.prepare(
                  `INSERT INTO reminder_logs (shop_id, customer_id, channel, kind, status, payload)
                   VALUES (?, ?, 'telegram', 'receipt', 'sent', ?)`
                ).run(sale.shop_id, sale.customer_id, text);
              }
            })
            .catch(() => {
              /* chek yetib bormasa savdo baribir yozilgan */
            });
        }
      }
      return { ...sale, items: saleItems };
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }
  }
);

// Sotuvlar tarixi
app.get<{ Querystring: { limit?: string; q?: string } }>('/sales', { preHandler: requirePerm('pos') }, async (req) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const q = (req.query.q ?? '').trim();

  // Qidiruv — tovar qaytarilganda kerak bo'ladi.
  //
  // Mijoz tovarni ko'tarib kelganda do'konchi qo'lida chek raqami
  // bo'lmaydi; qo'lida tovarning o'zi bo'ladi. Shuning uchun eng muhim
  // yo'l — shtrix-kodni skanerlab, o'sha tovar sotilgan cheklarni
  // ko'rish. Qolgan yo'llar (tovar nomi, mijoz, chek raqami) qo'shimcha.
  const where: string[] = ['s.shop_id = ?'];
  const args: unknown[] = [req.shopId];
  if (q) {
    const like = `%${q}%`;
    // Tovar bo'yicha qidiruvda tartib muhim: avval tovarni topamiz
    // (ular kam), keyin o'sha tovar uchraydigan cheklarni. Teskarisi —
    // har bir chekni ochib ichidagi tovarlarni tekshirish — do'konda
    // o'n minglab chek to'planganda sekinlashib ketardi.
    where.push(`(
      CAST(s.id AS TEXT) = ?
      OR c.name LIKE ?
      OR c.phone LIKE ?
      OR s.id IN (
        SELECT si.sale_id FROM sale_items si
        WHERE si.product_id IN (
          SELECT p.id FROM products p
          WHERE p.shop_id = ?
            AND (p.name LIKE ?
                 OR p.barcode = ?
                 OR EXISTS (SELECT 1 FROM product_barcodes pb
                            WHERE pb.product_id = p.id AND pb.barcode = ?))
        )
      )
    )`);
    args.push(q.replace(/^#/, ''), like, like, req.shopId, like, q, q);
  }
  args.push(limit);

  return db
    .prepare(
      `SELECT s.*, c.name AS customer_name, c.phone AS customer_phone,
              (SELECT GROUP_CONCAT(p.name || ' ×' || CASE WHEN si.qty = CAST(si.qty AS INTEGER)
                               THEN CAST(CAST(si.qty AS INTEGER) AS TEXT)
                               ELSE CAST(si.qty AS TEXT) END, ', ')
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS items,
              (SELECT COALESCE(SUM(r.total), 0) FROM returns r WHERE r.sale_id = s.id) AS returned
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE ${where.join(' AND ')} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`
    )
    .all(...(args as any[]));
});

app.get<{ Params: { id: string } }>('/sales/:id', { preHandler: requirePerm('pos') }, async (req, reply) => {
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
  // Chek chop etish uchun do'kon rekvizitlari va qaytarishlar tarixi
  const shop = db.prepare('SELECT name, phone, address, card_number FROM shops WHERE id = ?').get(req.shopId);
  const returns = db
    .prepare(
      `SELECT r.id, r.total, r.reason, r.refund_type, r.created_at FROM returns r
       WHERE r.sale_id = ? AND r.shop_id = ? ORDER BY r.id DESC`
    )
    .all(sale.id, req.shopId);
  const seller = sale.created_by
    ? db.prepare('SELECT name FROM employees WHERE id = ?').get(sale.created_by)
    : null;
  return { ...sale, items, customer, shop, returns, seller };
});

// Chekni mijozga yuborish (jurnalga yoziladi; provayder ulanganda SMS/Telegram ketadi)
/** Chekni mijozga yuborish.
 *
 *  Mijoz Telegram'ga ulangan bo'lsa — chek chindan ham yetib boradi.
 *  Ulanmagan bo'lsa matn qaytadi va SMS navbatiga yoziladi (SMS xizmati
 *  ulanganda o'sha yerdan ketadi). */
app.post<{ Params: { id: string } }>('/sales/:id/receipt', { preHandler: requirePerm('pos') }, async (req, reply) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!sale) return reply.code(404).send({ error: 'not_found' });
  if (!sale.customer_id) return reply.code(400).send({ error: 'no_customer' });
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(sale.customer_id) as any;
  if (!customer?.phone) return reply.code(400).send({ error: 'no_phone' });

  const text = receiptText(sale.id) ?? '';
  let channel: 'telegram' | 'sms' = 'sms';
  if (customer.telegram_user_id) {
    const res: any = await sendMessage(customer.telegram_user_id, text);
    if (res?.ok) channel = 'telegram';
  }
  db.prepare(
    `INSERT INTO reminder_logs (shop_id, customer_id, channel, kind, status, payload)
     VALUES (?, ?, ?, 'receipt', 'sent', ?)`
  ).run(req.shopId, customer.id, channel, text);
  return { ok: true, text, channel };
});

// ---------- QAYTARISH (VOZVRAT) ----------
// Mijoz tovarni qaytarib keldi: qoldiq ortga qaytadi, tushum va foyda
// kamayadi, qarzga olingan bo'lsa qarz ham shuncha qisqaradi.

app.get<{ Params: { id: string } }>('/sales/:id/returns', { preHandler: requirePerm('pos') }, async (req, reply) => {
  const sale = db.prepare('SELECT id FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!sale) return reply.code(404).send({ error: 'not_found' });
  return db
    .prepare(
      `SELECT r.*, (SELECT GROUP_CONCAT(p.name || ' ×' || ri.qty, ', ')
                    FROM return_items ri JOIN products p ON p.id = ri.product_id
                    WHERE ri.return_id = r.id) AS items
       FROM returns r WHERE r.shop_id = ? AND r.sale_id = ? ORDER BY r.id DESC`
    )
    .all(req.shopId, sale.id);
});

app.post<{
  Params: { id: string };
  Body: { items?: { sale_item_id: number; qty: number }[]; reason?: string; refund_type?: string };
}>('/sales/:id/returns', { preHandler: requirePerm('pos_return') }, async (req, reply) => {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId) as any;
  if (!sale) return reply.code(404).send({ error: 'not_found' });
  const wanted = (req.body?.items ?? []).filter((i) => Number(i.qty) > 0);
  if (!wanted.length) return reply.code(400).send({ error: 'items_required' });
  // sale_item_id yo'q bo'lsa so'rov noto'g'ri tuzilgan — bunda baza xatosi
  // bilan 500 qaytarish o'rniga sababini aniq aytamiz
  if (wanted.some((i) => !Number.isInteger(Number(i.sale_item_id)))) {
    return reply.code(400).send({ error: 'sale_item_id_required' });
  }

  // Har bir satr shu sotuvniki ekanini va ortiqcha qaytarilmayotganini tekshiramiz
  const lines: { row: any; qty: number }[] = [];
  for (const item of wanted) {
    const row = db
      .prepare('SELECT * FROM sale_items WHERE id = ? AND sale_id = ?')
      .get(item.sale_item_id, sale.id) as any;
    if (!row) return reply.code(404).send({ error: 'sale_item_not_found' });
    const left = row.qty - (row.returned_qty ?? 0);
    const qty = Number(item.qty);
    if (qty > left + 1e-9) {
      return reply.code(409).send({ error: 'too_many', details: { sale_item_id: row.id, left } });
    }
    lines.push({ row, qty });
  }

  // Qarzga olingan bo'lsa — shu sotuvning qarzini topamiz
  const debt =
    sale.payment_type === 'debt'
      ? (db.prepare('SELECT * FROM debts WHERE sale_id = ? AND shop_id = ?').get(sale.id, req.shopId) as any)
      : null;
  // Qarzdan ayirish faqat qarzga sotilgan va hali to'lanmagan qarzda mumkin
  const refundType = req.body?.refund_type === 'debt' && debt ? 'debt' : req.body?.refund_type === 'card' ? 'card' : 'cash';

  const tx = db.transaction(() => {
    const total = Math.round(lines.reduce((s, l) => s + l.row.price * l.qty, 0));
    const info = db
      .prepare(
        `INSERT INTO returns (shop_id, sale_id, customer_id, total, reason, refund_type, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.shopId, sale.id, sale.customer_id ?? null, total, req.body?.reason?.trim() || null, refundType, req.employeeId);
    const returnId = Number(info.lastInsertRowid);

    for (const { row, qty } of lines) {
      db.prepare(
        'INSERT INTO return_items (return_id, sale_item_id, product_id, qty, price) VALUES (?, ?, ?, ?, ?)'
      ).run(returnId, row.id, row.product_id, qty, row.price);
      db.prepare('UPDATE sale_items SET returned_qty = returned_qty + ? WHERE id = ?').run(qty, row.id);
      // Tovar javonga qaytdi
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(qty, row.product_id);
      restore(row.product_id, qty);
      db.prepare(
        'INSERT INTO stock_movements (shop_id, product_id, type, qty, created_by) VALUES (?, ?, ?, ?, ?)'
      ).run(req.shopId, row.product_id, 'return', qty, req.employeeId);
    }

    // Qarzdan ayirish.
    //
    // Qarz faqat TO'LANMAGAN qismi qadar kamaytiriladi. Ilgari shart
    // `max(paid_amount, amount - total)` edi va bu jimgina pul yeb
    // qo'yardi: mijoz qarzini to'lab bo'lgan bo'lsa (paid = amount),
    // tovarni qaytarganda qarz ham kamaymasdi, naqd pul ham
    // berilmasdi — ya'ni mijoz tovarni qaytarib, hech narsa olmasdi.
    //
    // Endi qarz qancha "yuta olsa" shuncha ayiriladi, qolgani esa
    // NAQD qaytariladi va javobda aniq ko'rsatiladi — kassir qancha
    // pul berishni bilib tursin.
    let debtPart = 0;
    if (refundType === 'debt' && debt) {
      const qoldiq = Math.max(0, Number(debt.amount) - Number(debt.paid_amount));
      debtPart = Math.min(total, qoldiq);
      if (debtPart > 0) {
        const newAmount = Number(debt.amount) - debtPart;
        const status = newAmount <= Number(debt.paid_amount) ? 'paid' : debt.status === 'paid' ? 'active' : debt.status;
        db.prepare('UPDATE debts SET amount = ?, status = ? WHERE id = ?').run(newAmount, status, debt.id);
      }
      // Qarz hech narsani yuta olmasa — bu naqd qaytarish
      if (debtPart === 0) {
        db.prepare("UPDATE returns SET refund_type = 'cash' WHERE id = ?").run(returnId);
      }
    }
    return { returnId, debtPart, total };
  });

  try {
    const { returnId, debtPart, total } = tx();
    const created = db.prepare('SELECT * FROM returns WHERE id = ?').get(returnId) as any;
    const items = db.prepare('SELECT * FROM return_items WHERE return_id = ?').all(returnId);
    // Kassir qancha naqd pul berishi kerak
    return { ...created, items, debt_refund: debtPart, cash_refund: total - debtPart };
  } catch (e: any) {
    return reply.code(400).send({ error: e.message });
  }
});

// Barcha qaytarishlar ro'yxati (davr bo'yicha) — hisobot uchun
/**
 * Skanerlangan tovar bo'yicha qaytarish uchun ma'lumot.
 *
 * Nega chek qidirish emas: bitta tovar o'nlab odamga sotilgan bo'ladi,
 * shuning uchun kod bo'yicha qidirish o'nlab chek chiqaradi va do'konchi
 * ular orasidan tanlab o'tirishi kerak bo'lardi. Bu yerda esa aksincha —
 * tovar aniqlanadi va qaytarish mumkin bo'lgan sotuvlar yangisidan
 * boshlab beriladi. Birinchisi deyarli har doim to'g'ri chiqadi: mijoz
 * odatda yaqinda olgan tovarini qaytaradi.
 */
app.get<{ Querystring: { code?: string } }>('/returns/lookup', { preHandler: requirePerm('pos_return') }, async (req) => {
  const code = normalizeBarcode(req.query.code);
  if (!code) return { code: '', product: null, scale: null, candidates: [] };

  // Tarozi kodi faqat tarozili do'konda o'qiladi — /barcodes/lookup da
  // shunday, bu yerda esa unutilgan edi va zargarlik do'konidagi 13
  // xonali kod tasodifan "tarozi yorlig'i" bo'lib talqin qilinardi
  const scaleShop = shopProfile(db.prepare('SELECT shop_type FROM shops WHERE id = ?').get(req.shopId) as any).scale;
  const scale = scaleShop ? parseScaleBarcode(code) : null;
  const product = hideCost(
    req,
    (scale
      ? ((db.prepare('SELECT * FROM products WHERE shop_id = ? AND plu = ?').get(req.shopId, scale.plu) as any) ?? null)
      : (findByBarcode(req.shopId, code) ?? null)) as any
  );
  if (!product) {
    return { code, product: null, scale: scale ? { ...scale, qty: 0 } : null, candidates: [] };
  }

  const candidates = db
    .prepare(
      `SELECT si.id AS sale_item_id, si.sale_id, si.price, si.qty,
              COALESCE(si.returned_qty, 0) AS returned_qty,
              si.qty - COALESCE(si.returned_qty, 0) AS left_qty,
              s.created_at, s.payment_type, c.name AS customer_name
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = ? AND si.product_id = ?
         AND si.qty - COALESCE(si.returned_qty, 0) > 0.000001
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 10`
    )
    .all(req.shopId, product.id);

  return {
    code,
    product,
    scale: scale ? { ...scale, qty: scaleQty(scale, priceWithDiscount(product)) } : null,
    candidates,
  };
});

app.get<{ Querystring: { period?: string; limit?: string } }>(
  '/returns',
  { preHandler: requirePerm('pos_return') },
  async (req) => {
    const since = expensePeriodSql(req.query.period);
    const limit = Math.min(Number(req.query.limit ?? 100), 300);
    const items = db
      .prepare(
        `SELECT r.*, c.name AS customer_name,
                (SELECT GROUP_CONCAT(p.name || ' ×' ||
                          CASE WHEN ri.qty = CAST(ri.qty AS INTEGER)
                               THEN CAST(CAST(ri.qty AS INTEGER) AS TEXT)
                               ELSE CAST(ri.qty AS TEXT) END, ', ')
                 FROM return_items ri JOIN products p ON p.id = ri.product_id
                 WHERE ri.return_id = r.id) AS items
         FROM returns r LEFT JOIN customers c ON c.id = r.customer_id
         WHERE r.shop_id = ?${since ? ' AND r.created_at >= ?' : ''}
         ORDER BY r.created_at DESC, r.id DESC LIMIT ?`
      )
      .all(...(since ? [req.shopId, uzPeriodStartUtc(since), limit] : [req.shopId, limit]));
    const sum = db
      .prepare(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total FROM returns
         WHERE shop_id = ?${since ? ' AND created_at >= ?' : ''}`
      )
      .get(...(since ? [req.shopId, uzPeriodStartUtc(since)] : [req.shopId])) as any;
    return { items, count: sum.count, total: sum.total };
  }
);

/** Berilgan davrdagi qaytarishlar: summa va tannarx (foydani to'g'rilash uchun) */
function returnsTotals(shopId: number, sinceDays: string): { total: number; cost: number } {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(ri.price * ri.qty), 0) AS total,
              COALESCE(SUM(p.cost_price * ri.qty), 0) AS cost
       FROM return_items ri
       JOIN returns r ON r.id = ri.return_id
       JOIN products p ON p.id = ri.product_id
       WHERE r.shop_id = ? AND r.created_at >= ?`
    )
    .get(shopId, uzPeriodStartUtc(sinceDays)) as any;
  return { total: row.total as number, cost: row.cost as number };
}

// ---------- XARAJATLAR ----------
// Ijara, svet, ish haqi, transport... Bularsiz "foyda" faqat tovar
// ustamasi bo'lib qoladi — do'konchi aslida qancha ishlaganini bilmaydi.

/** Tayyor kategoriyalar — ilova va hisobot bir xil tushunishi uchun bitta joyda */
const EXPENSE_CATEGORIES = ['rent', 'utilities', 'salary', 'transport', 'tax', 'ads', 'repair', 'other'] as const;

/**
 * period → sana chegarasi. Kun bo'yicha hisoblaymiz: "Bugun" haqiqatan
 * bugundan boshlanadi (ilgari oxirgi 24 soat edi va Bosh sahifadagi
 * "bugungi savdo" bilan mos tushmasdi), "Hafta" — shu kun bilan 7 kun.
 * null qaytsa — chegara yo'q (butun tarix).
 */
function expensePeriodSql(period?: string): string | null {
  if (period === 'week') return '-6 days';
  if (period === 'month') return '-29 days';
  if (period === 'all') return null;
  return '-0 days'; // bugun
}

/** Hisobotlarda "butun tarix" yo'q — har doim chegara qaytadi */
const reportPeriodSql = (period?: string): string => expensePeriodSql(period) ?? '-0 days';

/** Berilgan davr uchun xarajatlar jami (hisobotlarda ishlatiladi) */
function expensesTotal(shopId: number, sinceDays: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM expenses
       WHERE shop_id = ? AND spent_at >= date('now', '+5 hours', ?)`
    )
    .get(shopId, sinceDays) as any;
  return row.s as number;
}

app.get<{ Querystring: { period?: string; category?: string; from?: string; to?: string } }>(
  '/expenses',
  { preHandler: requirePerm('expenses') },
  async (req) => {
    // Ustunlar "e." bilan yoziladi — xodim jadvali qo'shilganda
    // shop_id ikkala tomonda bo'lgani uchun ikkilanish chiqmasin
    const where = ['e.shop_id = ?'];
    const params: any[] = [req.shopId];
    if (req.query.from) {
      where.push('e.spent_at >= ?');
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push('e.spent_at <= ?');
      params.push(req.query.to);
    }
    if (!req.query.from && !req.query.to) {
      const since = expensePeriodSql(req.query.period);
      if (since) {
        where.push("e.spent_at >= date('now', '+5 hours', ?)");
        params.push(since);
      }
    }
    if (req.query.category) {
      where.push('e.category = ?');
      params.push(req.query.category);
    }
    const cond = where.join(' AND ');

    const items = db
      .prepare(
        `SELECT e.*, emp.name AS created_by_name FROM expenses e
         LEFT JOIN employees emp ON emp.id = e.created_by
         WHERE ${cond} ORDER BY e.spent_at DESC, e.id DESC LIMIT 300`
      )
      .all(...params);
    const sum = db
      .prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(e.amount), 0) AS total FROM expenses e WHERE ${cond}`)
      .get(...params) as any;
    const byCategory = db
      .prepare(
        `SELECT e.category AS category, COUNT(*) AS count, SUM(e.amount) AS total FROM expenses e
         WHERE ${cond} GROUP BY e.category ORDER BY total DESC`
      )
      .all(...params);

    // Har oy takrorlanadigan xarajatlar (ijara, ish haqi) — shu oyda hali
    // yozilmagan bo'lsa eslatib turamiz, bir bosishda qo'shiladi
    const suggestions = db
      .prepare(
        `SELECT category, MAX(spent_at) AS last_at,
                (SELECT amount FROM expenses e2
                 WHERE e2.shop_id = e.shop_id AND e2.category = e.category AND e2.is_recurring = 1
                 ORDER BY e2.spent_at DESC, e2.id DESC LIMIT 1) AS amount
         FROM expenses e
         WHERE e.shop_id = ? AND e.is_recurring = 1
         GROUP BY e.category
         HAVING MAX(e.spent_at) < date('now', '+5 hours', 'start of month')`
      )
      .all(req.shopId);

    return {
      items,
      count: sum.count,
      total: sum.total,
      by_category: byCategory,
      suggestions,
      known_categories: EXPENSE_CATEGORIES,
    };
  }
);

app.post<{ Body: { category?: string; amount?: number; note?: string; spent_at?: string; is_recurring?: boolean } }>(
  '/expenses',
  { preHandler: requirePerm('expenses') },
  async (req, reply) => {
    const amount = Math.round(Number(req.body?.amount) || 0);
    const category = (req.body?.category ?? '').trim();
    if (amount <= 0) return reply.code(400).send({ error: 'amount_required' });
    if (!category) return reply.code(400).send({ error: 'category_required' });
    // Kelajakdagi sana — deyarli har doim terishdagi xato
    const spentAt = (req.body?.spent_at ?? '').trim() || uzToday();
    if (spentAt > uzToday()) return reply.code(400).send({ error: 'future_date' });

    const info = db
      .prepare(
        `INSERT INTO expenses (shop_id, category, amount, note, spent_at, is_recurring, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.shopId,
        category,
        amount,
        req.body?.note?.trim() || null,
        spentAt,
        req.body?.is_recurring ? 1 : 0,
        req.employeeId ?? null
      );
    return db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid);
  }
);

app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
  '/expenses/:id',
  { preHandler: requirePerm('expenses') },
  async (req, reply) => {
    const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND shop_id = ?').get(req.params.id, req.shopId);
    if (!row) return reply.code(404).send({ error: 'not_found' });
    if ('amount' in req.body) {
      const amount = Math.round(Number(req.body.amount) || 0);
      if (amount <= 0) return reply.code(400).send({ error: 'amount_required' });
      db.prepare('UPDATE expenses SET amount = ? WHERE id = ?').run(amount, req.params.id);
    }
    if ('spent_at' in req.body) {
      const spentAt = String(req.body.spent_at ?? '').trim();
      if (spentAt > uzToday()) return reply.code(400).send({ error: 'future_date' });
      if (spentAt) db.prepare('UPDATE expenses SET spent_at = ? WHERE id = ?').run(spentAt, req.params.id);
    }
    if ('category' in req.body) {
      const category = String(req.body.category ?? '').trim();
      if (!category) return reply.code(400).send({ error: 'category_required' });
      db.prepare('UPDATE expenses SET category = ? WHERE id = ?').run(category, req.params.id);
    }
    if ('note' in req.body) {
      db.prepare('UPDATE expenses SET note = ? WHERE id = ?').run(String(req.body.note ?? '').trim() || null, req.params.id);
    }
    if ('is_recurring' in req.body) {
      db.prepare('UPDATE expenses SET is_recurring = ? WHERE id = ?').run(req.body.is_recurring ? 1 : 0, req.params.id);
    }
    return db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id);
  }
);

app.delete<{ Params: { id: string } }>('/expenses/:id', { preHandler: requirePerm('expenses') }, async (req, reply) => {
  const info = db.prepare('DELETE FROM expenses WHERE id = ? AND shop_id = ?').run(req.params.id, req.shopId);
  if (!info.changes) return reply.code(404).send({ error: 'not_found' });
  return { ok: true };
});

// Xarajatlarni CSV qilib yuklab olish (buxgalter yoki soliq uchun)
app.get<{ Querystring: { period?: string } }>('/expenses/export', { preHandler: requirePerm('expenses') }, async (req, reply) => {
  const since = expensePeriodSql(req.query.period);
  const rows = db
    .prepare(
      `SELECT spent_at, category, amount, COALESCE(note, '') AS note FROM expenses
       WHERE shop_id = ?${since ? " AND spent_at >= date('now', '+5 hours', ?)" : ''}
       ORDER BY spent_at DESC, id DESC`
    )
    .all(...(since ? [req.shopId, since] : [req.shopId])) as any[];
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['Sana', 'Kategoriya', 'Summa', 'Izoh'].map(esc).join(','),
    ...rows.map((r) => [r.spent_at, r.category, r.amount, r.note].map(esc).join(',')),
  ].join('\n');
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  reply.header('Content-Disposition', `attachment; filename="xarajatlar-${req.query.period ?? 'day'}.csv"`);
  return reply.send('﻿' + csv); // BOM — Excel kirillchani to'g'ri ochadi
});

// ---------- HISOBOTLAR ----------
app.get<{ Querystring: { period?: string } }>('/reports/summary', { preHandler: requirePerm('reports') }, async (req) => {
  const period = reportPeriodSql(req.query.period);
  // Davr boshlanishi UTC'da — indeks ishlashi uchun (tz.ts izohi)
  const periodFrom = uzPeriodStartUtc(period);
  const sales = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN payment_type = 'cash' THEN total END), 0) AS cash,
              COALESCE(SUM(CASE WHEN payment_type = 'card' THEN total END), 0) AS card,
              COALESCE(SUM(CASE WHEN payment_type = 'debt' THEN total END), 0) AS debt
       FROM sales WHERE shop_id = ? AND created_at >= ?`
    )
    .get(req.shopId, periodFrom) as any;
  const profit = db
    .prepare(
      `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= ?`
    )
    .get(req.shopId, periodFrom) as any;
  const topProducts = db
    .prepare(
      `SELECT p.name, SUM(si.qty) AS sold, SUM(si.price * si.qty) AS revenue
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= ?
       GROUP BY p.id ORDER BY sold DESC LIMIT 10`
    )
    .all(req.shopId, periodFrom);
  // Qaytarilgan tovarlar tushum va foydadan chiqariladi
  const ret = returnsTotals(req.shopId!, period);
  const grossProfit = profit.profit - (ret.total - ret.cost);
  // Xarajatlar shu davrda — sof foyda shulardan keyin qoladigan pul
  const expenses = expensesTotal(req.shopId!, period);
  const expensesByCategory = db
    .prepare(
      `SELECT category, SUM(amount) AS total FROM expenses
       WHERE shop_id = ? AND spent_at >= date('now', '+5 hours', ?)
       GROUP BY category ORDER BY total DESC`
    )
    .all(req.shopId, period);
  return {
    ...sales,
    revenue: sales.revenue - ret.total, // qaytarilganidan keyingi tushum
    gross_revenue: sales.revenue, // qaytarishlarsiz
    returns: ret.total,
    profit: grossProfit, // yalpi foyda (tovar ustamasi, qaytarishlar hisobga olingan)
    expenses,
    net_profit: grossProfit - expenses, // sof foyda
    expenses_by_category: expensesByCategory,
    top_products: topProducts,
  };
});

// Xodim samaradorligi: kim qancha sotdi.
//
// Do'kon egasi uchun bu "kimga bonus, kimni nazorat qilay" degan
// savolga javob. Faqat tushum emas, foyda ham ko'rsatiladi — sotuvchi
// chegirma berib ko'p sotgan bo'lishi mumkin, lekin do'konga foydasi kam.
// Do'kon egasi o'zi sotgan bo'lsa (created_by bo'sh) — alohida satr.
app.get<{ Querystring: { period?: string } }>('/reports/employees', { preHandler: requirePerm('reports') }, async (req) => {
  const period = reportPeriodSql(req.query.period);
  // Davr boshlanishi UTC'da — indeks ishlashi uchun (tz.ts izohi)
  const periodFrom = uzPeriodStartUtc(period);
  const rows = db
    .prepare(
      `SELECT s.created_by AS employee_id,
              COALESCE(e.name, '') AS name,
              COALESCE(e.is_active, 1) AS is_active,
              COUNT(DISTINCT s.id) AS sales_count,
              COALESCE(SUM(s.total), 0) AS revenue,
              COALESCE(SUM(CASE WHEN s.payment_type = 'debt' THEN s.total END), 0) AS debt_revenue
       FROM sales s LEFT JOIN employees e ON e.id = s.created_by
       WHERE s.shop_id = ? AND s.created_at >= ?
       GROUP BY s.created_by ORDER BY revenue DESC`
    )
    .all(req.shopId, periodFrom) as any[];

  // Foyda alohida so'rovda — sale_items bilan qo'shilsa sotuvlar soni
  // ko'payib ketardi (bitta chekdagi har bir satr uchun takrorlanib)
  const profitRows = db
    .prepare(
      `SELECT s.created_by AS employee_id,
              COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS profit,
              COALESCE(SUM(si.qty), 0) AS items
       FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN products p ON p.id = si.product_id
       WHERE s.shop_id = ? AND s.created_at >= ?
       GROUP BY s.created_by`
    )
    .all(req.shopId, periodFrom) as any[];

  // Qaytarishlar ham xodimga tegishli — sotuvchining haqiqiy natijasi shu.
  // Tannarx ham olinadi: foydadan qaytarilgan tovarning USTAMASI
  // ayirilishi kerak, sotuv summasi emas (pastdagi izohga qara).
  const returnRows = db
    .prepare(
      `SELECT r.created_by AS employee_id,
              COALESCE(SUM(ri.price * ri.qty), 0) AS returned,
              COALESCE(SUM(p.cost_price * ri.qty), 0) AS returned_cost,
              COUNT(DISTINCT r.id) AS returns_count
       FROM return_items ri
       JOIN returns r ON r.id = ri.return_id
       JOIN products p ON p.id = ri.product_id
       WHERE r.shop_id = ? AND r.created_at >= ?
       GROUP BY r.created_by`
    )
    .all(req.shopId, periodFrom) as any[];

  const byId = <T extends { employee_id: number | null }>(list: T[], id: number | null) =>
    list.find((x) => (x.employee_id ?? null) === (id ?? null));

  const result = rows.map((r) => {
    const id = r.employee_id ?? null;
    const p = byId(profitRows, id);
    const ret = byId(returnRows, id);
    const returned = Number(ret?.returned ?? 0);
    // Qaytarilgan tovarning USTAMASI foydadan ayiriladi.
    //
    // Ilgari sotuv summasining O'ZI ayirilardi va tannarx ikki marta
    // hisobdan chiqardi: 15 000 ga sotilgan, tannarxi 12 000 bo'lgan
    // tovar qaytarilsa foyda 3 000 emas, 15 000 ga kamayardi —
    // sotuvchining natijasi minusga ketardi. Umumiy hisobotda
    // (/reports/summary) bu allaqachon to'g'ri qilingan edi.
    const returnedMargin = returned - Number(ret?.returned_cost ?? 0);
    return {
      employee_id: id,
      name: r.name || null, // bo'sh bo'lsa — do'kon egasi
      is_active: !!r.is_active,
      sales_count: Number(r.sales_count),
      revenue: Number(r.revenue) - returned,
      gross_revenue: Number(r.revenue),
      returned,
      returns_count: Number(ret?.returns_count ?? 0),
      debt_revenue: Number(r.debt_revenue),
      items: Number(p?.items ?? 0),
      profit: Number(p?.profit ?? 0) - returnedMargin,
      avg_check: r.sales_count > 0 ? Math.round(Number(r.revenue) / Number(r.sales_count)) : 0,
    };
  });
  // Qaytarish qilgan, lekin shu davrda sotmagan xodim ham ko'rinsin
  for (const ret of returnRows) {
    const id = ret.employee_id ?? null;
    if (result.some((x) => x.employee_id === id)) continue;
    const emp = id ? (db.prepare('SELECT name, is_active FROM employees WHERE id = ?').get(id) as any) : null;
    result.push({
      employee_id: id,
      name: emp?.name ?? null,
      is_active: emp ? !!emp.is_active : true,
      sales_count: 0,
      revenue: -Number(ret.returned),
      gross_revenue: 0,
      returned: Number(ret.returned),
      returns_count: Number(ret.returns_count),
      debt_revenue: 0,
      items: 0,
      profit: -Number(ret.returned),
      avg_check: 0,
    });
  }
  return result.sort((a, b) => b.revenue - a.revenue);
});

// Kechki hisobotni hozir yuborib ko'rish.
//
// Do'konchi "qanaqa xabar keladi" ni oldindan ko'rishi kerak — aks holda
// sozlamada yoqib qo'yadi-yu, kechqurun nima kelishini bilmaydi.
app.post('/reports/daily/send', { preHandler: requirePerm('reports') }, async (req, reply) => {
  const res = await sendDailyReport(req.shopId!);
  if (!res.ok) {
    // Sababi aniq aytiladi: bot ulanmagan bo'lsa boshqa, egasi botni
    // ochmagan bo'lsa boshqa yechim kerak
    return reply.code(409).send({ error: res.reason });
  }
  return { ok: true };
});

/** Xabar qanday ko'rinishini ilovada ko'rsatish uchun (yuborilmaydi) */
/** Balans ogohlantirishini hozir hisoblab chiqish (qo'lda tekshirish uchun) */
app.post('/reminders/low-balance', { preHandler: requireOwner }, async () => runLowBalanceWarnings());

app.get('/reports/daily/preview', { preHandler: requirePerm('reports') }, async (req) => {
  const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(req.shopId) as any;
  const figures = dailyFigures(req.shopId!);
  return {
    text: reportText(shop.name, figures).replace(/<\/?b>/g, ''),
    figures,
    telegram_linked: !!(db.prepare('SELECT telegram_user_id FROM shops WHERE id = ?').get(req.shopId) as any)
      ?.telegram_user_id,
    // Ulanmagan bo'lsa ilova to'g'ridan-to'g'ri botga havola beradi
    bot: botUsername() || undefined,
  };
});

// Hisobotni CSV (Excel ochadi) qilib yuklab olish
app.get<{ Querystring: { period?: string } }>('/reports/export', { preHandler: requirePerm('reports') }, async (req, reply) => {
  const period = reportPeriodSql(req.query.period);
  // Davr boshlanishi UTC'da — indeks ishlashi uchun (tz.ts izohi)
  const periodFrom = uzPeriodStartUtc(period);
  const rows = db
    .prepare(
      `SELECT s.created_at AS sana, s.total AS summa, s.payment_type AS tolov,
              COALESCE(c.name, '') AS mijoz,
              (SELECT GROUP_CONCAT(p.name || ' x' || CASE WHEN si.qty = CAST(si.qty AS INTEGER)
                               THEN CAST(CAST(si.qty AS INTEGER) AS TEXT)
                               ELSE CAST(si.qty AS TEXT) END, '; ')
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS mahsulotlar
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.shop_id = ? AND s.created_at >= ?
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
  // Katalog bo'sh bo'lsa boshlang'ich bo'limlar va tovarlar yoziladi.
  // Admin qo'shgan ma'lumot ustidan hech qachon yozilmaydi.
  try {
    seedCatalog();
  } catch (e) {
    console.error('[katalog]', e);
  }
  markOverdueDebts();
  // Muddati o'tgan qarzlar kuniga bir marta ma'noli o'zgaradi —
  // soatiga bir tekshiruv yetarli va so'rovlar yo'lidan chiqadi
  setInterval(() => {
    try {
      markOverdueDebts();
    } catch (e) {
      console.error('[qarz]', e);
    }
  }, 60 * 60 * 1000).unref?.();

  // Kunlik to'lov. Soatiga bir marta yuriladi, lekin kuniga faqat bir
  // marta ma'no beradi: to'langan kun ikkinchi marta yechilmaydi.
  // Jarayon o'chib qolgan kunlar keyingi ishga tushishda hisoblanadi.
  const runBilling = () => {
    try {
      const n = chargeAllShops();
      if (n > 0) console.log(`[balans] ${n} ta do'kon bo'yicha kunlik yechim`);
    } catch (e) {
      console.error('[balans]', e);
    }
  };
  runBilling();
  setInterval(runBilling, 60 * 60 * 1000).unref?.();
  runReminders();
  startReminderScheduler();
  startDailyReportScheduler();
  startLowBalanceScheduler();
  if (telegramEnabled() && process.env.PUBLIC_URL) {
    setWebhook(process.env.PUBLIC_URL).then((r: any) =>
      console.log('[telegram] webhook:', r.ok ? 'ulandi' : r.description ?? r.error)
    );
  }
  console.log(`BuySale backend :${port}`);
  // Xavfli sozlamalar ochiq qolgan bo'lsa — ko'zga tashlansin
  xavflarniKorsat();
});
