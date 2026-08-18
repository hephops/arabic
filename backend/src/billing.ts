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

/** Bir kunlik xizmat narxi */
export function dailyPrice(): number {
  const n = Math.round(Number(getSetting('daily_price', '3300')));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Yangi do'konga beriladigan bepul kunlar */
export function trialDays(): number {
  const n = Math.round(Number(getSetting('trial_days', '14')));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Necha kun qolganda "balans tugayapti" deb ogohlantiramiz */
export function lowBalanceDays(): number {
  const n = Math.round(Number(getSetting('low_balance_days', '5')));
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
}

/**
 * Bitta do'kondan o'tkazib yuborilgan kunlarni yechadi.
 *
 * Har bir kun uchun alohida yozuv qoldirmaymiz: bir necha kun birdan
 * yechilsa balans tarixida bitta satr chiqadi ("Kunlik to'lov — 3 kun"),
 * aks holda ro'yxat kundalik mayda yozuvlar bilan to'lib ketardi.
 */
export function chargeShop(shopId: number, at = new Date()): void {
  const price = dailyPrice();
  if (price <= 0) return;
  const shop = db
    .prepare('SELECT id, balance, charged_through, is_blocked FROM shops WHERE id = ?')
    .get(shopId) as any;
  if (!shop) return;

  const today = uzToday(at);
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
  const price = dailyPrice();
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
    low: daysLeft <= lowBalanceDays(),
  };
}

/** Yangi do'kon uchun bepul kunlar bilan boshlang'ich sana */
export function trialThrough(at = new Date()): { charged_through: string; trial_ends_at: string | null } {
  const days = trialDays();
  if (days <= 0) return { charged_through: uzDayShift(-1, at), trial_ends_at: null };
  // Bugun ham bepul kunlardan biri: 14 kunlik sinov bugundan boshlab
  // 14 kun ishlaydi, 15 emas
  const end = uzDayShift(days - 1, at);
  return { charged_through: end, trial_ends_at: end };
}
