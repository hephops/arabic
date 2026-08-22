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

/* ─────────── Tur profili ───────────
 *
 * Serverdagi backend/src/shopTypes.ts bilan BIR XIL bo'lishi shart.
 * Ilova ekranni shunga qarab yig'adi, server esa xuddi shu jadval
 * bo'yicha tekshiradi — ikkovi ajralib qolsa, do'konchi ekranda
 * ko'rgan narsa saqlanmay qoladi. */
export interface ShopProfile {
  units: string[];
  expiry: boolean;
  scale: boolean;
  unique: boolean;
  lowStock: number;
}

const P = (units: string[], o: Partial<ShopProfile> = {}): ShopProfile => ({
  units,
  expiry: false,
  scale: false,
  unique: false,
  lowStock: 5,
  ...o,
});

export const SHOP_PROFILES: Record<string, ShopProfile> = {
  // 'metr' ham qoladi: hamma eski do'kon shu turda va ularda
  // metrda yuritiladigan tovar bo'lishi mumkin
  oziq: P(['dona', 'kg', 'litr', 'metr', 'quti', 'qop'], { expiry: true, scale: true }),
  parfumeriya: P(['dona', 'ml', 'quti'], { expiry: true, lowStock: 3 }),
  xoztovar: P(['dona', 'kg', 'litr', 'metr', 'quti', 'komplekt']),
  telefon: P(['dona', 'komplekt'], { unique: true, lowStock: 1 }),
  oltin: P(['dona', 'gramm'], { unique: true, lowStock: 0 }),
  kiyim: P(['dona', 'juft', 'komplekt', 'metr'], { lowStock: 2 }),
  qurilish: P(['dona', 'kg', 'tonna', 'metr', 'm2', 'm3', 'qop', 'rulon', 'quti', 'litr']),
  dorixona: P(['dona', 'quti'], { expiry: true }),
  boshqa: P(['dona', 'kg', 'litr', 'metr', 'quti'], { expiry: true }),
};

/** Joriy do'konning profili (tur noma'lum bo'lsa — oziq-ovqat) */
export function profile(type?: string | null): ShopProfile {
  return SHOP_PROFILES[String(type ?? CURRENT?.shop_type ?? 'oziq')] ?? SHOP_PROFILES.oziq;
}

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

/** "585 · 4.6 g · №18" — ro'yxatlarda buyum tagida turadigan satr.
 *
 *  Bir xil nomli o'nta uzukni faqat shu satr ajratadi, shuning uchun
 *  do'konchi kiritgan hamma belgi (vstavka ham) shu yerga chiqadi. */
export function goldLine(p: {
  proba?: string | null;
  weight_g?: number | null;
  size?: string | null;
  stone?: string | null;
}): string {
  const clean = (v?: string | null) => {
    const s = String(v ?? '').trim();
    // "-" — do'konchi "yo'q" degani, uni ko'rsatish shovqin
    return s && s !== '-' && s !== '—' ? s : '';
  };
  return [
    clean(p.proba),
    p.weight_g ? `${p.weight_g} g` : '',
    clean(p.size) ? `№${clean(p.size)}` : '',
    clean(p.stone),
  ]
    .filter(Boolean)
    .join(' · ');
}
