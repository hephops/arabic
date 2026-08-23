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
  /** Do'kon ma'lumotini tahrirlash */
  shopEdit: (id: number, data: { name?: string; owner_name?: string; phone?: string }) =>
    request<Shop>(`/admin/shops/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Xizmat sozlamalari: kunlik narx, balans va to'langan sana */
  shopService: (
    id: number,
    data: {
      daily_price?: number | null;
      balance?: number;
      charged_through?: string | null;
      agent_id?: number | null;
      agent_bonus?: number;
    }
  ) => request<Shop>(`/admin/shops/${id}/service`, { method: 'PATCH', body: JSON.stringify(data) }),
  /** Do'konni butunlay o'chirish. confirm — do'kon nomi aynan takrorlanishi shart */
  shopDelete: (id: number, confirm: string) =>
    request<{ ok: true }>(`/admin/shops/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm }) }),
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
  aiStatus: () => request<AdminAiStatus>('/admin/ai/status'),
  // Tanasiz POST'ni Fastify bo'sh JSON deb rad etadi — bo'sh obyekt yuboramiz
  aiTest: () =>
    request<{ ok: boolean; model?: string; answer?: string; error?: string }>('/admin/ai/test', {
      method: 'POST',
      body: '{}',
    }),
  /** Do'kon kabinetiga kirish uchun qisqa muddatli token (2 soat).
   *  Parol so'ralmaydi; do'kon "Loglar"ida ko'rinmaydi, faqat
   *  kompaniya audit jurnaliga yoziladi. */
  shopLogin: (id: number) =>
    request<{ token: string; shop: { id: number; name: string }; expires_in: number }>(
      `/admin/shops/${id}/login`,
      { method: 'POST', body: '{}' }
    ),
  /** Do'kon jurnali — barcha harakatlar bir ro'yxatda */
  shopActivity: (id: number, limit = 300, kind = '') =>
    request<{ items: ShopActivity[]; counts: Record<string, number>; total: number }>(
      `/admin/shops/${id}/activity?limit=${limit}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`
    ),
  settings: () => request<Record<string, string>>('/admin/settings'),
  /** Qaysi turlar bor va qaysi sozlamani tur uchun alohida qo'yish mumkin */
  settingsMeta: () =>
    request<{ types: string[]; type_keys: string[]; defaults: Record<string, string> }>('/admin/settings/meta'),
  saveSettings: (data: Record<string, string>) =>
    request<Record<string, string>>('/admin/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  referrals: () => request<{ code: string; invited: number; inviter: string | null }[]>('/admin/referrals'),
  admins: () => request<Admin[]>('/admin/admins'),
  createAdmin: (data: { username: string; password: string; name?: string; role?: string }) =>
    request<Admin>('/admin/admins', { method: 'POST', body: JSON.stringify(data) }),
  updateAdmin: (id: number, data: { is_active?: boolean; password?: string }) =>
    request<Admin>(`/admin/admins/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  logs: () => request<AdminLog[]>('/admin/logs'),

  /* ── Targ'ovchi xodimlar ── */
  agents: () => request<{ bonus: number; rows: Agent[] }>('/admin/agents'),
  agent: (id: number) => request<AgentDetail>(`/admin/agents/${id}`),
  /** Panelga kirgan xodimning o'z sahifasi */
  myAgent: () => request<AgentDetail & { bonus: number }>('/admin/my'),
  createAgent: (data: { username: string; password: string; name: string; phone: string }) =>
    request<Agent>('/admin/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: number, data: { name?: string; phone?: string; password?: string; is_active?: boolean }) =>
    request<Agent>(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAgent: (id: number) => request<{ ok: true }>(`/admin/agents/${id}`, { method: 'DELETE' }),
  addPayout: (id: number, data: { amount: number; note?: string; paid_at?: string }) =>
    request<AgentPayout>(`/admin/agents/${id}/payouts`, { method: 'POST', body: JSON.stringify(data) }),
  deletePayout: (id: number) => request<{ ok: true }>(`/admin/payouts/${id}`, { method: 'DELETE' }),

  /* ── To'lov cheklari ── */
  receipts: (status = 'new') => request<ReceiptsPage>(`/admin/receipts?status=${status}`),
  rejectReceipt: (id: number, reason?: string) =>
    request<{ ok: true }>(`/admin/receipts/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
  /** AI hisoboti. days = 0 bo'lsa butun vaqt bo'yicha */
  aiReport: (days: number) => request<AiReport>(`/admin/ai/report?days=${days}`),

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
  // Rasmni serverning o'zi olib keladi — admin brauzeri emas
  catImageFromUrl: (id: number, url: string) =>
    request<CatalogProduct>(`/admin/catalog/products/${id}/image-url`, { method: 'POST', body: JSON.stringify({ url }) }),
  catFindImage: (id: number, apply_name = false) =>
    request<{ found: OffFound; changed: string[]; product: CatalogProduct }>(
      `/admin/catalog/products/${id}/find-image`,
      { method: 'POST', body: JSON.stringify({ apply_name }) }
    ),
  catBulkImages: (limit = 15) =>
    request<{ checked: number; done: number; missing: number; left: number }>('/admin/catalog/fetch-images', {
      method: 'POST',
      body: JSON.stringify({ limit }),
    }),
};

export interface Admin {
  id: number;
  username: string;
  name: string | null;
  role: 'admin' | 'super' | 'agent';
  phone?: string | null;
  is_active?: number;
  last_login_at?: string | null;
}

/** AI holati — kalitning O'ZI hech qachon kelmaydi, faqat dumi */
export interface AdminAiStatus {
  enabled: boolean;
  key_tail: string | null;
  /** kalit .env dan kelayaptimi (admin paneldan emas) */
  from_env: boolean;
  model: string;
  daily_limit: number;
  /** do'konchidan bitta savol uchun olinadigan pul (0 — bepul) */
  question_price: number;
  keep_days: number;
  /** bizning tannarximiz — Anthropic'ga to'lanadigan */
  cost_month: number;
  calls_month: number;
  shops_month: number;
  /** do'konchilardan tushgan pul */
  earned_month: number;
  paid_questions_month: number;
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
  /** Anthropic chegarasining oxirgi ma'lum holati (javob sarlavhalaridan) */
  ai_rate: {
    req_limit: number | null; req_left: number | null;
    in_limit: number | null; in_left: number | null;
    out_limit: number | null; out_left: number | null;
    reset: string | null; at: string;
  } | null;
  ai_cost_month: number;
  ai_cost_today: number;
  ai_shops: number;
  ai_calls: number;
  /** keshdan o'qilgan token ulushi, %. Pasaysa xarajat oshadi. */
  ai_cache_hit: number;
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
  /** do'konning O'Z kunlik narxi (null = umumiy sozlamadagi narx) */
  daily_price?: number | null;
  trial_ends_at?: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  created_at: string;
  customers_count?: number;
  debts_count?: number;
  last_activity?: string | null;
  /* Pul aylanmasi — balansning o'zi kam narsa aytadi, chunki sinov
     muddatidagi do'konda u doim 0 turadi */
  /** jami qancha to'ldirgan */
  paid_total?: number;
  /** jami qancha yechilgan (kunlik haq, AI, SMS...) */
  spent_total?: number;
  /** AI ga ketgan tannarx — kim ko'p ishlatayotgani ko'rinsin */
  ai_cost?: number;
  telegram_user_id?: number | null;
  card_number?: string | null;
  address?: string | null;
  language?: string;
  /** do'kon turi: oziq | oltin | parfumeriya ... */
  shop_type?: string;
  /** do'konni ulagan targ'ovchi xodim */
  agent_id?: number | null;
  agent_name?: string | null;
  agent_bonus?: number | null;
  agent_linked_at?: string | null;
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
    /** AI savollari uchun yechilgani — bu ham bizning tushum */
    ai: number;
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
  /** qaysi chek asosida — tasdiqlansa chek ham yopiladi */
  receipt_id?: number;
}

/** Targ'ovchi xodim — do'konlarni dasturga ulaydi va har biri uchun mukofot oladi */
export interface Agent {
  id: number;
  username: string;
  name: string | null;
  phone: string | null;
  is_active: number;
  last_login_at?: string | null;
  created_at?: string;
  /* ro'yxatda hisob ham qo'shib beriladi */
  shops?: number;
  earned?: number;
  paid?: number;
  left?: number;
}

export interface AgentStats {
  /** nechta do'kon ulagan */
  shops: number;
  /** ulagani uchun jami qancha mukofot yozilgan */
  earned: number;
  /** shundan qanchasi berilgan */
  paid: number;
  /** qolgan qarzimiz */
  left: number;
}

export interface AgentPayout {
  id: number;
  agent_id?: number;
  amount: number;
  note: string | null;
  paid_at: string | null;
  created_at: string;
  by_username?: string | null;
}

export interface AgentDetail {
  agent?: Agent;
  me?: Agent;
  stats: AgentStats;
  shops: (Shop & { agent_bonus?: number | null; agent_linked_at?: string | null })[];
  payouts: AgentPayout[];
}

/** Do'konchi yuborgan to'lov cheki */
export interface Receipt {
  id: number;
  shop_id: number;
  amount: number;
  image_url: string | null;
  agent_phone: string | null;
  note: string | null;
  review_note: string | null;
  status: 'new' | 'approved' | 'rejected';
  payment_id: number | null;
  reviewed_username: string | null;
  reviewed_at: string | null;
  created_at: string;
  shop_name: string;
  shop_phone: string;
  owner_name: string | null;
  shop_balance: number;
  shop_agent_id: number | null;
  shop_agent_name: string | null;
  /** chekdagi raqam qaysi xodimniki (tasdiqlashdan oldin ko'rinsin) */
  agent_match: { id: number; name: string; username: string } | null;
}

export interface ReceiptsPage {
  rows: Receipt[];
  counts: { yangi: number; tasdiqlangan: number; rad: number; yangi_summa: number };
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
  /** balansi minusga tushgan do'konlar soni */
  qarzdor: number;
  /** ularning umumiy qarzi */
  qarz_summa: number;
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

/* ─────────── Vaqt ───────────
 *
 * Bazada vaqt UTC'da saqlanadi (SQLite datetime('now')), do'kon esa
 * O'zbekistonda ishlaydi — farq besh soat.
 *
 * Ilgari admin panel bazadagi satrni shundayligicha kesib ko'rsatardi:
 * soat 10:43 da qilingan kirim jurnalda "05:37" bo'lib turardi va
 * do'kon egasi "bu qachon bo'lgan?" deb hayron qolardi.
 *
 * DIQQAT: faqat VAQTLI maydonlarga (created_at, last_login_at,
 * reviewed_at, sent_at...) qo'llanadi. spent_at, due_date,
 * charged_through kabi SANA maydonlari serverda allaqachon o'zbek
 * kuni bo'yicha hisoblangan — ularga tegilmaydi, aks holda bir kun
 * oldinga surilib ketardi.
 */
const UZ_SOAT = 5;

function uzVaqt(v?: string | null): Date | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  // "2026-08-23 05:37:12" — SQLite ko'rinishi, mintaqasiz, ya'ni UTC
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s.replace(' ', 'T')}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms + UZ_SOAT * 3600_000);
}

const ikki = (n: number) => String(n).padStart(2, '0');

/** "2026-08-23 10:37" — O'zbekiston vaqti bilan */
export function fmtWhen(v?: string | null): string {
  const d = uzVaqt(v);
  if (!d) return '—';
  return (
    `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}-${ikki(d.getUTCDate())} ` +
    `${ikki(d.getUTCHours())}:${ikki(d.getUTCMinutes())}`
  );
}

/** "2026-08-23" — O'zbekiston kuni bilan */
export function fmtWhenDay(v?: string | null): string {
  const d = uzVaqt(v);
  if (!d) return '—';
  return `${d.getUTCFullYear()}-${ikki(d.getUTCMonth() + 1)}-${ikki(d.getUTCDate())}`;
}

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
  /** kodi bor, lekin rasmi yo'q — ommaviy izlash shularni oladi */
  image_pending: number;
}

/** Ochiq bazadan topilgan ma'lumot */
export interface OffFound {
  name: string | null;
  brand: string | null;
  quantity: string | null;
  image: string | null;
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
  image_source?: string | null;
  status: string;
  category_uz?: string;
}

/** AI hisoboti — tannarx, tushum va savollar soni bir joyda */
export interface AiReport {
  /** bitta savolning hozirgi narxi (0 = bepul) */
  narx: number;
  jami: {
    tannarx: number;
    tushum: number;
    chaqiruvlar: number;
    savollar: number;
    dokonlar: number;
    kirish_token: number;
    chiqish_token: number;
    keshdan_token: number;
    /** bitta savolning o'rtacha tannarxi — narx qo'yishda asosiy raqam */
    ortacha: number;
  };
  davr: {
    kunlar: number;
    tannarx: number;
    tushum: number;
    chaqiruvlar: number;
    savollar: number;
    dokonlar: number;
  };
  kunlar: { sana: string; tannarx: number; tushum: number; savollar: number; chaqiruvlar: number }[];
  modellar: { model: string; chaqiruvlar: number; tannarx: number }[];
  dokonlar: {
    shop_id: number; nom: string; telefon: string;
    savollar: number; chaqiruvlar: number; tannarx: number; tushum: number;
  }[];
}

/** Do'kon jurnalidagi bitta yozuv (backend: /admin/shops/:id/activity) */
export interface ShopActivity {
  at: string;
  /** savdo | qarz | ombor | balans ... — ro'yxatda filtr uchun */
  kind: string;
  title: string;
  detail?: string | null;
  /** pul bilan bog'liq bo'lsa: + kirim, − chiqim */
  amount?: number | null;
  /** kim qilgani: xodim ismi yoki "Ega" */
  who?: string | null;
}
