export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function logout() {
  localStorage.removeItem('token');
  // Ochiq savatlar keyingi kirgan odamga qolib ketmasin
  localStorage.removeItem('arabic.carts.v1');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      // Content-Type faqat tana bo'lganda qo'yiladi — aks holda server
      // "bo'sh tana" deb rad etadi (masalan: chek yuborish, eslatmani tekshirish)
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    const err: any = new Error(body.error ?? `HTTP ${res.status}`);
    err.details = body;          // masalan: qoldig'i yetmagan tovarlar ro'yxati
    throw err;
  }
  return res.json();
}

export const api = {
  // Yordam kontaktlari (kirish shart emas)
  support: () => request<{ phone: string; telegram: string }>('/public/support'),
  // Xodim (sotuvchi) kirishi: do'kon telefoni + 4 xonali PIN
  // Shtrix-kod bo'yicha to'liq javob: tovar bormi, katalogda bormi, kod to'g'rimi
  lookupBarcode: (code: string) =>
    request<BarcodeLookup>(`/barcodes/lookup?code=${encodeURIComponent(code)}`),
  attachBarcode: (productId: number, barcode: string) =>
    request<Product>(`/products/${productId}/barcodes`, { method: 'POST', body: JSON.stringify({ barcode }) }),
  productBarcodes: (productId: number) =>
    request<{ id: number; barcode: string; created_at: string }[]>(`/products/${productId}/barcodes`),
  removeBarcode: (productId: number, barcode: string) =>
    request<{ ok: boolean }>(`/products/${productId}/barcodes/${encodeURIComponent(barcode)}`, { method: 'DELETE' }),
  employeeLogin: (phone: string, pin: string) =>
    request<{ token: string; shop: Shop; employee: Employee }>('/auth/employee', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    }),
  requestOtp: (phone: string) =>
    request<{ ok: boolean; dev_hint?: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verify: (phone: string, code: string, shop_name?: string, init_data?: string) =>
    request<{ token: string; shop: Shop }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code, shop_name, init_data }),
    }),
  telegramAuth: (init_data: string) =>
    request<{ token: string; shop: Shop }>('/auth/telegram', {
      method: 'POST',
      body: JSON.stringify({ init_data }),
    }),
  me: () => request<Shop>('/me'),
  dashboard: () => request<Dashboard>('/dashboard'),
  customers: () => request<Customer[]>('/customers'),
  customer: (id: number) => request<CustomerDetail>(`/customers/${id}`),
  createCustomer: (data: { name: string; phone?: string }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  createDebt: (data: { customer_id?: number; customer_name?: string; customer_phone?: string; amount: number; note?: string; due_date?: string; source?: string }) =>
    request<Debt & { customer?: { id: number; name: string } }>('/debts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  payDebt: (id: number, amount: number) =>
    request<Debt>(`/debts/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount }) }),
  parseVoice: (text: string) =>
    request<{ customer_name: string; amount: number; due_date: string | null; note: string | null }>('/voice/parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  products: (params?: { q?: string; barcode?: string; category?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Product[]>(`/products${qs ? `?${qs}` : ''}`);
  },
  intake: (data: { barcode?: string; name: string; unit?: string; cost_price?: number; sell_price?: number; qty?: number; expiry_date?: string; image?: string; category?: string }) =>
    request<Product>('/products/intake', { method: 'POST', body: JSON.stringify(data) }),
  createSale: (data: { items: { product_id: number; qty: number }[]; payment_type: 'cash' | 'card' | 'debt'; customer_id?: number; customer_name?: string; customer_phone?: string; due_date?: string; allow_negative?: boolean }) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  reports: (period: 'day' | 'week' | 'month') => request<Report>(`/reports/summary?period=${period}`),
  suppliers: () => request<Supplier[]>('/suppliers'),
  supplier: (id: number) => request<SupplierDetail>(`/suppliers/${id}`),
  createSupplierDebt: (data: { supplier_id?: number; supplier_name?: string; amount: number; note?: string; due_date?: string }) =>
    request<SupplierDebt>('/supplier-debts', { method: 'POST', body: JSON.stringify(data) }),
  paySupplierDebt: (id: number, amount: number) =>
    request<SupplierDebt>(`/supplier-debts/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount }) }),
  employees: () => request<Employee[]>('/employees'),
  createEmployee: (data: { name: string; pin: string }) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: { is_active: number }) =>
    request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  referral: () => request<{ code: string; invited_count: number; reward_text: string }>('/referral'),
  updateCustomer: (
    id: number,
    data: Partial<Pick<Customer, 'name' | 'phone' | 'language' | 'reminder_mode' | 'credit_limit' | 'is_blocked'>>
  ) =>
    request<Customer>(`/customers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCustomer: (id: number) => request<{ ok: boolean }>(`/customers/${id}`, { method: 'DELETE' }),
  updateProduct: (id: number, data: Partial<Product> & { image?: string }) =>
    request<Product>(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => request<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
  stocktake: (items: { product_id: number; actual: number }[]) =>
    request<{ items: StocktakeRow[]; changed: number }>('/inventory/count', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  sales: (limit = 50) => request<SaleRow[]>(`/sales?limit=${limit}`),
  sale: (id: number) => request<SaleDetail>(`/sales/${id}`),
  sendReceipt: (id: number) => request<{ ok: boolean; text: string }>(`/sales/${id}/receipt`, { method: 'POST' }),
  exportUrl: (period: string) => `${BASE}/reports/export?period=${period}`,
  reminders: () => request<RemindersInfo>('/reminders'),
  runReminders: () => request<{ created: number }>('/reminders/run', { method: 'POST' }),
  setReminderDefault: (mode: ReminderMode, applyToAll?: boolean) =>
    request<{ default_reminder_mode: ReminderMode }>('/reminders/settings', {
      method: 'PATCH',
      body: JSON.stringify({ default_reminder_mode: mode, apply_to_all: applyToAll }),
    }),
  updateMe: (data: Partial<Pick<Shop, 'name' | 'owner_name' | 'address' | 'language' | 'card_number'>>) =>
    request<Shop>('/me', { method: 'PATCH', body: JSON.stringify(data) }),
  balance: () => request<BalanceInfo>('/balance'),
  topup: (amount: number) =>
    request<{ balance: number }>('/balance/topup', { method: 'POST', body: JSON.stringify({ amount }) }),
  subscribe: (plan: string, period: 'month' | 'year' = 'month') =>
    request<{ balance: number; plan: string; plan_expires_at: string }>('/balance/subscribe', {
      method: 'POST',
      body: JSON.stringify({ plan, period }),
    }),
  categories: () => request<{ name: string; count: number }[]>('/categories'),
};

export interface Shop {
  id: number;
  /** sinov muddatidami va necha kun qolgani */
  on_trial?: boolean;
  days_left?: number;
  trial_ends_at?: string | null;
  plan_active?: string;
  /** to'ldirilgan bo'lsa — sessiya xodimniki, ilova cheklangan rejimda ishlaydi */
  employee?: Employee | null;
  phone: string;
  name: string;
  owner_name: string | null;
  address: string | null;
  language: string;
  card_number: string | null;
  plan: string;
  plan_expires_at: string | null;
  balance: number;
}

export interface BalanceInfo {
  balance: number;
  min_topup: number;
  plan: string;
  plan_expires_at: string | null;
  transactions: { id: number; type: string; amount: number; note: string | null; created_at: string }[];
  plans: Record<string, { price: number; title: string; yearly: number }>;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
}

export interface SupplierDebt {
  id: number;
  supplier_id: number;
  amount: number;
  paid_amount: number;
  note: string | null;
  due_date: string | null;
  status: 'active' | 'overdue' | 'paid';
  created_at: string;
}

export interface SupplierDetail extends Supplier {
  debts: SupplierDebt[];
}

export interface BarcodeLookup {
  code: string;
  /** true — nazorat raqami to'g'ri, false — xato, null — tekshirib bo'lmaydi */
  valid: boolean | null;
  product: Product | null;
  catalog: { barcode: string; name: string; unit: string } | null;
}

export interface Employee {
  id: number;
  name: string;
  role: string;
  is_active: number;
  /** faqat do'kon egasi ro'yxatida keladi — sotuvchiga aytish uchun */
  pin?: string;
}

export type ReminderMode = 'off' | 'soft' | 'medium' | 'call';

export interface Customer {
  credit_limit?: number;
  is_blocked?: number;
  id: number;
  name: string;
  phone: string | null;
  language: string;
  reminder_mode: ReminderMode;
  balance: number;
  last_activity: string | null;
}

export interface ReminderLog {
  id: number;
  channel: 'sms' | 'telegram' | 'call';
  kind: string | null;
  status: string;
  payload: string | null;
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  amount: number | null;
  due_date: string | null;
}

export interface RemindersInfo {
  cost?: {
    sms_count: number;
    call_count: number;
    sms_price: number;
    call_price: number;
    total: number;
  };
  logs: ReminderLog[];
  default_mode: ReminderMode;
  stats: { total: number; sent: number; failed: number; calls: number };
}

export interface Debt {
  id: number;
  customer_id: number;
  amount: number;
  paid_amount: number;
  note: string | null;
  due_date: string | null;
  status: 'active' | 'overdue' | 'paid';
  created_at: string;
}

export interface CustomerDetail extends Customer {
  debts: Debt[];
}

export interface Product {
  category?: string | null;
  id: number | null;
  barcode: string | null;
  name: string;
  unit: string;
  cost_price: number;
  sell_price: number;
  stock: number;
  expiry_date: string | null;
  image_url: string | null;
  from_catalog?: boolean;
}

export interface StocktakeRow {
  product_id: number;
  name: string;
  before: number;
  actual: number;
  diff: number;
}

export interface SaleRow {
  id: number;
  total: number;
  payment_type: 'cash' | 'card' | 'debt';
  created_at: string;
  customer_name: string | null;
  customer_phone: string | null;
  items: string | null;
}

export interface SaleDetail {
  id: number;
  total: number;
  payment_type: string;
  created_at: string;
  items: { id: number; name: string; unit: string; qty: number; price: number }[];
  customer: { name: string; phone: string | null } | null;
}

export interface Sale {
  id: number;
  total: number;
  payment_type: string;
}

export interface RecentSale {
  id: number;
  total: number;
  payment_type: 'cash' | 'card' | 'debt';
  created_at: string;
  customer_name: string | null;
  items: string | null;
}

export interface SupplierDue {
  id: number;
  amount: number;
  paid_amount: number;
  due_date: string | null;
  status: string;
  note: string | null;
  supplier_name: string;
}

export interface Dashboard {
  owed_to_me: number;
  i_owe: number;
  net: number;
  today: { count: number; revenue: number; cash: number; card: number; debt: number; profit: number };
  week: { day: string; revenue: number }[];
  due_today: (Debt & { customer_name: string })[];
  overdue: (Debt & { customer_name: string })[];
  low_stock: Product[];
  expiring_soon: Product[];
  recent_sales: RecentSale[];
  supplier_due: SupplierDue[];
}

export interface Report {
  count: number;
  revenue: number;
  cash: number;
  card: number;
  debt: number;
  profit: number;
  top_products: { name: string; sold: number; revenue: number }[];
}

export { fmt, fmtShort } from './i18n';
