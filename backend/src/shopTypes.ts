// Do'kon turlari.
//
// Tur ilovaning ko'rinishini o'zgartiradi: zargarlik do'konida har bir
// buyum o'ziga xos (o'z og'irligi, probasi bor) va narx grammga
// bog'liq, oziq-ovqatda esa bir xil tovar qop-qop keladi. Shuning
// uchun tur ro'yxatdan o'tishdayoq so'raladi.

export const SHOP_TYPES = [
  'oziq',        // oziq-ovqat, do'kon
  'parfumeriya', // atir-upa, kosmetika
  'xoztovar',    // xo'jalik mollari
  'telefon',     // telefon va aksessuarlar
  'oltin',       // zargarlik — alohida mantiq (proba, massa, gramm narxi)
  'kiyim',
  'qurilish',    // qurilish mollari
  'dorixona',
  'boshqa',
] as const;

export type ShopType = (typeof SHOP_TYPES)[number];

export function normalizeShopType(raw: unknown): ShopType {
  const v = String(raw ?? '').trim().toLowerCase();
  return (SHOP_TYPES as readonly string[]).includes(v) ? (v as ShopType) : 'oziq';
}

/** Zargarlik do'konimi — buyum kartochkasi boshqacha bo'ladi */
export const isGold = (shop: { shop_type?: string | null } | null | undefined): boolean =>
  String(shop?.shop_type ?? '') === 'oltin';

/* ─────────── Zargarlik: gramm narxi ─────────── */

/** Standart probalar. Ro'yxat qat'iy emas — do'konchi o'ziniki qo'shsa
 *  ham bo'ladi, lekin ekranda shular tugma bo'lib turadi. */
export const PROBAS = ['375', '585', '750', '916', '925', '999'];

/** Do'kon saqlagan gramm narxlari: {"585": 1100000, "750": 1450000} */
export function goldPrices(shop: { gold_prices?: string | null } | null | undefined): Record<string, number> {
  try {
    const raw = JSON.parse(String(shop?.gold_prices ?? '{}'));
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const price = Math.round(Number(v));
      // Faqat haqiqiy raqamlar: buzuq yozuv narxni nolga aylantirib
      // buyumni tekinga sotib yubormasin
      if (Number.isFinite(price) && price > 0) out[String(k).replace(/\D/g, '')] = price;
    }
    return out;
  } catch {
    return {};
  }
}

/** Yozishdan oldin tozalash — bazaga faqat toza JSON tushadi */
export function cleanGoldPrices(raw: unknown): string {
  const src = typeof raw === 'string' ? safeParse(raw) : raw;
  const out: Record<string, number> = {};
  if (src && typeof src === 'object') {
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const proba = String(k).replace(/\D/g, '').slice(0, 4);
      const price = Math.round(Number(v));
      if (proba && Number.isFinite(price) && price > 0) out[proba] = price;
    }
  }
  return JSON.stringify(out);
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Buyumning sotuv narxi: og'irligi × probasining gramm narxi.
 *
 * Narx yozilmagan bo'lsagina hisoblanadi — do'konchi qo'lda boshqa
 * narx qo'ysa (ishlov haqi qo'shilgan bo'lishi mumkin) o'shanisi
 * qoladi.
 */
export function goldPrice(
  shop: { gold_prices?: string | null } | null | undefined,
  proba: string | null | undefined,
  weight: number | null | undefined
): number | null {
  const w = Number(weight);
  if (!w || w <= 0) return null;
  const key = String(proba ?? '').replace(/\D/g, '');
  const gram = goldPrices(shop)[key];
  if (!gram) return null;
  return Math.round(w * gram);
}
