import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { parseDebtText } from './voice.js';
import { normalizePhone } from './phone.js';
import { verifyCustomerCode, purchasesText, customerBalance } from './customerLink.js';
import { bt, langFromTelegram, normalizeLang, type BotLang } from './botText.js';
import { pendingCode, OTP_TTL_MS } from './otp.js';

// Telegram Bot API va Mini App integratsiyasi.
// Token .env faylida (TELEGRAM_BOT_TOKEN) — kodga yozilmaydi.

const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
// Manzil sozlanadi — shunda yuborish yo'lini haqiqiy Telegram'siz ham
// (soxta server bilan) uchidan-uchiga sinab ko'rish mumkin
const API = `${process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org'}/bot${TOKEN}`;
const MINIAPP_URL = process.env.MINIAPP_URL ?? '';

export const telegramEnabled = () => TOKEN.length > 0;

/* ─────────── Bot API ─────────── */

export async function callTelegram(method: string, payload: Record<string, unknown>) {
  if (!telegramEnabled()) return { ok: false, error: 'no_token' };
  try {
    const res = await fetch(`${API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e) {
    console.error('[telegram]', method, e);
    return { ok: false, error: String(e) };
  }
}

export const sendMessage = (chatId: number | string, text: string, extra: Record<string, unknown> = {}) =>
  callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });

/* ─────────── Mini App avtorizatsiyasi (initData) ─────────── */

// Telegram initData'ni tekshirish: https://core.telegram.org/bots/webapps#validating-data
export function verifyInitData(initData: string): { id: number; first_name?: string; username?: string } | null {
  if (!telegramEnabled() || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const a = Buffer.from(hash);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  // 24 soatdan eski ma'lumotni qabul qilmaymiz
  const authDate = Number(params.get('auth_date') ?? 0);
  if (authDate && Date.now() / 1000 - authDate > 86_400) return null;

  try {
    return JSON.parse(params.get('user') ?? 'null');
  } catch {
    return null;
  }
}

/* ─────────── Til va raqam ulash ─────────── */

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? '';
export const botUsername = () => BOT_USERNAME.replace(/^@/, '');

/**
 * Foydalanuvchi qaysi tilda gaplashadi.
 *
 * Tartib muhim: do'konchi ilovada tanlagan til birinchi o'rinda turadi —
 * u ataylab tanlangan. Undan keyin ulanishda saqlangani, oxirida
 * Telegram'ning o'z tili (faqat taxmin).
 */
export function langFor(tgId?: number | null, fallbackCode?: string | null): BotLang {
  if (tgId) {
    const shop = db.prepare('SELECT language FROM shops WHERE telegram_user_id = ?').get(tgId) as any;
    if (shop?.language) return normalizeLang(shop.language);
    const link = db
      .prepare('SELECT language, phone FROM telegram_links WHERE telegram_user_id = ? LIMIT 1')
      .get(tgId) as any;
    // Bog'lanish raqami bo'yicha do'kon topilsa — uning tili kuchliroq:
    // do'konchi ilovada ataylab tanlagan
    if (link?.phone) {
      const byPhone = db.prepare('SELECT language FROM shops WHERE phone = ?').get(link.phone) as any;
      if (byPhone?.language) return normalizeLang(byPhone.language);
    }
    if (link?.language) return normalizeLang(link.language);
  }
  return langFromTelegram(fallbackCode);
}

/** Telefon raqami bo'yicha til: do'kon tanlagani, bo'lmasa taxmin */
export function langForPhone(phone: string, fallbackCode?: string | null): BotLang {
  const shop = db.prepare('SELECT language FROM shops WHERE phone = ?').get(phone) as any;
  if (shop?.language) return normalizeLang(shop.language);
  const link = db.prepare('SELECT language FROM telegram_links WHERE phone = ?').get(phone) as any;
  if (link?.language) return normalizeLang(link.language);
  return langFromTelegram(fallbackCode);
}

/**
 * Botga to'g'ridan-to'g'ri havola: bosilishi bilan bot ochiladi va
 * /start O'ZI bosiladi — do'konchi hech narsa yozmaydi, raqamini ham
 * yubormaydi. Havola ichida raqam bor, shuning uchun bot kimga kod
 * yuborishni darhol biladi.
 *
 * Raqam imzolanadi: aks holda birov havolani qo'lda yasab, begona
 * raqamning kodini o'ziga oldirib olardi.
 *
 * Telegram start parametri: faqat A-Z a-z 0-9 _ - va 64 belgigacha.
 * Shuning uchun "otp" + 12 raqam + 16 belgili imzo = 31 belgi.
 */
const OTP_PREFIX = 'otp';

function signPhone(phone: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod')
    .update(`otp:${phone}`)
    .digest('hex')
    .slice(0, 16);
}

export function otpDeepLink(phone: string): string | null {
  const bot = botUsername();
  const digits = phone.replace(/\D/g, '');
  if (!bot || digits.length !== 12) return null;
  return `https://t.me/${bot}?start=${OTP_PREFIX}${digits}${signPhone(phone)}`;
}

/** Havoladagi raqamni tekshirib qaytaradi (imzo to'g'ri bo'lsa) */
function phoneFromPayload(payload: string): string | null {
  if (!payload.startsWith(OTP_PREFIX)) return null;
  const body = payload.slice(OTP_PREFIX.length);
  if (body.length !== 28) return null;
  const digits = body.slice(0, 12);
  const sig = body.slice(12);
  if (!/^\d{12}$/.test(digits)) return null;
  const phone = `+${digits}`;
  const expected = signPhone(phone);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return phone;
}

/** Telefon raqami bo'yicha ulangan Telegram chatini topish */
export function chatForPhone(phone: string): number | null {
  const link = db.prepare('SELECT chat_id FROM telegram_links WHERE phone = ?').get(phone) as any;
  if (link?.chat_id) return Number(link.chat_id);
  // Ilgari ro'yxatdan o'tgan do'konda bog'lanish bo'lishi mumkin
  const shop = db.prepare('SELECT telegram_user_id FROM shops WHERE phone = ? AND telegram_user_id IS NOT NULL').get(phone) as any;
  return shop?.telegram_user_id ? Number(shop.telegram_user_id) : null;
}

/** Kirish kodini botga yuborish. Ulanmagan bo'lsa false qaytadi. */
export async function sendLoginCode(phone: string, code: string): Promise<boolean> {
  const chatId = chatForPhone(phone);
  if (!chatId) return false;
  const res: any = await sendMessage(chatId, codeMessage(langForPhone(phone), code));
  return !!res?.ok;
}

/**
 * Kod xabari.
 *
 * Kod <code> ichida yuboriladi — Telegram bunday matnni bosilganda
 * nusxalaydi. Do'konchi raqamlarni qo'lda ko'chirmaydi: bosadi,
 * ilovaga qaytadi va qo'yadi.
 */
function codeMessage(lang: BotLang, code: string): string {
  return (
    `${bt(lang, 'codeTitle')}\n\n<code>${code}</code>\n\n` +
    bt(lang, 'codeHint', { min: Math.round(OTP_TTL_MS / 60000) })
  );
}

/** Raqamni ulash tugmasi bilan klaviatura */
function shareKeyboard(lang: BotLang) {
  return {
    keyboard: [[{ text: bt(lang, 'shareBtn'), request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

/* ─────────── Bot webhook ─────────── */

const WELCOME = `<b>BuySale — Savdo, ombor, foyda</b>

Qarz daftari, ombor va kassa — bitta ilovada.

• Qarzlarni <b>ovoz bilan</b> yozing
• Muddat kelganda tizim <b>o'zi eslatadi</b>
• Shtrix-kod bilan sotuv va ombor hisobi

Boshlash uchun pastdagi tugmani bosing 👇`;

const HELP = `<b>Buyruqlar</b>

/start — ilovani ochish
/qarz — qarz yozish (matn yoki ovozli xabar yuboring)
/help — yordam

<b>Tez usul:</b> shunchaki ovozli xabar yuboring —
masalan «Karim akaga 120 ming, shanbagacha» —
tizim uni qarz yozuviga aylantiradi.`;

function miniAppKeyboard() {
  if (!MINIAPP_URL) return undefined;
  return {
    inline_keyboard: [[{ text: "🛒 BuySale ni ochish", web_app: { url: MINIAPP_URL } }]],
  };
}

// Telegram foydalanuvchisiga bog'langan do'konni topish
function shopByTelegram(tgId: number) {
  return db.prepare('SELECT * FROM shops WHERE telegram_user_id = ?').get(tgId) as any;
}

// Telegram foydalanuvchisiga bog'langan MIJOZ yozuvlari.
// Bitta odam bir necha do'konning mijozi bo'lishi mumkin.
function customersByTelegram(tgId: number) {
  return db
    .prepare(
      `SELECT c.*, s.name AS shop_name FROM customers c JOIN shops s ON s.id = c.shop_id
       WHERE c.telegram_user_id = ? ORDER BY c.id`
    )
    .all(tgId) as any[];
}

const CUSTOMER_KEYS = {
  keyboard: [[{ text: '🧾 Xaridlarim' }, { text: '📒 Qarzim' }]],
  resize_keyboard: true,
};


export async function handleUpdate(update: any) {
  const msg = update.message ?? update.edited_message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const tgId = msg.from?.id;
  const text: string = msg.text ?? '';
  const lang = langFor(tgId, msg.from?.language_code);

  // Raqam yuborildi — ulaymiz va kutayotgan kod bo'lsa darhol jo'natamiz.
  //
  // Faqat O'ZINING raqamini qabul qilamiz: Telegram boshqa odamning
  // kontaktini ham yuborishga ruxsat beradi, u bilan begona hisobga
  // kirish kodini olib bo'lardi.
  if (msg.contact) {
    if (msg.contact.user_id && msg.contact.user_id !== tgId) {
      await sendMessage(chatId, bt(lang, 'sharePrompt'), { reply_markup: shareKeyboard(lang) });
      return;
    }
    const phone = normalizePhone(msg.contact.phone_number);
    if (!phone) {
      await sendMessage(chatId, bt(lang, 'sharePrompt'), { reply_markup: shareKeyboard(lang) });
      return;
    }
    db.prepare(
      `INSERT INTO telegram_links (phone, telegram_user_id, chat_id, language, first_name)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET
         telegram_user_id = excluded.telegram_user_id,
         chat_id = excluded.chat_id,
         first_name = excluded.first_name`
    ).run(phone, tgId, chatId, lang, msg.contact.first_name ?? null);
    // Shu raqamli do'kon bo'lsa — unga ham bog'laymiz, kechki hisobot
    // va eslatmalar shu chatga borishi uchun
    db.prepare('UPDATE shops SET telegram_user_id = ? WHERE phone = ?').run(tgId, phone);

    const waiting = pendingCode(phone);
    await sendMessage(chatId, bt(lang, 'linked'), { reply_markup: { remove_keyboard: true } });
    if (waiting) {
      await sendMessage(chatId, codeMessage(lang, waiting));
    } else {
      await sendMessage(chatId, bt(lang, 'noPending'), { reply_markup: miniAppKeyboard() });
    }
    return;
  }

  if (text.startsWith('/start')) {
    // Havolada mijoz kodi bo'lishi mumkin: t.me/bot?start=c<id>.<imzo>
    const payload = text.slice('/start'.length).trim();

    // Kirish havolasi: ilovadagi tugma shuni ochadi va /start o'zi
    // bosiladi. Raqam havola ichida — do'konchi hech narsa yozmaydi.
    const otpPhone = phoneFromPayload(payload);
    if (otpPhone) {
      // Til do'konning o'zidan olinadi. Telegram tilidan taxmin qilish
      // xato berardi: do'konchining Telegrami ruscha bo'lsa ham ilovada
      // o'zbekchani tanlagan bo'lishi mumkin.
      const otpLang = langForPhone(otpPhone, msg.from?.language_code);
      db.prepare(
        `INSERT INTO telegram_links (phone, telegram_user_id, chat_id, language, first_name)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(phone) DO UPDATE SET
           telegram_user_id = excluded.telegram_user_id,
           chat_id = excluded.chat_id,
           first_name = excluded.first_name`
      ).run(otpPhone, tgId, chatId, otpLang, msg.from?.first_name ?? null);
      db.prepare('UPDATE shops SET telegram_user_id = ? WHERE phone = ?').run(tgId, otpPhone);

      const waiting = pendingCode(otpPhone);
      if (waiting) {
        await sendMessage(chatId, codeMessage(otpLang, waiting));
      } else {
        // Kod eskirgan — ilovada qaytadan so'ralsin
        await sendMessage(chatId, bt(otpLang, 'codeExpired'), { reply_markup: miniAppKeyboard() });
      }
      return;
    }
    if (payload.startsWith('c')) {
      const customerId = verifyCustomerCode(payload.slice(1));
      const customer = customerId
        ? (db.prepare('SELECT c.*, s.name AS shop_name FROM customers c JOIN shops s ON s.id = c.shop_id WHERE c.id = ?').get(customerId) as any)
        : null;
      if (!customer) {
        await sendMessage(chatId, "Havola yaroqsiz yoki eskirgan. Do'kondan yangi havola so'rang.");
        return;
      }
      db.prepare('UPDATE customers SET telegram_user_id = ? WHERE id = ?').run(tgId, customer.id);
      const balance = customerBalance(customer.id);
      await sendMessage(
        chatId,
        `✅ Ulandingiz!\n\n<b>${customer.shop_name}</b> do'konidagi xaridlaringiz endi shu yerga keladi.` +
          (balance > 0 ? `\n\n📒 Hozirgi qarzingiz: <b>${new Intl.NumberFormat('ru-RU').format(balance).replace(/ /g, ' ')} so'm</b>` : ''),
        { reply_markup: CUSTOMER_KEYS }
      );
      return;
    }
    await sendMessage(chatId, bt(lang, 'welcome'), { reply_markup: miniAppKeyboard() });
    return;
  }
  if (text.startsWith('/help')) {
    await sendMessage(chatId, bt(lang, 'help'), { reply_markup: miniAppKeyboard() });
    return;
  }
  // Kodni qayta yuborish
  if (/^\/(kod|code|код)\b/i.test(text)) {
    const link = tgId
      ? (db.prepare('SELECT phone FROM telegram_links WHERE telegram_user_id = ? LIMIT 1').get(tgId) as any)
      : null;
    const waiting = link?.phone ? pendingCode(link.phone) : null;
    if (waiting) {
      await sendMessage(chatId, codeMessage(lang, waiting));
    } else {
      await sendMessage(chatId, bt(lang, 'noPending'), { reply_markup: miniAppKeyboard() });
    }
    return;
  }

  const shop = tgId ? shopByTelegram(tgId) : null;

  // Mijoz buyruqlari. Do'kon egasi ham mijoz bo'lishi mumkin, shuning
  // uchun avval aniq buyruq matnini tekshiramiz — aks holda "Qarzim"
  // so'zi qarz yozuvi deb tushunilib qolardi.
  const customers = tgId ? customersByTelegram(tgId) : [];
  if (customers.length > 0) {
    const wantsPurchases = /^(🧾\s*)?(xaridlarim|мои покупки|покупки)$/i.test(text.trim());
    const wantsDebt = /^(📒\s*)?(qarzim|мой долг|долг)$/i.test(text.trim());
    if (wantsPurchases || wantsDebt) {
      for (const c of customers) {
        if (wantsPurchases) {
          await sendMessage(chatId, purchasesText(c.id), { reply_markup: CUSTOMER_KEYS });
        } else {
          const b = customerBalance(c.id);
          const sum = new Intl.NumberFormat('ru-RU').format(b).replace(/ /g, ' ');
          await sendMessage(
            chatId,
            b > 0
              ? `<b>${c.shop_name}</b>\n📒 Qarzingiz: <b>${sum} so'm</b>`
              : `<b>${c.shop_name}</b>\n✅ Qarzingiz yo'q`,
            { reply_markup: CUSTOMER_KEYS }
          );
        }
      }
      return;
    }
  }

  if (!shop) {
    // Mijoz bo'lsa — unga do'konchi ko'rsatmasi emas, o'z tugmalari kerak
    if (customers.length > 0) {
      await sendMessage(chatId, 'Pastdagi tugmalardan foydalaning 👇', { reply_markup: CUSTOMER_KEYS });
      return;
    }
    await sendMessage(chatId, bt(lang, 'noPending'), { reply_markup: miniAppKeyboard() });
    return;
  }

  // Ovozli xabar — STT ulanganda matnga aylantiriladi
  if (msg.voice || msg.audio) {
    await sendMessage(
      chatId,
      "🎤 Ovozli xabar qabul qilindi.\nOvozni matnga aylantirish (Mohir.ai) hali ulanmagan — hozircha matn ko'rinishida yuboring, masalan: «Karim akaga 120 ming, shanbagacha»."
    );
    return;
  }

  // Matnni qarz yozuviga aylantiramiz
  const cleaned = text.replace(/^\/qarz\s*/i, '').trim();
  if (!cleaned) {
    await sendMessage(chatId, HELP, { reply_markup: miniAppKeyboard() });
    return;
  }

  const parsed = parseDebtText(cleaned);
  if (!parsed) {
    await sendMessage(
      chatId,
      "Tushunolmadim 🤔\nMasalan shunday yozing: «Karim akaga 120 ming so'm, shanbagacha»"
    );
    return;
  }

  // Matndagi telefon raqami (bo'lsa) — qarzdorga eslatma shunga boradi
  const phoneInText = normalizePhone((cleaned.match(/(\+?998[\s-]?\d[\d\s-]{7,})|(\b\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}\b)/) ?? [])[0] ?? '');

  // Mijozni topamiz yoki yaratamiz
  let customer = ((phoneInText
    ? db.prepare('SELECT * FROM customers WHERE shop_id = ? AND phone = ?').get(shop.id, phoneInText)
    : null) ??
    db
      .prepare('SELECT * FROM customers WHERE shop_id = ? AND name = ? COLLATE NOCASE')
      .get(shop.id, parsed.customer_name)) as any;

  if (!customer) {
    // Yangi qarzdor — telefonsiz yozilmaydi, aks holda eslatma yubora olmaymiz
    if (!phoneInText) {
      await sendMessage(
        chatId,
        `📞 <b>${parsed.customer_name}</b> hali ro'yxatda yo'q.\n\n` +
          "Yangi qarzdorning telefon raqamini ham yozing — eslatma va qo'ng'iroq o'sha raqamga boradi.\n\n" +
          `Masalan: «${cleaned} 90 123 45 67»`,
        { reply_markup: miniAppKeyboard() }
      );
      return;
    }
    const info = db
      .prepare('INSERT INTO customers (shop_id, name, phone, reminder_mode) VALUES (?, ?, ?, ?)')
      .run(shop.id, parsed.customer_name, phoneInText, shop.default_reminder_mode ?? 'soft');
    customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  } else if (!customer.phone) {
    if (!phoneInText) {
      await sendMessage(
        chatId,
        `📞 <b>${customer.name}</b> ning telefon raqami yo'q.\n\n` +
          "Raqamni ham qo'shib yozing — eslatma va qo'ng'iroq o'sha raqamga boradi.",
        { reply_markup: miniAppKeyboard() }
      );
      return;
    }
    db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phoneInText, customer.id);
    customer.phone = phoneInText;
  }
  db.prepare(
    "INSERT INTO debts (shop_id, customer_id, amount, note, due_date, source) VALUES (?, ?, ?, ?, ?, 'voice')"
  ).run(shop.id, customer.id, parsed.amount, parsed.note, parsed.due_date);

  const sum = new Intl.NumberFormat('uz-UZ').format(parsed.amount);
  await sendMessage(
    chatId,
    `✅ Yozildi\n\n<b>${customer.name}</b> — ${sum} so'm` +
      (parsed.due_date ? `\nMuddat: ${parsed.due_date}` : '') +
      (parsed.note ? `\nIzoh: ${parsed.note}` : ''),
    { reply_markup: miniAppKeyboard() }
  );
}

/* ─────────── Ishga tushirish yordamchilari ─────────── */

// Webhook manzilini Telegram'ga ro'yxatdan o'tkazish (server ishga tushganda bir marta)
export async function setWebhook(publicUrl: string) {
  if (!telegramEnabled() || !publicUrl) return { ok: false, error: 'not_configured' };
  return callTelegram('setWebhook', {
    url: `${publicUrl.replace(/\/$/, '')}/telegram/webhook`,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    // contact xabari ham 'message' ichida keladi
    allowed_updates: ['message', 'edited_message'],
  });
}

// Qarzdorga Telegram orqali xabar yuborish (eslatmalar uchun)
export async function notifyDebtor(chatId: number, text: string) {
  return sendMessage(chatId, text);
}
