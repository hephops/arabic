// Do'kon turlari — ilovadagi ro'yxat bilan bir xil
// (miniapp/src/shopTypes.ts va backend/src/shopTypes.ts).
//
// Ilgari bu ro'yxat Shops.tsx ichida turardi va Sozlamalarga kerak
// bo'lganda ikkinchi nusxasi paydo bo'lardi. Bitta joyda tursin:
// serverga yangi tur qo'shilsa, bu yerga bir marta yoziladi.

export const SHOP_TYPES = [
  { id: 'oziq', label: 'Oziq-ovqat', emoji: '🛒' },
  { id: 'parfumeriya', label: 'Parfumeriya', emoji: '🧴' },
  { id: 'xoztovar', label: "Xo'jalik", emoji: '🧹' },
  { id: 'telefon', label: 'Telefon', emoji: '📱' },
  { id: 'oltin', label: 'Zargarlik', emoji: '💍' },
  { id: 'kiyim', label: 'Kiyim', emoji: '👕' },
  { id: 'qurilish', label: 'Qurilish', emoji: '🧱' },
  { id: 'dorixona', label: 'Dorixona', emoji: '💊' },
  { id: 'boshqa', label: 'Boshqa', emoji: '🏪' },
] as const;

export type ShopTypeId = (typeof SHOP_TYPES)[number]['id'];

/** "💍 Zargarlik" — ro'yxatlarda va jadvallarda ko'rsatiladi */
export const SHOP_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  SHOP_TYPES.map((t) => [t.id, `${t.emoji} ${t.label}`])
);

/** Tur uchun qo'yilgan ustama sozlamaning kaliti.
 *  Serverdagi billing.ts:typeKey bilan BIR XIL bo'lishi shart. */
export const typeKey = (type: string, key: string) => `t_${type}_${key}`;
