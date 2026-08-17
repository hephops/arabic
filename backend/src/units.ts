// O'lchov birliklari — ilova tomonidagi miniapp/src/units.ts bilan bir xil.
//
// Nega serverda ham tekshiriladi: ilova ishonchli manba emas. Eski
// versiya, boshqa mijoz yoki ovozli kiritish "килограмм", "kilo",
// "шт" kabi ko'rinishlarni yuborishi mumkin. Bittasi ham o'tib ketsa,
// hisobotlarda bir tovar ikki xil birlikda ko'rinadi.

export const UNITS = ['dona', 'kg', 'gramm', 'litr', 'ml', 'metr'] as const;
export type Unit = (typeof UNITS)[number];

export function normalizeUnit(value: unknown): Unit {
  const v = String(value ?? '').trim().toLowerCase();
  if ((UNITS as readonly string[]).includes(v)) return v as Unit;
  if (['kilo', 'kilogramm', 'kilogram', 'кг', 'килограмм'].includes(v)) return 'kg';
  if (['g', 'gr', 'gram', 'г', 'гр', 'грамм'].includes(v)) return 'gramm';
  if (['l', 'litre', 'liter', 'л', 'литр'].includes(v)) return 'litr';
  if (['mililitr', 'мл', 'миллилитр'].includes(v)) return 'ml';
  if (['m', 'м', 'метр'].includes(v)) return 'metr';
  if (['ta', 'sht', 'шт', 'штук', 'штука'].includes(v)) return 'dona';
  return 'dona';
}

/** Donada kasr bo'lmaydi — yarim dona non yo'q */
export const isFractional = (unit: string) => normalizeUnit(unit) !== 'dona';

/**
 * Narx qaysi miqdorga aytilgani (price_qty) — ombor birligining ulushi.
 *
 * Do'konchi "semichka 10 kg keldi, 100 grami 15 ming" deydi. Ombor
 * kilogrammda yuritiladi, narx esa grammda aytiladi — bular ikki xil
 * narsa va ilgari bittaga qo'shib yuborilgan edi.
 *
 * Bazada cost_price/sell_price HAR DOIM 1 ombor birligi uchun saqlanadi
 * (sotuv, qaytarish, hisobot — hammasi shunga tayanadi). price_qty faqat
 * ko'rsatish va kiritish uchun: 0.1 bo'lsa narx "100 gramm uchun" deb
 * o'qiladi va 150 000 so'm/kg ekranda "15 000 so'm / 100 g" bo'lib chiqadi.
 */
export const PRICE_BASES: Record<Unit, number[]> = {
  dona: [1],
  metr: [1],
  kg: [1, 0.5, 0.25, 0.1],
  gramm: [1, 100, 500],
  litr: [1, 0.5, 0.25, 0.1],
  ml: [1, 100, 500],
};

/** Narx birligi musbat bo'lishi shart; ro'yxatdagi qiymatga tushsa aniq qo'yiladi */
export function normalizePriceQty(value: unknown, unit: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const allowed = PRICE_BASES[normalizeUnit(unit)];
  // Donada "yarim dona narxi" degani yo'q — bunday birlikda faqat 1
  if (allowed.length === 1) return allowed[0];
  const hit = allowed.find((a) => Math.abs(a - n) < 1e-9);
  // Ro'yxatdan tashqari qiymat ham mumkin (0.05 kg = 50 g kabi kam holat)
  return hit ?? Math.round(n * 10000) / 10000;
}

/** Miqdorni birlikka moslash: donada butun, qolganda 3 xonagacha */
export function normalizeQty(qty: number, unit: string): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return isFractional(unit) ? Math.round(qty * 1000) / 1000 : Math.floor(qty);
}
