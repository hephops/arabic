export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

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
  shops: (params: { q?: string; plan?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '') as [string, string][]
    ).toString();
    return request<{ rows: Shop[]; total: number }>(`/admin/shops${qs ? `?${qs}` : ''}`);
  },
  shop: (id: number) => request<ShopDetail>(`/admin/shops/${id}`),
  blockShop: (id: number, is_blocked: boolean, reason?: string) =>
    request<Shop>(`/admin/shops/${id}/block`, { method: 'PATCH', body: JSON.stringify({ is_blocked, reason }) }),
  grantPlan: (id: number, plan: string, days: number) =>
    request<Shop>(`/admin/shops/${id}/grant`, { method: 'POST', body: JSON.stringify({ plan, days }) }),
  adjustBalance: (id: number, amount: number, note?: string) =>
    request<{ balance: number }>(`/admin/shops/${id}/balance`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    }),
  payments: (type = 'all') => request<Payment[]>(`/admin/payments?type=${type}`),
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
  active_subs: number;
  blocked: number;
  today_new: number;
  total_topups: number;
  month_topups: number;
  mrr: number;
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
  plan: string;
  plan_expires_at: string | null;
  balance: number;
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
}

export interface Payment {
  id: number;
  shop_id: number;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
  shop_name?: string;
  shop_phone?: string;
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
  details: string | null;
  created_at: string;
}

// Raqamlar do'kon ilovasidagidek probel bilan ajratiladi: 99 000 so'm
export const fmtNum = (n: number) =>
  String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const fmt = (n: number) => `${fmtNum(n)} so'm`;

// Telefon do'kon ilovasidagidek ko'rinadi: +998 90 123 45 67
export function fmtPhone(v: string | null | undefined): string {
  const d = String(v ?? '').replace(/\D/g, '').replace(/^998/, '');
  if (d.length !== 9) return v ?? '';
  return `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}
