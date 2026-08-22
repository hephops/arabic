// Kunlik to'lov.
//
// Tarif va obuna yo'q. Do'konchi balansiga xohlagancha pul tashlaydi —
// 500 ming ham, 1 million ham, farqi yo'q — va biz har kuni o'sha
// balansdan bir kunlik narxni yechib boramiz. Do'konchi uchun bu eng
// tushunarli hisob: "pulim bor ekan — ishlayveraman".
//
// Asosiy ustun: shops.charged_through — xizmat QAYSI KUNGACHA to'langan.
//   bugundan katta yoki teng  -> xizmat ochiq
//   bugundan kichik           -> balans tugagan, xizmat to'xtagan
//
// Yechim faqat shu sanani oldinga suradi. Shuning uchun jarayon o'chib
// qolsa ham hech narsa yo'qolmaydi: keyingi safar ishga tushganda
// o'tkazib yuborilgan kunlar hisoblab olinadi.

import { db } from './db.js';
import { uzToday, uzDayShift } from './tz.js';
import { SHOP_TYPES } from './shopTypes.js';

/** Bir marta yechishda ko'pi bilan shuncha kun — cheksiz sikl bo'lmasin */
const MAX_CATCHUP_DAYS = 60;

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  );
}

/* ─────────── Do'kon turiga qarab sozlama ───────────
 *
 * Zargarlik do'koni bilan non do'koni bir xil pul to'lashi shart emas:
 * biriga kuniga 3 300, ikkinchisiga 10 000 bo'lishi mumkin. Shuning
 * uchun umumiy sozlamaning ustidan har tur uchun alohida qiymat
 * qo'yish mumkin.
 *
 * Saqlanishi: o'sha settings jadvalida, kaliti oldiga tur qo'shiladi —
 * 'daily_price' umumiy, 't_oltin_daily_price' esa faqat zargarlik
 * uchun. Yangi jadval kerak emas, eski sozlamalar joyida qoladi.
 *
 * BO'SH qiymat "ustama yo'q" degani (umumiysi ishlaydi), '0' esa
 * HAQIQIY nol — "bu turdan pul olinmaydi". Shuning uchun ular
 * farqlanadi: bo'sh satr tekshiriladi, Number() emas.
 */
const TYPE_PREFIX = 't_';

/** Tur uchun qo'yilgan ustama sozlama kaliti */
export const typeKey = (type: string, key: string): string => `${TYPE_PREFIX}${type}_${key}`;

/** Har bir tur uchun ALOHIDA qo'yilishi mumkin bo'lgan sozlamalar.
 *
 *  Bu ro'yxatda yo'q kalitlar (karta raqami, qo'llab-quvvatlash
 *  telefoni) butun kompaniya uchun bitta — ularni turga bo'lish
 *  ma'nosiz va faqat chalkashtirardi. */
export const TYPE_SETTING_KEYS = [
  'daily_price',
  'ai_question_price',
  'ai_daily_limit',
  'sms_price',
  'call_price',
  'trial_days',
  'low_balance_days',
  'low_balance_notify',
  'block_on_empty',
  'min_topup_amount',
  'referral_bonus',
  'agent_bonus',
] as const;

const TYPE_KEY_SET: ReadonlySet<string> = new Set(TYPE_SETTING_KEYS);

/**
 * Sozlama umuman qo'yilmagan bo'lsa ishlaydigan qiymatlar.
 *
 * Ilgari bu raqamlar kodning o'nta joyida alohida yozilgan edi
 * (getSetting('sms_price', '150') ...). Bittasi o'zgartirilsa
 * qolgani eski qiymat bilan qolib ketardi, admin panel esa umuman
 * bilmasdi va bo'sh maydonni "—" deb ko'rsatardi — do'kon egasi
 * haqiqatda qaysi raqam ishlayotganini ko'ra olmasdi.
 */
export const SETTING_DEFAULTS: Record<string, string> = {
  daily_price: '3300',
  ai_question_price: '0',
  ai_daily_limit: '',
  sms_price: '150',
  call_price: '900',
  trial_days: '14',
  low_balance_days: '5',
  low_balance_notify: '1',
  block_on_empty: '0',
  min_topup_amount: '10000',
  referral_bonus: '20000',
  agent_bonus: '100000',
};

/** Kalitning standart qiymati (ro'yxatda bo'lmasa — berilgani) */
export const settingDefault = (key: string, fallback = ''): string => SETTING_DEFAULTS[key] ?? fallback;

export function isTypeSettingKey(key: string): boolean {
  return TYPE_KEY_SET.has(key);
}

/** 't_oltin_daily_price' -> { type: 'oltin', key: 'daily_price' }.
 *  Tur nomida ham, kalitda ham pastki chiziq bo'lishi mumkin, shuning
 *  uchun tur ro'yxati bo'yicha solishtiriladi — bo'lib tashlash emas. */
export function parseTypeKey(full: string): { type: string; key: string } | null {
  if (!full.startsWith(TYPE_PREFIX)) return null;
  const rest = full.slice(TYPE_PREFIX.length);
  for (const t of SHOP_TYPES) {
    if (rest.startsWith(`${t}_`)) {
      const key = rest.slice(t.length + 1);
      return isTypeSettingKey(key) ? { type: t, key } : null;
    }
  }
  return null;
}

/**
 * Sozlama qiymati: avval turning O'ZI uchun qo'yilgani, bo'lmasa umumiy.
 */
export function typeSetting(type: string | null | undefined, key: string, fallback: string): string {
  const t = String(type ?? '').trim();
  if (t && isTypeSettingKey(key)) {
    const own = getSetting(typeKey(t, key), '').trim();
    if (own !== '') return own;
  }
  return getSetting(key, fallback);
}

/** Do'kon yozuvi bo'yicha (shop_type ustunidan oladi) */
export function shopSetting(
  shop: { shop_type?: string | null } | null | undefined,
  key: string,
  fallback: string
): string {
  return typeSetting(shop?.shop_type, key, fallback);
}

/** Sozlamani son qilib olish. Buzuq yozuv butun hisobni buzmasin. */
export function shopNumber(
  shop: { shop_type?: string | null } | null | undefined,
  key: string,
  fallback?: number,
  min = 0
): number {
  // Zaxira qiymat berilmasa — umumiy jadvaldan
  const def = fallback === undefined ? Number(settingDefault(key, '0')) || 0 : fallback;
  const n = Math.round(Number(shopSetting(shop, key, String(def))));
  return Number.isFinite(n) && n >= min ? n : def;
}

/**
 * Bir kunlik xizmat narxi.
 *
 * Do'kon berilsa va uning O'Z narxi qo'yilgan bo'lsa — o'shanisi.
 * Aks holda umumiy sozlamadagi narx. Har do'kon bilan kelishuv
 * boshqacha bo'lishi mumkin, umumiy narxni o'zgartirish esa hammaga
 * tegib ketardi.
 *
 * 0 ham HAQIQIY qiymat: "bu do'kondan pul olinmaydi" degani. Shuning
 * uchun NULL bilan 0 farqlanadi — null bo'lsagina umumiyga o'tiladi.
 */
export function dailyPrice(shop?: { daily_price?: number | null; shop_type?: string | null } | null): number {
  const own = shop?.daily_price;
  if (own !== null && own !== undefined && Number.isFinite(Number(own))) {
    const v = Math.round(Number(own));
    return v > 0 ? v : 0;
  }
  // Keyingi pog'ona — do'kon TURI uchun qo'yilgan narx, undan keyin umumiy
  const n = Math.round(Number(shopSetting(shop, 'daily_price', settingDefault('daily_price'))));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Yangi do'konga beriladigan bepul kunlar */
export function trialDays(type?: string | null): number {
  const n = Math.round(Number(typeSetting(type, 'trial_days', settingDefault('trial_days'))));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Necha kun qolganda "balans tugayapti" deb ogohlantiramiz */
export function lowBalanceDays(shop?: { shop_type?: string | null } | null): number {
  const n = Math.round(Number(shopSetting(shop, 'low_balance_days', settingDefault('low_balance_days'))));
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/** Sana qo'shish: '2026-08-18' + 1 -> '2026-08-19' */
function addDays(day: string, n: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Ikki sana orasidagi kunlar farqi (a - b) */
function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

export interface ServiceState {
  balance: number;
  /** xizmat qaysi kungacha to'langan */
  charged_through: string;
  /** bugun xizmat ochiqmi */
  active: boolean;
  /** bir kunlik narx */
  daily_price: number;
  /** balans va to'langan kunlar bilan birga yana necha kun yetadi */
  days_left: number;
  /** balans tugaydigan sana */
  runs_out_on: string;
  /** bepul sinov davri hali tugamaganmi */
  on_trial: boolean;
  /** ogohlantirish chegarasi */
  low: boolean;
  /** kunlik narx 0 — do'kondan pul olinmaydi, xizmat cheksiz ochiq */
  free?: boolean;
}

/**
 * Bitta do'kondan o'tkazib yuborilgan kunlarni yechadi.
 *
 * Har bir kun uchun alohida yozuv qoldirmaymiz: bir necha kun birdan
 * yechilsa balans tarixida bitta satr chiqadi ("Kunlik to'lov — 3 kun"),
 * aks holda ro'yxat kundalik mayda yozuvlar bilan to'lib ketardi.
 */
export function chargeShop(shopId: number, at = new Date()): void {
  const shop = db
    .prepare('SELECT id, balance, charged_through, is_blocked, daily_price, shop_type FROM shops WHERE id = ?')
    .get(shopId) as any;
  if (!shop) return;
  const today = uzToday(at);
  // Narx do'konning o'zinikiga qarab olinadi
  const price = dailyPrice(shop);
  if (price <= 0) {
    // Narx 0 — "bu do'kondan pul olinmaydi" degani (sovg'a, sinov,
    // hamkor do'kon). Ilgari shu yerdan qaytib ketilardi va
    // charged_through joyida qotib qolardi: ertasi kuni do'kon
    // "to'xtagan" bo'lib ko'rinardi, ilovada esa "balansni to'ldiring"
    // degan qizil tasma chiqardi. Bepul do'kon uchun sana oldinga
    // suriladi, balansdan esa hech narsa yechilmaydi.
    const ct = String(shop.charged_through ?? '');
    const yaroqli = /^\d{4}-\d{2}-\d{2}$/.test(ct);
    if (!yaroqli || dayDiff(today, ct) > 0) {
      db.prepare('UPDATE shops SET charged_through = ? WHERE id = ?').run(today, shopId);
    }
    return;
  }

  let through: string = shop.charged_through ?? today;
  // Sana buzuq bo'lsa bugundan boshlaymiz — hisob orqaga ketmasin
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) through = today;

  let balance = Number(shop.balance) || 0;
  let days = 0;
  while (dayDiff(today, through) > 0 && balance >= price && days < MAX_CATCHUP_DAYS) {
    balance -= price;
    through = addDays(through, 1);
    days++;
  }
  if (days === 0) {
    // charged_through bo'sh bo'lgan eski yozuvlarni to'g'rilab qo'yamiz
    if (!shop.charged_through) db.prepare('UPDATE shops SET charged_through = ? WHERE id = ?').run(through, shopId);
    return;
  }

  const total = days * price;
  db.prepare('UPDATE shops SET balance = ?, charged_through = ? WHERE id = ?').run(balance, through, shopId);
  db.prepare(
    "INSERT INTO balance_transactions (shop_id, type, amount, note) VALUES (?, 'daily', ?, ?)"
  ).run(shopId, -total, `Kunlik to'lov — ${days} kun`);
}

/** Hamma do'kon bo'yicha yechim. Kuniga bir marta yetarli, lekin
 *  qayta chaqirilsa ham xavfsiz — to'langan kun ikki marta yechilmaydi. */
export function chargeAllShops(at = new Date()): number {
  const today = uzToday(at);
  const rows = db
    .prepare(
      `SELECT id FROM shops
       WHERE is_blocked = 0 AND (charged_through IS NULL OR charged_through < ?)`
    )
    .all(today) as any[];
  for (const r of rows) {
    try {
      chargeShop(r.id, at);
    } catch (e) {
      console.warn(`[billing] do'kon ${r.id} bo'yicha yechim bajarilmadi:`, e);
    }
  }
  return rows.length;
}

/** Do'konning xizmat holati — ilova va admin panel shuni ko'rsatadi */
export function serviceState(shop: any, at = new Date()): ServiceState {
  const price = dailyPrice(shop);
  // Narx 0 — do'kondan pul olinmaydi. Bunda "yana necha kun yetadi"
  // degan savolning ma'nosi yo'q: xizmat cheksiz ochiq. Ilgari
  // days_left 1 chiqib, do'konchi har kuni "balans tugayapti" degan
  // sariq ogohlantirishni ko'rardi.
  if (price <= 0) {
    const bugun = uzToday(at);
    return {
      balance: Number(shop?.balance) || 0,
      charged_through: bugun,
      active: true,
      daily_price: 0,
      days_left: 0,
      runs_out_on: bugun,
      on_trial: !!shop?.trial_ends_at && shop.trial_ends_at >= bugun,
      low: false,
      free: true,
    };
  }
  const today = uzToday(at);
  const through: string =
    shop?.charged_through && /^\d{4}-\d{2}-\d{2}$/.test(shop.charged_through) ? shop.charged_through : today;
  const balance = Number(shop?.balance) || 0;
  const active = dayDiff(through, today) >= 0;
  // "Yana necha kun ishlaydi" — bugun ham hisobga kiradi: xizmat bugunga
  // to'langan bo'lsa, do'konchi uchun bu "bugun ishlayapti" degani.
  // Oldindan to'langan kunlar + balansga yana nechta kun sig'adi.
  const affordable = price > 0 ? Math.floor(balance / price) : 0;
  const daysLeft = active ? dayDiff(through, today) + 1 + affordable : 0;
  const onTrial = !!shop?.trial_ends_at && shop.trial_ends_at >= today;
  return {
    balance,
    charged_through: through,
    active,
    daily_price: price,
    days_left: daysLeft,
    // Xizmat ishlaydigan oxirgi kun
    runs_out_on: addDays(today, Math.max(0, daysLeft - 1)),
    on_trial: onTrial,
    low: daysLeft <= lowBalanceDays(shop),
  };
}

/** Yangi do'kon uchun bepul kunlar bilan boshlang'ich sana */
export function trialThrough(at = new Date(), type?: string | null): { charged_through: string; trial_ends_at: string | null } {
  const days = trialDays(type);
  if (days <= 0) return { charged_through: uzDayShift(-1, at), trial_ends_at: null };
  // Bugun ham bepul kunlardan biri: 14 kunlik sinov bugundan boshlab
  // 14 kun ishlaydi, 15 emas
  const end = uzDayShift(days - 1, at);
  return { charged_through: end, trial_ends_at: end };
}
