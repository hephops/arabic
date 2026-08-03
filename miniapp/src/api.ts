export const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function getToken(): string | null {
  return localStorage.getItem('token');
}

export function setToken(token: string) {
  localStorage.setItem('token', token);
}

export function logout() {
  localStorage.removeItem('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  requestOtp: (phone: string) =>
    request<{ ok: boolean; dev_hint?: string }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verify: (phone: string, code: string, shop_name?: string) =>
    request<{ token: string; shop: Shop }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code, shop_name }),
    }),
  me: () => request<Shop>('/me'),
  dashboard: () => request<Dashboard>('/dashboard'),
  customers: () => request<Customer[]>('/customers'),
  customer: (id: number) => request<CustomerDetail>(`/customers/${id}`),
  createCustomer: (data: { name: string; phone?: string }) =>
    request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
  createDebt: (data: { customer_id?: number; customer_name?: string; amount: number; note?: string; due_date?: string; source?: string }) =>
    request<Debt>('/debts', { method: 'POST', body: JSON.stringify(data) }),
  payDebt: (id: number, amount: number) =>
    request<Debt>(`/debts/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount }) }),
  parseVoice: (text: string) =>
    request<{ customer_name: string; amount: number; due_date: string | null; note: string | null }>('/voice/parse', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  products: (params?: { q?: string; barcode?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return request<Product[]>(`/products${qs ? `?${qs}` : ''}`);
  },
  intake: (data: { barcode?: string; name: string; unit?: string; cost_price?: number; sell_price?: number; qty?: number; expiry_date?: string; image?: string }) =>
    request<Product>('/products/intake', { method: 'POST', body: JSON.stringify(data) }),
  createSale: (data: { items: { product_id: number; qty: number }[]; payment_type: 'cash' | 'card' | 'debt'; customer_id?: number; customer_name?: string; due_date?: string }) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  reports: (period: 'day' | 'week' | 'month') => request<Report>(`/reports/summary?period=${period}`),
};

export interface Shop {
  id: number;
  phone: string;
  name: string;
  card_number: string | null;
  plan: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  last_activity: string | null;
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

export interface Sale {
  id: number;
  total: number;
  payment_type: string;
}

export interface Dashboard {
  owed_to_me: number;
  i_owe: number;
  net: number;
  due_today: (Debt & { customer_name: string })[];
  overdue: (Debt & { customer_name: string })[];
  low_stock: Product[];
  expiring_soon: Product[];
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

export function fmt(n: number): string {
  return new Intl.NumberFormat('uz-UZ').format(n) + " so'm";
}
