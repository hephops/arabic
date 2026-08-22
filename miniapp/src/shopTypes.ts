// Do'kon turlari — ilova shunga qarab o'zgaradi.
//
// Hozircha eng katta farq zargarlikda: u yerda har bir buyum o'ziga
// xos (o'z og'irligi va probasi bor), narx esa grammga bog'liq.
// Qolgan turlar ayni paytda faqat "kim ekanini" bildiradi — hisobot
// va keyingi sozlamalar shunga tayanadi.

export const SHOP_TYPES = [
  { id: 'oziq', emoji: '🛒' },
  { id: 'parfumeriya', emoji: '🧴' },
  { id: 'xoztovar', emoji: '🧹' },
  { id: 'telefon', emoji: '📱' },
  { id: 'oltin', emoji: '💍' },
  { id: 'kiyim', emoji: '👕' },
  { id: 'qurilish', emoji: '🧱' },
  { id: 'dorixona', emoji: '💊' },
  { id: 'boshqa', emoji: '🏪' },
] as const;

export type ShopType = (typeof SHOP_TYPES)[number]['id'];

/* ─────────── Joriy do'kon ───────────
 *
 * Tur va gramm narxlari ilovaning ko'p joyida kerak (kirim, ombor,
 * kassa), lekin ularni har ekranga alohida uzatish uzun zanjir bo'lardi.
 * Shuning uchun /me javobi bir marta shu yerga yoziladi — huquqlar
 * (perms.ts) qanday saqlansa, shunday. */
let CURRENT: { shop_type?: string; gold_prices?: string | null } | null = null;

export function setShopInfo(s: { shop_type?: string; gold_prices?: string | null } | null) {
  CURRENT = s ? { shop_type: s.shop_type, gold_prices: s.gold_prices } : null;
}

export function shopInfo() {
  return CURRENT;
}

/** Joriy do'kon zargarlikmi */
export const goldShop = (): boolean => isGold(CURRENT);

/** Zargarlik do'konimi — buyum kartochkasi boshqacha bo'ladi */
export const isGold = (shop: { shop_type?: string | null } | null | undefined): boolean =>
  String(shop?.shop_type ?? '') === 'oltin';

/** Yorliqda uchraydigan probalar (tugma bo'lib chiqadi) */
export const PROBAS = ['375', '585', '750', '916', '925', '999'];

/** Do'kon saqlagan gramm narxlari: {"585": 1100000} */
export function goldPrices(shop: { gold_prices?: string | null } | null | undefined): Record<string, number> {
  try {
    const raw = JSON.parse(String(shop?.gold_prices ?? '{}'));
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const n = Math.round(Number(v));
      if (Number.isFinite(n) && n > 0) out[String(k).replace(/\D/g, '')] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Buyum narxi: og'irligi × probasining gramm narxi.
 *
 * Serverda ham shu hisob bor (shopTypes.ts) — ekranda esa do'konchi
 * yozayotgan paytda ko'rinib tursin.
 */
export function goldPrice(
  shop: { gold_prices?: string | null } | null | undefined,
  proba: string | null | undefined,
  weight: number | null | undefined
): number | null {
  const w = Number(weight);
  if (!w || w <= 0) return null;
  const gram = goldPrices(shop)[String(proba ?? '').replace(/\D/g, '')];
  if (!gram) return null;
  return Math.round(w * gram);
}

/** "585 · 4.6 g" — ro'yxatlarda buyum tagida turadigan satr */
export function goldLine(p: {
  proba?: string | null;
  weight_g?: number | null;
  size?: string | null;
}): string {
  return [p.proba || '', p.weight_g ? `${p.weight_g} g` : '', p.size ? `№${p.size}` : '']
    .filter(Boolean)
    .join(' · ');
}
