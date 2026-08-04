// Xarajat kategoriyalari — server kalitlari bilan bir xil.
// Xarajatlar ekrani ham, Hisobot ham shu ro'yxatdan foydalanadi,
// shuning uchun nom va ikonka ikki joyda bir xil ko'rinadi.

export interface ExpenseCat {
  id: string;
  key: string;
  glyph: string;
  color: string;
}

export const EXPENSE_CATS: ExpenseCat[] = [
  { id: 'rent', key: 'expCatRent', glyph: 'house', color: 'blue' },
  { id: 'utilities', key: 'expCatUtilities', glyph: 'warning', color: 'yellow' },
  { id: 'salary', key: 'expCatSalary', glyph: 'employee', color: 'teal' },
  { id: 'transport', key: 'expCatTransport', glyph: 'truck', color: 'amber' },
  { id: 'tax', key: 'expCatTax', glyph: 'book', color: 'indigo' },
  { id: 'ads', key: 'expCatAds', glyph: 'star', color: 'purple' },
  { id: 'repair', key: 'expCatRepair', glyph: 'gear', color: 'gray' },
  { id: 'other', key: 'expCatOther', glyph: 'wallet', color: 'pink' },
];

/** Kalitni odam o'qiydigan nomga aylantiradi; do'konchi o'zi yozgan bo'lsa — o'zicha qoladi */
export function expenseCatLabel(id: string, t: (k: string) => string): string {
  const known = EXPENSE_CATS.find((c) => c.id === id);
  return known ? t(known.key) : id;
}

export function expenseCatIcon(id: string): { glyph: string; color: string } {
  const known = EXPENSE_CATS.find((c) => c.id === id);
  return known ? { glyph: known.glyph, color: known.color } : { glyph: 'wallet', color: 'gray' };
}
