// O'lchov birliklari.
//
// Do'konda hamma tovar donalab sotilmaydi: sabzi, semichka, go'sht,
// yog' — kilogramm yoki litrda. Birlik faqat yozuv emas, ish qoidasi:
// donada 1,5 ta bo'lmaydi, kilogrammda esa bo'ladi va bu kassada ham,
// omborda ham hisobga olinishi kerak.
//
// Ro'yxat qat'iy: erkin matn bo'lsa bir do'konda "kg", boshqasida
// "килограмм", uchinchisida "kilo" paydo bo'lardi va hisobot buzilardi.

export const UNITS = ['dona', 'kg', 'litr', 'metr'] as const;
export type Unit = (typeof UNITS)[number];

/** Kasrli miqdor mumkinmi. Donada yo'q — yarim dona non bo'lmaydi. */
export const isFractional = (unit: string | null | undefined) => (unit ?? 'dona') !== 'dona';

/** Notanish yoki bo'sh birlikni xavfsiz qiymatga keltiradi */
export function normalizeUnit(value: string | null | undefined): Unit {
  const v = (value ?? '').trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(v)) return v as Unit;
  // Eski yozuvlar va ovozli kiritishdan keladigan ko'rinishlar
  if (['kilo', 'kilogramm', 'kilogram', 'кг', 'килограмм'].includes(v)) return 'kg';
  if (['l', 'litre', 'liter', 'л', 'литр'].includes(v)) return 'litr';
  if (['m', 'м', 'метр'].includes(v)) return 'metr';
  return 'dona';
}

/**
 * Miqdorni ko'rsatish: butun bo'lsa kasrsiz.
 * 2 → "2", 1.5 → "1.5", 1.250 → "1.25"
 */
export function qtyText(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const r = Math.round(qty * 1000) / 1000;
  return Number.isInteger(r) ? String(r) : String(r);
}

/** Miqdor va birlik birga: "1.5 kg" */
export const qtyWithUnit = (qty: number, unit: string | null | undefined) =>
  `${qtyText(qty)} ${normalizeUnit(unit)}`;

/** Kiritilgan matndan miqdor: vergul ham nuqta sifatida qabul qilinadi */
export function parseQty(text: string, unit: string | null | undefined): number {
  const n = Number((text ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  // Donada kasr bo'lmaydi — pastga yaxlitlanadi
  return isFractional(unit) ? Math.round(n * 1000) / 1000 : Math.floor(n);
}
