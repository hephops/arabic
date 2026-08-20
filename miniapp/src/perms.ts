// Xodim huquqlari — ilova tomoni.
//
// Server har so'rovda qaytadan tekshiradi, bu yerdagisi faqat
// ko'rinish uchun: bosib bo'lmaydigan tugmani ko'rsatib qo'ymaymiz.
// Ya'ni bu himoya emas, xushmuomalalik. Himoya serverda (auth.ts).

export type PermKey =
  | 'pos' | 'pos_debt' | 'pos_discount' | 'pos_return'
  | 'debts' | 'debt_add' | 'debt_pay'
  | 'customers' | 'customer_add' | 'customer_edit' | 'customer_del'
  | 'stock' | 'product_add' | 'product_edit' | 'product_del'
  | 'price_edit' | 'cost_view' | 'intake' | 'inventory'
  | 'suppliers' | 'orders'
  | 'reminders' | 'reports' | 'expenses' | 'settings' | 'ai';

/** null — do'kon egasi (hammasi mumkin), ro'yxat — xodim */
let PERMS: string[] | null = null;

export function setPerms(list: string[] | null | undefined) {
  PERMS = list ?? null;
}

export function isEmployeeSession(): boolean {
  return PERMS !== null;
}

export function can(key: PermKey): boolean {
  return PERMS === null || PERMS.includes(key);
}

/** Faqat egada bo'ladigan bo'limlar: pul, xodimlar, taklif kodi */
export function isOwner(): boolean {
  return PERMS === null;
}

/** Menyu bandi -> talab qilinadigan ruxsat. 'owner' — faqat ega. */
export const NAV_PERM: Record<string, PermKey | 'owner' | null> = {
  tabHome: null,
  tabCustomers: 'customers',
  tabAdd: 'debt_add',
  tabKassa: 'pos',
  tabProfile: null,
  navScanner: 'pos',
  navSuppliers: 'suppliers',
  navOrders: 'orders',
  navReturns: 'pos_return',
  navReminders: 'reminders',
  navReports: 'reports',
  navExpenses: 'expenses',
  navInventory: 'inventory',
  navCatalog: 'intake',
  navAi: 'ai',
  navBalance: 'owner',
  navEmployees: 'owner',
  navReferral: 'owner',
  navShop: 'settings',
  navLanguage: null,
  navSettings: null,
};

/** Shu menyu bandi ko'rinsinmi */
export function navAllowed(key: string): boolean {
  const need = NAV_PERM[key];
  if (need == null) return true;
  if (need === 'owner') return isOwner();
  return can(need);
}
