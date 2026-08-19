// Backend manzili.
//
// Bo'sh bo'lsa so'rovlar SHU SAYTNING o'ziga ketadi (`/auth/...`) va
// Vite proksi ularni backendga uzatadi. Shu sababli ilova qaysi
// domenda ochilsa ham ishlaydi.
//
// Ilgari bu yerda `http://localhost:3000` turardi. U faqat backend
// turgan kompyuterda ishlardi: boshqa telefondan yoki boshqa domendan
// kirgan do'konchi "Failed to fetch" ni ko'rardi, chunki uning
// brauzeri o'z mashinasidagi 3000-portni qidirardi.
//
// VITE_API_URL faqat backend chindan ham boshqa domenda tursa qo'yiladi
// (u holda serverda CORS ham ochilishi kerak).
export const BASE = import.meta.env.VITE_API_URL ?? '';

export const getToken = () => localStorage.getItem('admin_token');
export const setToken = (t: string) => localStorage.setItem('admin_token', t);
export const logout = () => localStorage.removeItem('admin_token');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      // Content-Type faqat tana bo'lganda — bo'sh tanali so'rov rad etilmasin
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    logout();
    location.reload();
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; admin: Admin }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  me: () => request<Admin>('/admin/me'),
  stats: () => request<Stats>('/admin/stats'),
  shops: (params: { q?: string; status?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
    ).toString();
    return request<{ rows: Shop[]; total: number }>(`/admin/shops${qs ? `?${qs}` : ''}`);
  },
  shop: (id: number) => request<ShopDetail>(`/admin/shops/${id}`),
  blockShop: (id: number, is_blocked: boolean, reason?: string) =>
    request<Shop>(`/admin/shops/${id}/block`, { method: 'PATCH', body: JSON.stringify({ is_blocked, reason }) }),
  /** Bepul kun sovg'a qilish — balansga tegilmaydi */
  grantDays: (id: number, days: number, note?: string) =>
    request<ShopDetail>(`/admin/shops/${id}/grant`, { method: 'POST', body: JSON.stringify({ days, note }) }),
  adjustBalance: (id: number, amount: number, note?: string) =>
    request<ShopDetail>(`/admin/shops/${id}/balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    }),
  payments: (params: PaymentQuery = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
    ).toString();
    return request<PaymentsPage>(`/admin/payments${qs ? `?${qs}` : ''}`);
  },
  addPayment: (data: NewPayment) =>
    request<Payment>('/admin/payments', { method: 'POST', body: JSON.stringify(data) }),
  deletePayment: (id: number) => request<{ ok: boolean }>(`/admin/payments/${id}`, { method: 'DELETE' }),
  shopsSummary: () => request<ShopsSummary>('/admin/shops/summary'),
  reminders: (channel = 'all') =>
    request<{ rows: ReminderLog[]; stats: { channel: string; c: number }[] }>(`/admin/reminders?channel=${channel}`),
  settings: () => request<Record<string, string>>('/admin/settings'),
  saveSettings: (data: Record<string, string>) =>
    request<Record<string, string>>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  referrals: () => request<{ code: string; invited: number; inviter: string | null }[]>('/admin/referrals'),
  admins: () => request<Admin[]>('/admin/admins'),
  createAdmin: (data: { username: string; password: string; name?: string; role?: string }) =>
    request<Admin>('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
  updateAdmin: (id: number, data: { is_active?: boolean; password?: string }) =>
    request<Admin>(`/admin/admins/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  logs: () => request<AdminLog[]>('/admin/logs'),

  // ── Markaziy katalog ──
  catStats: () => request<CatalogStats>('/admin/catalog/stats'),
  catCategories: () => request<CatalogCategory[]>('/admin/catalog/categories'),
  catCreateCategory: (data: { parent_id?: number | null; name_uz: string; name_ru?: string; glyph?: string; color?: string }) =>
    request<CatalogCategory>('/admin/catalog/categories', { method: 'POST', body: JSON.stringify(data) }),
  catUpdateCategory: (id: number, data: Record<string, unknown>) =>
    request<CatalogCategory>(`/admin/catalog/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  catDeleteCategory: (id: number) =>
    request<{ ok: boolean }>(`/admin/catalog/categories/${id}`, { method: 'DELETE' }),
  catProducts: (params: { q?: string; category?: number; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
    ).toString();
    return request<{ items: CatalogProduct[]; total: number }>(`/admin/catalog/products${qs ? `?${qs}` : ''}`);
  },
  catCreateProduct: (data: Record<string, unknown>) =>
    request<CatalogProduct>('/admin/catalog/products', { method: 'POST', body: JSON.stringify(data) }),
  catUpdateProduct: (id: number, data: Record<string, unknown>) =>
    request<CatalogProduct>(`/admin/catalog/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  catDeleteProduct: (id: number) =>
    request<{ ok: boolean }>(`/admin/catalog/products/${id}`, { method: 'DELETE' }),
};

export interface Admin {
  id: number;
  username: string;
  name: string | null;
  role: 'admin' | 'super';
  is_active?: number;
  last_login_at?: string | null;
}

export interface Stats {
  shops: number;
  /** xizmati bugungi kunga to'langan do'konlar */
  active_shops: number;
  blocked: number;
  today_new: number;
  total_topups: number;
  month_topups: number;
  /** kunlik narx x faol do'kon — bugungi kutilayotgan tushum */
  daily_income: number;
  daily_price: number;
  /** oxirgi 30 kunda balanslardan yechilgan haqiqiy tushum */
  month_earned: number;
  /** do'konlar balansida turgan, hali ishlatilmagan pul */
  held_balance: number;
  /** yaqin kunlarda to'xtaydiganlar */
  low_balance: number;
  /** balansi tugab to'xtaganlar */
  stopped: number;
  debts: number;
  reminders: number;
  calls: number;
  signups: { day: string; count: number }[];
}

export interface Shop {
  id: number;
  name: string;
  phone: string;
  owner_name: string | null;
  balance: number;
  /** xizmat qaysi kungacha to'langan */
  charged_through: string | null;
  trial_ends_at?: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  created_at: string;
  customers_count?: number;
  debts_count?: number;
  last_activity?: string | null;
  telegram_user_id?: number | null;
  card_number?: string | null;
  address?: string | null;
  language?: string;
}

export interface ShopDetail extends Shop {
  stats: {
    customers: number;
    debts: number;
    open_debt: number;
    sales: number;
    products: number;
    employees: number;
    reminders: number;
  };
  transactions: Payment[];
  service: ServiceState;
}

/** Do'konning xizmat holati — kunlik to'lov bo'yicha */
export interface ServiceState {
  balance: number;
  charged_through: string;
  active: boolean;
  daily_price: number;
  days_left: number;
  runs_out_on: string;
  on_trial: boolean;
  low: boolean;
}

export interface Payment {
  id: number;
  shop_id: number;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
  method?: string | null;
  doc_no?: string | null;
  payer?: string | null;
  paid_at?: string | null;
  admin_username?: string | null;
  shop_name?: string;
  shop_phone?: string;
}

export interface PaymentQuery {
  type?: string;
  shop_id?: number;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface PaymentsPage {
  rows: Payment[];
  total: number;
  summary: {
    /** do'konlar tashlagan pul */
    kirim: number;
    /** kunlik to'lov sifatida yechilgani — bizning tushum */
    kunlik: number;
    /** qo'lda yechib olingani (kunlik to'lov bunga kirmaydi) */
    chiqim: number;
    qaytarilgan: number;
    /** hali balanslarda turgan pul */
    qoldiq: number;
    qarz: number;
    count: number;
  };
}

export interface NewPayment {
  shop_id: number;
  direction: 'in' | 'out';
  amount: number;
  paid_at?: string;
  method?: string;
  doc_no?: string;
  payer?: string;
  note?: string;
}

export interface ShopsSummary {
  jami: number;
  /** xizmati bugungi kunga to'langan */
  ishlayapti: number;
  /** balansi tugab to'xtagan */
  toxtagan: number;
  bloklangan: number;
  /** do'konlar balansidagi umumiy summa */
  balans: number;
}

export interface ReminderLog {
  id: number;
  channel: string;
  kind: string | null;
  status: string;
  payload: string | null;
  created_at: string;
  shop_name: string;
  customer_name: string | null;
  customer_phone: string | null;
}

export interface AdminLog {
  id: number;
  admin_id: number;
  username: string | null;
  action: string;
  target: string | null;
  target_name?: string | null;
  details: string | null;
  created_at: string;
}

// Raqamlar do'kon ilovasidagidek probel bilan ajratiladi: 99 000 so'm.
// Ajratgich — uzilmaydigan probel: aks holda uzun summa kartochkada
// "105 164" va "000" bo'lib ikki qatorga bo'linib ketardi.
export const fmtNum = (n: number) =>
  String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
export const fmt = (n: number) => `${fmtNum(n)} so'm`;

// Telefon do'kon ilovasidagidek ko'rinadi: +998 90 123 45 67
export function fmtPhone(v: string | null | undefined): string {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^998/, '');
  if (d.length !== 9) return v ?? '';
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}

/* ───────── Markaziy katalog ───────── */

export interface CatalogStats {
  products: number;
  categories: number;
  with_image: number;
  with_barcode: number;
  used_by_shops: number;
}

export interface CatalogCategory {
  id: number;
  parent_id: number | null;
  name_uz: string;
  name_ru: string;
  glyph: string | null;
  color: string | null;
  sort_order: number;
  product_count: number;
  children?: CatalogCategory[];
}

export interface CatalogProduct {
  id: number;
  category_id: number;
  name_uz: string;
  name_ru: string | null;
  brand: string | null;
  volume_value: number | null;
  volume_unit: string | null;
  unit: string;
  barcode: string | null;
  image_url: string | null;
  status: string;
  category_uz?: string;
}
