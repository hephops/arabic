// Do'kon turlari — ilova shunga qarab o'zgaradi.
//
// Hozircha eng katta farq zargarlikda: u yerda har bir buyum o'ziga
// xos (o'z og'irligi va probasi bor), narx esa grammga bog'liq.
// Qolgan turlar ayni paytda faqat "kim ekanini" bildiradi — hisobot
// va keyingi sozlamalar shunga tayanadi.

import { translate } from './i18n';

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

/* ─────────── Namunalar (placeholder) ───────────
 *
 * Bo'sh maydonda turadigan kulrang yozuv shunchaki bezak emas: u
 * do'konchiga "bu yerga nima yoziladi" ni ko'rsatadi. Zargarlik
 * do'konida "Coca-Cola 1.5L" degan namuna esa aksincha — ilova boshqa
 * do'kon uchun yozilgandek tuyuladi.
 *
 * Nom va bo'lim tarjima qilinadi (i18n: exName_*, exCat_*), raqamlar
 * esa shu yerda: ular tilga bog'liq emas.
 */
interface Examples {
  /** shtrix-kod / birka raqami namunasi */
  code: string;
  /** nechta keldi */
  qty: string;
  /** kirim narxi */
  cost: string;
  /** sotuv narxi */
  sell: string;
}

const EXAMPLES: Record<string, Examples> = {
  oziq: { code: '4780000123456', qty: '24', cost: '14 000', sell: '15 000' },
  parfumeriya: { code: '3348901250146', qty: '6', cost: '450 000', sell: '620 000' },
  xoztovar: { code: '4780000123456', qty: '12', cost: '18 000', sell: '24 000' },
  telefon: { code: '194252707371', qty: '1', cost: '8 500 000', sell: '9 200 000' },
  // Zargarlikda birkadagi raqam zavod kodi emas — o'z raqami
  oltin: { code: '4211704576488789', qty: '1', cost: '3 000 000', sell: '5 060 000' },
  kiyim: { code: '2000000000015', qty: '10', cost: '90 000', sell: '150 000' },
  qurilish: { code: '4780000123456', qty: '50', cost: '48 000', sell: '55 000' },
  dorixona: { code: '4780000123456', qty: '30', cost: '6 500', sell: '9 000' },
  boshqa: { code: '4780000123456', qty: '10', cost: '10 000', sell: '15 000' },
};

/** Shu do'kon turi uchun namuna raqamlar */
export function examples(type?: string | null): Examples {
  return EXAMPLES[String(type ?? CURRENT?.shop_type ?? 'oziq')] ?? EXAMPLES.oziq;
}

/** Namuna nom yoki bo'lim — tarjimasi bilan */
export function exampleText(kind: 'Name' | 'Cat', type?: string | null): string {
  const t = String(type ?? CURRENT?.shop_type ?? 'oziq');
  const key = `ex${kind}_${t}`;
  const text = translate(key);
  // Kalit topilmasa translate kalitning o'zini qaytaradi — oziq-ovqatga qaytamiz
  return text === key ? translate(`ex${kind}_oziq`) : text;
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

/**
 * Ekrandagi narx maydoniga qanday son yozilishi kerak.
 *
 * `goldPrice()` BUTUN buyum narxini beradi (massa × gramm narxi).
 * Lekin ombor birligi 'gramm' bo'lsa narx maydoni "1 gramm qancha"
 * degan ma'noni bildiradi — u yerga butun buyum narxi yozilsa,
 * buyum narxi og'irligiga yana bir marta ko'paytirilib ketardi
 * (4.6 g uzuk 5 060 000 emas, 23 276 000 so'm bo'lib qolardi).
 *
 * Shuning uchun birlik 'gramm' bo'lsa gramm narxining o'zi qaytadi.
 */
export function goldFieldPrice(
  shop: { gold_prices?: string | null } | null | undefined,
  proba: string | null | undefined,
  weight: number | null | undefined,
  unit: string
): number | null {
  if (unit === 'gramm' || unit === 'g') {
    const gram = goldPrices(shop)[String(proba ?? '').replace(/\D/g, '')];
    return gram || null;
  }
  return goldPrice(shop, proba, weight);
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

/* ─────────── Zargarlik: buyum turlari ───────────
 *
 * Zargarlik do'konida hamma buyum bir xil nom bilan yoziladi
 * ("Uzuk 585"), shuning uchun ombor bir uyum bo'lib ko'rinadi.
 * Kategoriya buni ajratadi: uzuklar alohida, zanjirlar alohida,
 * komplektlar alohida — Ombor ekranidagi chiplar shu bo'yicha
 * saraladi.
 *
 * Ro'yxat qat'iy emas: do'konchi o'z so'zini yozsa ham bo'ladi,
 * bular faqat bir bosishda qo'yiladigan tayyor variantlar.
 */
export const GOLD_CATEGORIES = [
  'Uzuk',
  "Sirg'a",
  'Zanjir',
  'Tros',
  'Bilaguzuk',
  'Kulon',
  'Bilarzik',
  'Komplekt',
  'Tish',
  'Lom',
];
