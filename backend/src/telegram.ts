import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';
import { parseDebtText } from './voice.js';
import { normalizePhone } from './phone.js';

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

/* ─────────── Bot webhook ─────────── */

const WELCOME = `<b>Arabic.One — Do'kon Daftari</b>

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
    inline_keyboard: [[{ text: "📒 Do'kon Daftarini ochish", web_app: { url: MINIAPP_URL } }]],
  };
}

// Telegram foydalanuvchisiga bog'langan do'konni topish
function shopByTelegram(tgId: number) {
  return db.prepare('SELECT * FROM shops WHERE telegram_user_id = ?').get(tgId) as any;
}

export async function handleUpdate(update: any) {
  const msg = update.message ?? update.edited_message;
  if (!msg) return;
  const chatId = msg.chat.id;
  const tgId = msg.from?.id;
  const text: string = msg.text ?? '';

  if (text.startsWith('/start')) {
    await sendMessage(chatId, WELCOME, { reply_markup: miniAppKeyboard() });
    return;
  }
  if (text.startsWith('/help')) {
    await sendMessage(chatId, HELP, { reply_markup: miniAppKeyboard() });
    return;
  }

  const shop = tgId ? shopByTelegram(tgId) : null;
  if (!shop) {
    await sendMessage(chatId, "Avval ilovaga kiring va telefon raqamingizni tasdiqlang 👇", {
      reply_markup: miniAppKeyboard(),
    });
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
    allowed_updates: ['message', 'edited_message'],
  });
}

// Qarzdorga Telegram orqali xabar yuborish (eslatmalar uchun)
export async function notifyDebtor(chatId: number, text: string) {
  return sendMessage(chatId, text);
}
