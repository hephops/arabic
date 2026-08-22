// Xodim huquqlari.
//
// Ilgari ikki xil odam bor edi: EGA (hammasi mumkin) va SOTUVCHI
// (sotadi, qarz yozadi, boshqasi yo'q). Haqiqiy do'konda esa o'rtasi
// ko'p: bittasi faqat kassada turadi, ikkinchisi tovar ham qabul
// qiladi, uchinchisi do'konni butunlay yuritadi.
//
// Shuning uchun har bir xodimga alohida ruxsat beriladi. Ega o'zi
// belgilaydi: kim sotadi, kim tovar qo'shadi, kim o'chira oladi,
// kim kirim narxini ko'radi.
//
// Ba'zi narsalar hech qachon xodimga berilmaydi — balans (pul),
// xodimlar ro'yxati (o'ziga to'liq huquq yozib olmasin) va taklif
// kodi. Ular faqat egada qoladi.

export type PermKey =
  // Kassa
  | 'pos' | 'pos_debt' | 'pos_return'
  // Qarz daftari
  | 'debts' | 'debt_add' | 'debt_pay'
  // Mijozlar
  | 'customers' | 'customer_add' | 'customer_edit' | 'customer_del'
  // Ombor
  | 'stock' | 'product_add' | 'product_edit' | 'product_del'
  | 'price_edit' | 'cost_view' | 'intake' | 'inventory'
  // Ta'minotchi
  | 'suppliers' | 'orders'
  // Qolgani
  | 'reminders' | 'reports' | 'expenses' | 'settings' | 'ai' | 'ai_actions';

/** Ro'yxat tartibi ilovadagi ko'rinish tartibi bilan bir xil */
export const PERM_GROUPS: { group: string; keys: PermKey[] }[] = [
  // pos_discount YO'Q: kassada narxni server o'zi hisoblaydi, ya'ni
  // sotuvchi chegirma bera olmaydi. Chegirma tovarga qo'yiladi va u
  // 'price_edit' ruxsatiga bog'liq. Ishlamaydigan tugma ko'rsatilsa,
  // do'kon egasi o'zini himoyalangan deb o'ylab qolardi.
  { group: 'kassa', keys: ['pos', 'pos_debt', 'pos_return'] },
  { group: 'debts', keys: ['debts', 'debt_add', 'debt_pay'] },
  { group: 'customers', keys: ['customers', 'customer_add', 'customer_edit', 'customer_del'] },
  { group: 'stock', keys: ['stock', 'product_add', 'product_edit', 'product_del', 'price_edit', 'cost_view', 'intake', 'inventory'] },
  { group: 'suppliers', keys: ['suppliers', 'orders'] },
  { group: 'other', keys: ['reminders', 'reports', 'expenses', 'settings', 'ai', 'ai_actions'] },
];

export const ALL_PERMS: PermKey[] = PERM_GROUPS.flatMap((g) => g.keys);

/**
 * Tayyor to'plamlar — ega har bir katakchani bosib o'tirmasin.
 * "Sotuvchi" — eski xodim nima qila olgan bo'lsa, o'shaning o'zi.
 * Shuning uchun yangilanishdan keyin hech kimning ishi buzilmaydi.
 */
export const PRESETS: Record<string, PermKey[]> = {
  // DIQQAT: bu to'plam yangilanishdan oldingi xodim huquqlarining
  // aynan o'zi. Eski xodimlarda permissions ustuni bo'sh qoladi va
  // shu to'plam sifatida o'qiladi — hech kimning ishi buzilmaydi.
  seller: [
    'pos', 'pos_debt', 'pos_return',
    'debts', 'debt_add', 'debt_pay',
    'customers', 'customer_add', 'customer_edit',
    'stock', 'inventory',
    'suppliers', 'orders',
    'reminders',
  ],
  cashier: ['pos', 'pos_debt', 'debts', 'debt_add', 'debt_pay', 'customers', 'customer_add', 'stock'],
  senior: [
    'pos', 'pos_debt', 'pos_return',
    'debts', 'debt_add', 'debt_pay',
    'customers', 'customer_add', 'customer_edit',
    'stock', 'product_add', 'product_edit', 'intake', 'inventory',
    'suppliers', 'orders', 'reminders',
  ],
  manager: ALL_PERMS,
};

/** Xodim yozuvidagi matnni ro'yxatga aylantirish */
export function parsePerms(raw: unknown): PermKey[] {
  if (typeof raw !== 'string' || !raw.trim()) return PRESETS.seller;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return PRESETS.seller;
    return list.filter((k): k is PermKey => (ALL_PERMS as string[]).includes(k));
  } catch {
    return PRESETS.seller;
  }
}

/** Saqlashdan oldin tozalash — noma'lum kalit bazaga tushmasin */
export function cleanPerms(list: unknown): PermKey[] {
  if (!Array.isArray(list)) return [];
  const set = new Set(list.filter((k): k is PermKey => (ALL_PERMS as string[]).includes(k)));
  // Bog'liqliklar: qo'shimcha huquq asosiysiz ma'nosiz
  if (set.has('debt_add') || set.has('debt_pay')) set.add('debts');
  if (set.has('customer_add') || set.has('customer_edit') || set.has('customer_del')) set.add('customers');
  if (set.has('product_add') || set.has('product_edit') || set.has('product_del') ||
      set.has('price_edit') || set.has('intake') || set.has('inventory')) set.add('stock');
  if (set.has('pos_debt') || set.has('pos_return')) set.add('pos');
  if (set.has('pos_debt')) { set.add('debts'); set.add('debt_add'); }
  if (set.has('orders')) set.add('suppliers');
  // AI orqali o'zgartirish — AI ning o'zisiz ma'nosiz
  if (set.has('ai_actions')) { set.add('ai'); set.add('price_edit'); }
  return [...set];
}
