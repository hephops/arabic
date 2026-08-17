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

/** Miqdorni birlikka moslash: donada butun, qolganda 3 xonagacha */
export function normalizeQty(qty: number, unit: string): number {
  if (!Number.isFinite(qty) || qty <= 0) return 0;
  return isFractional(unit) ? Math.round(qty * 1000) / 1000 : Math.floor(qty);
}
