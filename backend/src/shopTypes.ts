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

/* ─────────── Tur profili ───────────
 *
 * Ilova do'kon turiga QANDAY moslashishi — hammasi shu jadvalda.
 * Ilgari har joyda alohida shart yozilardi va bittasi unutilib
 * qolardi; endi bitta manba bor, ilova ham shuni /me orqali oladi.
 */
export interface ShopProfile {
  /** Ombor birligi sifatida tanlanadigan ro'yxat */
  units: string[];
  /** Srok (yaroqlilik muddati) maydoni kerakmi */
  expiry: boolean;
  /** Tarozi raqami (PLU) kerakmi */
  scale: boolean;
  /** Har buyum o'ziga xosmi (uzuk, telefon) — bir nom bilan
   *  birlashtirilmaydi, aks holda ikkinchisining ma'lumoti yo'qoladi */
  unique: boolean;
  /** Razmer (o'lcham) tovarning bir qismimi — kiyim, poyabzal.
   *
   *  Zargarlikdan farqi bor: u yerda HAR BUYUM yakka (unique), bu
   *  yerda esa bir o'lchamning o'ntasi bo'lishi mumkin. Lekin bir xil
   *  ko'ylakning M va L o'lchami BOSHQA-BOSHQA tovar: bitta
   *  kartochkaga qo'shilsa "20 dona ko'ylak" bo'lib qoladi va qaysi
   *  o'lchamdan nechta borligi yo'qoladi. */
  sizes: boolean;
  /** "Kam qoldi" chegarasining standarti */
  lowStock: number;
}

const P = (units: string[], o: Partial<ShopProfile> = {}): ShopProfile => ({
  units,
  expiry: false,
  scale: false,
  unique: false,
  sizes: false,
  lowStock: 5,
  ...o,
});

export const SHOP_PROFILES: Record<ShopType, ShopProfile> = {
  // Oziq-ovqat — ilovaning asosiy holati: srok ham, tarozi ham bor
  // 'metr' ham qoladi: hamma eski do'kon shu turda va ularda
  // metrda yuritiladigan tovar bo'lishi mumkin
  oziq: P(['dona', 'kg', 'litr', 'metr', 'quti', 'qop'], { expiry: true, scale: true }),
  // Atir-upa: flakon donalab, "razliv" millilitrda. Srogi bor.
  parfumeriya: P(['dona', 'ml', 'quti'], { expiry: true, lowStock: 3 }),
  xoztovar: P(['dona', 'kg', 'litr', 'metr', 'quti', 'komplekt']),
  // Har telefon yakka buyum: IMEI'si, rangi, xotirasi boshqa
  telefon: P(['dona', 'komplekt'], { unique: true, lowStock: 1 }),
  // Zargarlik: buyum donalab yuritiladi, lom esa grammda
  oltin: P(['dona', 'gramm'], { unique: true, lowStock: 0 }),
  // Kiyim-kechak va poyabzal: razmer tovarning ajralmas qismi
  kiyim: P(['dona', 'juft', 'komplekt', 'metr'], { sizes: true, lowStock: 2 }),
  qurilish: P(['dona', 'kg', 'tonna', 'metr', 'm2', 'm3', 'qop', 'rulon', 'quti', 'litr']),
  // Dorixonada srok eng muhimi
  dorixona: P(['dona', 'quti'], { expiry: true }),
  boshqa: P(['dona', 'kg', 'litr', 'metr', 'quti'], { expiry: true }),
};

/**
 * "Kam qoldi" tushunchasi shu do'konda ma'noga egami.
 *
 * Yakka buyumli do'konda (telefon, zargarlik) har kartochka BITTA
 * buyum: qoldig'i 1 dan 0 ga tushadi va yana kelmaydi. Chegara bilan
 * solishtirish esa telefon do'konida HAR BIR telefonni "tugayapti"
 * deb ko'rsatardi (qoldiq 1, chegara 1 — shart doim rost), zargarlikda
 * esa sotilgan buyum "kam qolgan" ro'yxatida osilib qolardi.
 *
 * Bunday do'konda "yana buyurtma qilish" ham ma'nosiz: aynan o'sha
 * uzuk yoki aynan o'sha IMEI qaytib kelmaydi.
 */
export function lowStockApplies(shop: { shop_type?: string | null } | string | null | undefined): boolean {
  return !shopProfile(shop).unique;
}

export function shopProfile(shop: { shop_type?: string | null } | string | null | undefined): ShopProfile {
  const type = typeof shop === 'string' ? shop : shop?.shop_type;
  return SHOP_PROFILES[normalizeShopType(type)];
}

/* ─────────── Razmer ───────────
 *
 * Kiyim do'konida "m" bilan "M" bir xil o'lcham. Tozalanmasa ikkita
 * alohida kartochka ochilib ketardi va do'konchi "nega ikkita
 * ko'ylagim bor" deb qolardi. */
export function normalizeSize(raw: unknown): string | null {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, ' ').slice(0, 40) || null;
}

/** Ikki o'lcham bir xilmi (ikkalasi ham bo'sh bo'lsa — ha) */
export function sameSize(a: unknown, b: unknown): boolean {
  return (normalizeSize(a) ?? '') === (normalizeSize(b) ?? '');
}

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
