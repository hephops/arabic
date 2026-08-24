import { translate } from './i18n';
import type { PermKey } from './perms';

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
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        // Content-Type faqat tana bo'lganda qo'yiladi — aks holda server
        // "bo'sh tana" deb rad etadi (masalan: chek yuborish, eslatmani tekshirish)
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    // Brauzer "Failed to fetch" deydi — do'konchi uchun bu hech narsa
    // anglatmaydi. Sababi doim bitta: server yoki internet yo'q.
    const err: any = new Error(translate('netError'));
    err.sub = translate('netErrorSub');
    err.offline = true;
    throw err;
  }
  if (!res.ok) {
    const body: any = await res.json().catch(() => ({}));
    // Tana bo'sh bo'lsa javob BIZDAN emas — oldidagi proksidan
    // (Cloudflare tuneli) kelgan. 502/504 esa doim bitta narsani
    // anglatadi: server javobni juda uzoq kutdirdi yoki o'chgan.
    // "HTTP 502" degan yozuv do'konchi uchun hech narsa anglatmaydi.
    const bare = !body?.error && !body?.message;
    const msg =
      body.message ??
      (bare && (res.status === 502 || res.status === 504)
        ? translate('gatewayError')
        : body.error ?? `HTTP ${res.status}`);
    const err: any = new Error(msg);
    err.status = res.status;
    err.details = body;          // masalan: qoldig'i yetmagan tovarlar ro'yxati
    // Do'kon bloklangan bo'lsa har so'rov 403 qaytaradi. Ekranda
    // "HTTP 403" degan yozuv do'konchiga hech narsa anglatmaydi va u
    // nima bo'lganini tushunmasdan qolardi — sababini aytib, hisobdan
    // chiqaramiz, keyingi kirishda esa server o'zi to'xtatadi.
    if (res.status === 403 && body?.error === 'blocked') {
      err.blocked = true;
      err.message = body?.reason
        ? `${translate('shopBlocked')}: ${body.reason}`
        : translate('shopBlocked');
      try {
        localStorage.removeItem('token');
      } catch {
        /* localStorage yopiq bo'lishi mumkin */
      }
    }
    // Balans tugab, admin sozlamasida yozuv to'xtatilgan bo'lsa server
    // 402 va {error:'balance_empty'} qaytaradi. Shu matn o'zi ekranga
    // chiqib qolmasin — do'konchi "balance_empty" degan so'zni tushunmaydi
    // va nima qilishi kerakligini bilmay qoladi.
    if (res.status === 402 && body?.error === 'balance_empty') {
      err.balanceEmpty = true;
      err.message = translate('balanceEmptyBlocked');
    }
    throw err;
  }
  return res.json();
}

/* ─────────── Taklif kodi ───────────
 *
 * Do'konchi taklif havolasidan kirsa, kim chaqirgani shu yerda
 * ushlanadi. Ilgari server 'ref' ni qabul qilardi, lekin ilova uni
 * HECH QACHON yubormasdi — ya'ni taklif tizimi butunlay ishlamasdi:
 * hech kim hech kimga biriktirilmasdi.
 *
 * Ikki yo'l bilan keladi:
 *   Telegram ichida — startapp parametri (initDataUnsafe.start_param)
 *   Brauzerda       — ?ref=ARABIC12
 *
 * Kod localStorage ga yoziladi: do'konchi havolani bosib, keyin kod
 * kutib turib, ekranni yangilashi mumkin — o'shanda ham yo'qolmasin.
 */
const REF_KEY = 'ref_code';

function takeRef(): string | undefined {
  try {
    const tg = (window as any).Telegram?.WebApp;
    const raw =
      String(tg?.initDataUnsafe?.start_param ?? '') ||
      new URLSearchParams(location.search).get('ref') ||
      localStorage.getItem(REF_KEY) ||
      '';
    // 'ref12' ham, 'ARABIC12' ham qabul qilinadi
    const m = /^(?:ref|ARABIC)(\d{1,9})$/i.exec(raw.trim());
    return m ? `ARABIC${m[1]}` : undefined;
  } catch {
    return undefined;
  }
}

/** Havoladan kelgan taklif kodini saqlab qo'yish (ilova ochilganda) */
export function rememberRef(): void {
  try {
    const code = takeRef();
    if (code) localStorage.setItem(REF_KEY, code);
  } catch {
    /* localStorage yopiq bo'lishi mumkin */
  }
}

export const api = {
  // Yordam kontaktlari (kirish shart emas)
  support: () => request<{ phone: string; telegram: string }>('/public/support'),
  // Xodim (sotuvchi) kirishi: do'kon telefoni + 4 xonali PIN
  // Shtrix-kod bo'yicha to'liq javob: tovar bormi, katalogda bormi, kod to'g'rimi
  /** Kirim ekranida yorliq chop etish uchun bo'sh ichki kod */
  newBarcode: () => request<{ barcode: string }>('/barcodes/new'),
  lookupBarcode: (code: string) =>
    request<BarcodeLookup>(`/barcodes/lookup?code=${encodeURIComponent(code)}`),
  attachBarcode: (productId: number, barcode: string) =>
    request<Product>(`/products/${productId}/barcodes`, { method: 'POST', body: JSON.stringify({ barcode }) }),
  // Tovarning ochiq partiyalari
  productBatches: (productId: number) => request<Batch[]>(`/products/${productId}/batches`),
  setBatchExpiry: (productId: number, batchId: number, expiry_date: string | null) =>
    request<Batch[]>(`/products/${productId}/batches/${batchId}`, {
      method: 'PATCH',
      body: JSON.stringify({ expiry_date }),
    }),
  productBarcodes: (productId: number) =>
    request<{ id: number; barcode: string; created_at: string }[]>(`/products/${productId}/barcodes`),
  removeBarcode: (productId: number, barcode: string) =>
    request<{ ok: boolean }>(`/products/${productId}/barcodes/${encodeURIComponent(barcode)}`, { method: 'DELETE' }),
  employeeLogin: (phone: string, pin: string) =>
    request<{ token: string; shop: Shop; employee: Employee }>('/auth/employee', {
      method: 'POST',
      body: JSON.stringify({ phone, pin }),
    }),
  /** Kod Telegram bot orqali boradi. via='none' — raqam hali ulanmagan. */
  requestOtp: (phone: string) =>
    request<{
      ok: boolean;
      via: 'telegram' | 'none';
      bot?: string;
      /** botga to'g'ridan-to'g'ri havola: bosilsa /start o'zi bosiladi */
      deep_link?: string;
      dev_hint?: string;
    }>('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verify: (phone: string, code: string, shop_name?: string, init_data?: string) =>
    request<{ token: string; shop: Shop }>('/auth/verify', {
      method: 'POST',
      // Taklif kodi ham ketadi: kim chaqirgani faqat RO'YXATDAN
      // O'TISHDA yoziladi, keyin bilib bo'lmaydi
      body: JSON.stringify({ phone, code, shop_name, init_data, ref: takeRef() }),
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
  intake: (data: { barcode?: string; name: string; unit?: string; price_qty?: number; cost_price?: number; sell_price?: number; qty?: number; expiry_date?: string; image?: string; category?: string; catalog_id?: number; proba?: string; weight_g?: number; size?: string; stone?: string }) =>
    request<Product>('/products/intake', { method: 'POST', body: JSON.stringify(data) }),
  createSale: (data: { items: { product_id: number; qty: number }[]; payment_type: 'cash' | 'card' | 'debt'; customer_id?: number; customer_name?: string; customer_phone?: string; due_date?: string; allow_negative?: boolean }) =>
    request<Sale>('/sales', { method: 'POST', body: JSON.stringify(data) }),
  reports: (period: 'day' | 'week' | 'month') => request<Report>(`/reports/summary?period=${period}`),
  suppliers: () => request<Supplier[]>('/suppliers'),
  supplier: (id: number) => request<SupplierDetail>(`/suppliers/${id}`),
  // Ta'minotchi botga ulanganmi va ulash havolasi
  supplierTelegram: (id: number) => request<SupplierTelegram>(`/suppliers/${id}/telegram`),
  createSupplierDebt: (data: { supplier_id?: number; supplier_name?: string; amount: number; note?: string; due_date?: string }) =>
    request<SupplierDebt>('/supplier-debts', { method: 'POST', body: JSON.stringify(data) }),
  paySupplierDebt: (id: number, amount: number) =>
    request<SupplierDebt>(`/supplier-debts/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount }) }),
  lookupCustomer: (phone: string) =>
    request<{ customer: Customer | null }>(`/customers/lookup?phone=${encodeURIComponent(phone)}`),
  employeeReport: (period: 'day' | 'week' | 'month') =>
    request<EmployeeStat[]>(`/reports/employees?period=${period}`),
  customerTelegram: (id: number) => request<CustomerTelegram>(`/customers/${id}/telegram`),
  unlinkCustomerTelegram: (id: number) =>
    request<{ ok: boolean }>(`/customers/${id}/telegram`, { method: 'DELETE' }),
  parseVoiceCart: (text: string) =>
    request<{ raw: string; lines: { said: string; qty: number; product: Product | null; score: number }[]; found: number; missing: string[] }>(
      '/voice/cart',
      { method: 'POST', body: JSON.stringify({ text }) }
    ),
  dailyReportPreview: () =>
    request<{ text: string; telegram_linked: boolean; bot?: string; figures: Record<string, number> }>(
      '/reports/daily/preview'
    ),
  sendDailyReport: () => request<{ ok: boolean }>('/reports/daily/send', { method: 'POST' }),
  setPlu: (productId: number, plu?: string) =>
    request<Product & { sample_barcode: string }>(`/products/${productId}/plu`, {
      method: 'POST',
      body: JSON.stringify({ plu }),
    }),
  removePlu: (productId: number) =>
    request<{ ok: boolean }>(`/products/${productId}/plu`, { method: 'DELETE' }),
  setDiscount: (ids: number[], percent: number) =>
    request<{ ok: boolean; percent: number; changed: number }>('/products/discount', {
      method: 'POST',
      body: JSON.stringify({ ids, percent }),
    }),
  // ── Markaziy katalog ──
  catalogCategories: () => request<CatalogCategory[]>('/catalog/categories'),
  catalogProducts: (params: { q?: string; category?: number; barcode?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)])
    ).toString();
    return request<CatalogProduct[]>(`/catalog/products${qs ? `?${qs}` : ''}`);
  },
  orderSuggest: () => request<OrderSuggestion[]>('/orders/suggest'),
  orders: () => request<Order[]>('/orders'),
  createOrder: (data: { supplier_id?: number | null; note?: string; items: { product_id?: number; name: string; unit?: string; qty: number }[] }) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify(data) }),
  updateOrder: (id: number, data: { status: 'draft' | 'sent' | 'received' }) =>
    request<Order>(`/orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteOrder: (id: number) => request<{ ok: boolean }>(`/orders/${id}`, { method: 'DELETE' }),
  // Buyurtmani ta'minotchining Telegramiga yuborish
  sendOrderTelegram: (data: { supplier_id: number | null; text: string }) =>
    request<OrderSendResult>('/orders/send-telegram', { method: 'POST', body: JSON.stringify(data) }),
  employees: () => request<Employee[]>('/employees'),
  permCatalog: () => request<PermCatalog>('/employees/permissions'),
  deleteEmployee: (id: number) => request<{ ok: true }>(`/employees/${id}`, { method: 'DELETE' }),
  // Kim, qachon kirdi
  employeeLogins: () => request<EmployeeLogin[]>('/employees/logins'),
  createEmployee: (data: { name: string; pin: string; permissions?: PermKey[] }) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: { is_active?: number; name?: string; pin?: string; permissions?: PermKey[] }) =>
    request<Employee>(`/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  referral: () =>
    request<{
      code: string;
      invited_count: number;
      reward_text: string;
      /** bitta do'kon uchun beriladigan bonus */
      bonus?: number;
      /** shu paytgacha haqiqatda tushgan pul */
      earned?: number;
      /** taklif havolasi — bot nomi serverdan keladi */
      link?: string;
    }>('/referral'),

  /* ── AI yordamchi ── */
  aiStatus: () => request<AiStatus>('/ai/status'),
  aiAsk: (question: string, deep = false) =>
    request<{ text: string; chat_id: number; tools_used: string[] }>('/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, deep }),
    }),
  aiHistory: () => request<AiMessage[]>('/ai/history'),

  /**
   * Savol — javob bo'lak-bo'lak keladi.
   *
   * Oddiy so'rovda do'konchi butun javob yozilguncha bo'sh ekranga
   * qarab turadi (model soniyasiga ~44 token yozadi). Bu yerda esa
   * birinchi so'zlar darhol chiqadi.
   */
  aiStream: async (question: string, on: (e: AiEvent) => void, images?: string[]) => {
    // Telefonda aloqa uzilsa oqim shunchaki to'xtab qolishi mumkin —
    // u holda nuqtalar abadiy aylanaverardi. Shu sababli qorovul qo'yamiz:
    // STALL_MS davomida bitta ham bo'lak kelmasa yoki javob TOTAL_MS dan
    // uzoq cho'zilsa, so'rovni uzib, tushunarli xato beramiz.
    //
    // Lekin YUKLASH bosqichi alohida hisoblanadi. Nakladnoy surati
    // telefondan chiqib ketguncha sekin aloqada bir necha daqiqa ketishi
    // mumkin va o'sha paytda serverdan bitta ham bayt kelmaydi. Ilgari
    // jimlik soati so'rov boshlanishi bilan yurar edi va hammasi joyida
    // bo'la turib "Aloqa uzilib qoldi" chiqib qolardi. Endi yuklashga
    // alohida UPLOAD_MS beriladi.
    //
    // Yuklash tugaganini SARLAVHALAR emas, BIRINCHI BAYT bildiradi:
    // Node tomonda writeHead() sarlavhalarni darhol simga chiqarmaydi —
    // birinchi yozuvgacha buferda ushlab turishi mumkin. Sarlavhaga
    // ishonsak, jimlik soatiga o'tish kechikadi; bayt esa yolg'on
    // gapirmaydi — u kelgan bo'lsa, surat serverga yetib borgan.
    //
    // Umumiy soat ham xuddi shu birinchi baytdan yuradi. Ilgari u so'rov
    // boshidan yurar edi va yuklashga ketgan vaqt uning ichidan yeyilardi:
    // surat 120 soniyada chiqsa javobga atigi 60 soniya qolar, mijoz esa
    // SERVERDAN OLDIN taslim bo'lardi — server hali gapini aytib
    // ulgurmagan bo'lardi. Server javobini ~75 soniyada tugatadi, TOTAL_MS
    // esa undan ancha katta: endi mijoz har doim serverdan KEYIN taslim
    // bo'ladi.
    //
    // Javob boshlangach server har 15 soniyada ": ping" yozib turadi,
    // ya'ni tirik ulanishda jimlik deyarli bo'lmaydi — bu qorovul
    // chindan o'lgan ulanish uchun, sekin ishlagani uchun emas.
    // UMUMIY CHEGARA YO'Q — ataylab.
    //
    // Do'konchi uchun "biroz kutish" muammo emas, "javob bermadi" —
    // muammo. Ilgari 180 soniyalik umumiy chegara bor edi va u
    // ISHLAYOTGAN so'rovni ham kesib tashlardi: uzun nakladnoy
    // o'qilayotgan payt javob tayyor bo'la turib xato chiqardi.
    //
    // Qorovul faqat JIMLIK bo'yicha ishlaydi. Server har 15 soniyada
    // ": ping" yozib turadi va model har bo'lakni darhol yuboradi, ya'ni
    // tirik ulanishda jimlik bo'lmaydi. Demak qorovul faqat chindan
    // o'lgan ulanishni tutadi — sekin ishlaganini emas. Javob qancha
    // davom etsa ham kutiladi.
    const UPLOAD_MS = 180_000;
    const STALL_MS = 90_000;
    const ac = new AbortController();
    // Qorovul NIMA UCHUN uzganini eslab qolamiz: bitta bayroq bilan
    // uchala muddatga bitta xato matni chiqarardik va vaqt tugaganda ham
    // "internetni tekshiring" deyilardi — holbuki aloqa sog'lom edi,
    // shunchaki javob uzoq davom etdi. Do'konchi internetini bekorga
    // tekshirib yurmasin.
    let cause: 'stall' | null = null;
    const cut = () => { cause = 'stall'; ac.abort(); };
    const cutError = () => new Error(translate('aiStalled'));

    // Yuklashga kengroq muddat: sekin aloqada surat chiqib ketguncha
    // serverdan bitta ham bayt kelmaydi
    let watch = setTimeout(cut, UPLOAD_MS);
    const kick = () => { clearTimeout(watch); watch = setTimeout(cut, STALL_MS); };
    const stop = () => clearTimeout(watch);

    let res: Response;
    try {
      res = await fetch(`${BASE}/ai/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ question, images }),
        signal: ac.signal,
      });
    } catch (e) {
      stop();
      if (cause) throw cutError();
      throw new Error(translate('gatewayError'));
    }
    if (!res.ok || !res.body) {
      // Tanani o'qish ham qorovul ostida qoladi: ilgari stop() tanadan
      // OLDIN chaqirilardi va tana kelmay qolsa hech kim so'rovni uzmasdi —
      // va'da hech qachon yopilmay, nuqtalar abadiy aylanaverardi.
      const body: any = await res.json().catch(() => ({}));
      stop();
      if (cause) throw cutError();
      throw new Error(body.message ?? translate('gatewayError'));
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      let done: boolean, value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (e) {
        stop();
        if (cause) throw cutError();
        // Qorovul emas, ulanishning o'zi o'rtada uzildi. Xom brauzer
        // xatosi inglizcha bo'ladi — suhbat pufakchasiga o'zbekcha chiqsin.
        throw new Error(translate('aiNetLost'));
      }
      // Birinchi muvaffaqiyatli o'qish = yuklash tugadi: shu yerdan
      // boshlab qorovul qisqaroq jimlik soatiga o'tadi
      if (done) break;
      kick();
      buf += dec.decode(value, { stream: true });
      // SSE bo'laklari bo'sh qator bilan ajratiladi. Bo'lak yarim
      // kelishi mumkin — oxirgi tugallanmagan qismini saqlab qolamiz.
      const parts = buf.split('\n\n');
      buf = parts.pop() ?? '';
      for (const p of parts) {
        const line = p.trim();
        if (!line.startsWith('data:')) continue;
        try {
          on(JSON.parse(line.slice(5)));
        } catch {
          /* buzuq bo'lak butun oqimni to'xtatmasin */
        }
      }
    }
    stop();
  },
  aiClear: () => request<{ ok: true }>('/ai/history', { method: 'DELETE' }),
  /** Yuguruvchi e'lon — kirmagan foydalanuvchi ham ko'radi */
  announce: () => request<Announce>('/public/announce'),
  /** Tayyor javobni Telegramga uzatish — modelga urinmasdan, darhol */
  aiToTelegram: (text: string, title?: string) =>
    request<{ ok: true }>('/ai/telegram', { method: 'POST', body: JSON.stringify({ text, title }) }),
  /** Rasmdan o'qilgan kirimni tasdiqlash — shundan keyin omborga tushadi */
  aiIntakeConfirm: (draft_id: number, items: AiDraftItem[]) =>
    request<{ ok: boolean; done: { nom: string; miqdor: number }[]; failed: { nom: string; sabab: string }[] }>(
      '/ai/intake/confirm',
      { method: 'POST', body: JSON.stringify({ draft_id, items }) }
    ),
  /** Hali tasdiqlanmagan takliflar — ilova ochilganda kartalar joyiga qaytadi */
  aiIntakePending: () => request<AiPendingDraft[]>('/ai/intake/pending'),
  /** To'lov cheki: kartaga o'tkazilgan pulning suratini yuborish.
      Balansga o'zi tushmaydi — admin ko'rib tasdiqlaydi. */
  sendPayReceipt: (body: { amount: number; image?: string; agent_phone?: string; note?: string }) =>
    request<{ ok: true; id: number; agent_name: string | null }>('/balance/receipt', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  aiIntakeCancel: (draft_id: number) =>
    request<{ ok: true }>('/ai/intake/cancel', { method: 'POST', body: JSON.stringify({ draft_id }) }),
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
  sales: (limit = 50, q = '') =>
    request<SaleRow[]>(`/sales?limit=${limit}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
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
  updateMe: (data: Partial<Pick<Shop, 'name' | 'owner_name' | 'address' | 'language' | 'card_number' | 'daily_goal' | 'report_enabled' | 'report_hour' | 'allow_negative_stock' | 'staff_notify' | 'shop_type' | 'gold_prices'>>) =>
    request<Shop>('/me', { method: 'PATCH', body: JSON.stringify(data) }),
  balance: () => request<BalanceInfo>('/balance'),
  topup: (amount: number) =>
    request<ServiceState>('/balance/topup', { method: 'POST', body: JSON.stringify({ amount }) }),
  categories: () => request<{ name: string; count: number }[]>('/categories'),
  expenses: (period: ExpensePeriod, category?: string) =>
    request<ExpensesInfo>(`/expenses?period=${period}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
  createExpense: (data: { category: string; amount: number; note?: string; spent_at?: string; is_recurring?: boolean }) =>
    request<Expense>('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  updateExpense: (
    id: number,
    // is_recurring bu yerda boolean — server 0/1 ga o'giradi
    data: { category?: string; amount?: number; note?: string; spent_at?: string; is_recurring?: boolean }
  ) => request<Expense>(`/expenses/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteExpense: (id: number) => request<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' }),
  expensesExportUrl: (period: string) => `${BASE}/expenses/export?period=${period}`,
  createReturn: (saleId: number, data: { items: { sale_item_id: number; qty: number }[]; reason?: string; refund_type?: 'cash' | 'card' | 'debt' }) =>
    request<ReturnRow>(`/sales/${saleId}/returns`, { method: 'POST', body: JSON.stringify(data) }),
  returns: (period: ExpensePeriod = 'month') => request<ReturnsInfo>(`/returns?period=${period}`),
  returnLookup: (code: string) => request<ReturnLookup>(`/returns/lookup?code=${encodeURIComponent(code)}`),
  generateBarcode: (productId: number) =>
    request<{ barcode: string; product: Product }>(`/products/${productId}/barcode`, { method: 'POST' }),
};

export interface Shop {
  id: number;
  /** xizmat holati: balans, kunlik narx, yana necha kun yetishi */
  service?: ServiceState;
  trial_ends_at?: string | null;
  /** to'ldirilgan bo'lsa — sessiya xodimniki, ilova cheklangan rejimda ishlaydi */
  employee?: Employee | null;
  phone: string;
  name: string;
  owner_name: string | null;
  address: string | null;
  language: string;
  card_number: string | null;
  balance: number;
  /** kunlik savdo maqsadi (0 — belgilanmagan) */
  daily_goal?: number;
  /** kechki avtomatik hisobot: yoqilganmi va qaysi soatda */
  report_enabled?: number;
  report_hour?: number;
  /** qoldiqdan ko'p sotishga ruxsat (0 — yo'q) */
  allow_negative_stock?: number;
  /** xodim kirganda Telegram'ga xabar (1 — yoqilgan) */
  staff_notify?: number;
  /** do'kon turi: oziq | parfumeriya | oltin ... (shopTypes.ts) */
  shop_type?: string;
  /** zargarlik uchun gramm narxlari, JSON: {"585": 1100000} */
  gold_prices?: string | null;
}

/** Xizmat holati: tarif yo'q, balansdan har kuni bir kunlik narx yechiladi */
export interface ServiceState {
  balance: number;
  /** xizmat qaysi kungacha to'langan */
  charged_through: string;
  active: boolean;
  daily_price: number;
  /** balans bilan yana necha kun ishlaydi */
  days_left: number;
  /** balans tugaydigan sana */
  runs_out_on: string;
  on_trial: boolean;
  /** kam qoldi — ogohlantirish ko'rsatiladi */
  low: boolean;
  /** kunlik narx 0 — do'kondan pul olinmaydi */
  free?: boolean;
}

/** Yuborilgan to'lov cheki */
export interface Receipt {
  id: number;
  amount: number;
  image_url: string | null;
  agent_phone: string | null;
  note: string | null;
  /** admin nega rad etgani */
  review_note: string | null;
  status: 'new' | 'approved' | 'rejected';
  created_at: string;
}

export interface BalanceInfo extends ServiceState {
  min_topup: number;
  transactions: { id: number; type: string; amount: number; note: string | null; created_at: string }[];
  /** yuborilgan cheklar va ularning holati */
  receipts: Receipt[];
  /** tez to'ldirish tugmalari: summa va u necha kunga yetishi */
  presets: { amount: number; days: number }[];
  /** pul o'tkaziladigan karta (admin panelda kiritiladi) */
  card: string;
  card_holder: string;
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

/** Tarozi bosgan yorliq: og'irlik/narx kodning ichida */
export interface ScaleInfo {
  plu: string;
  mode: 'weight' | 'price';
  value: number;
  /** savatga qo'shiladigan miqdor (kg) */
  qty: number;
}

export interface BarcodeLookup {
  code: string;
  /** true — nazorat raqami to'g'ri, false — xato, null — tekshirib bo'lmaydi */
  valid: boolean | null;
  product: Product | null;
  catalog: { barcode: string; name: string; unit: string } | null;
  /** faqat tarozi yorlig'i skanerlanganda to'ladi */
  scale?: ScaleInfo | null;
}

export interface Employee {
  id: number;
  name: string;
  role: string;
  is_active: number;
  /** faqat do'kon egasi ro'yxatida keladi — sotuvchiga aytish uchun */
  pin?: string;
  /** Nima qila olishi. Ega har bir xodimga alohida belgilaydi. */
  permissions?: PermKey[];
}

/** Ruxsatlar ro'yxati — serverdan keladi, ilova o'zi yozib o'tirmaydi */
export interface PermCatalog {
  groups: { group: string; keys: PermKey[] }[];
  all: PermKey[];
  presets: Record<string, PermKey[]>;
}

/** AI yordamchining holati */
export interface AiStatus {
  enabled: boolean;
  model: string;
  daily_limit: number;
  asked_today: number;
  /** null — cheksiz */
  left_today: number | null;
  /** bitta savol narxi, so'm. 0 — bepul */
  price: number;
}

/** Kirim taklifidagi bitta qator */
export interface AiDraftItem {
  nom: string;
  miqdor: number;
  birlik: string;
  kirim_narxi: number;
  sotuv_narxi: number;
  srok: string;
  /** skaner o'qiydigan kod: nakladnoyda bo'lmasa do'konchi o'zi qo'shadi */
  shtrix_kod?: string;
  /* Zargarlik birkasidan o'qilgani — nomga emas, o'z maydoniga */
  proba?: string;
  massa?: number;
  olcham?: string;
  vstavka?: string;
  /* Quyidagilarni vosita ombordan topib qo'shadi — faqat ko'rsatish
     uchun. Do'konchi tovar allaqachon borligini tasdiqlashdan OLDIN
     bilishi kerak, aks holda ikkinchi nusxa ochilib ketardi. */
  omborda_bor?: boolean;
  mavjud_id?: number | null;
  eski_birlik?: string | null;
  /** ombordagi tovarning o'z nomi — moslik to'g'rimi, ko'rinib tursin */
  eski_nom?: string | null;
  eski_sotuv_narxi?: number | null;
  eski_qoldiq?: number | null;
  /** sotuv narxi nakladnoydan emas, ombordan olinganmi */
  sotuv_narxi_ombordan?: boolean;
  /** Kod boshqa tovarga biriktirilgan bo'lsa, do'konchi kartadagi
      ogohlantirishni ko'rib "o'tkazilsin" degani. Faqat shunda server
      kodni eski egasidan olib bu tovarga biriktiradi. */
  kod_kochir?: boolean;
}

/** Tasdiqlanmagan taklif — ekrandan chiqilsa ham bazada turaveradi */
export interface AiPendingDraft {
  id: number;
  items: AiDraftItem[];
  created_at: string;
}

/** Oqimdan keladigan hodisa */
export type AiEvent =
  | { type: 'status'; tool: string }
  | { type: 'text'; delta: string }
  | { type: 'draft'; draft_id: number; items: AiDraftItem[] }
  | { type: 'done'; charged: number; tools: string[] }
  | { type: 'error'; code: string; message: string };

/** Suhbatdagi bitta xabar */
export interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
  /** yuborilgan surat: serverdan "/uploads/..." keladi, endigina
      yuborilganda esa ekranda darhol ko'rinishi uchun "data:..." */
  image_url?: string | null;
  /** Bir xabarga bir nechta surat qo'yilgan bo'lsa — hammasi.
      Eski yozuvlarda bo'sh keladi, u holda image_url ishlatiladi. */
  image_urls?: string[] | null;
  created_at: string;
}

/** Xodimning bitta kirishi */
export interface EmployeeLogin {
  id: number;
  employee_id: number;
  employee_name: string | null;
  created_at: string;
}

export type ReminderMode = 'off' | 'soft' | 'medium' | 'call';

/** Qarzdorning to'lov odati — "buni kutish mumkinmi" degan savolga javob */
export interface Trust {
  level: 'new' | 'good' | 'warn' | 'bad';
  closed: number;
  on_time: number;
  late: number;
  avg_late_days: number;
  overdue_days: number;
}

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
  trust?: Trust | null;
  /** Telegram'ga ulangan bo'lsa chek o'ziga boradi */
  telegram_user_id?: number | null;
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

/** Mijozni Telegram'ga ulash havolasi */
export interface CustomerTelegram {
  linked: boolean;
  code: string;
  /** bot nomi sozlanmagan bo'lsa null */
  link: string | null;
}

export interface Product {
  category?: string | null;
  id: number | null;
  barcode: string | null;
  name: string;
  unit: string;
  /** narx qaysi miqdorga aytilgan: 0.1 = "100 gramm uchun" */
  price_qty?: number;
  cost_price: number;
  sell_price: number;
  stock: number;
  low_stock_threshold?: number;
  /** tarozi raqami — og'irlikda sotiladigan tovarda */
  plu?: string | null;
  expiry_date: string | null;
  /** chegirma foizi (0-90) */
  discount_percent?: number;
  /** srogigacha necha kun qolgani (faqat dashboarddagi ro'yxatda) */
  days_left?: number;
  /** chegirmadan keyingi narx (faqat dashboarddagi ro'yxatda) */
  price_after_discount?: number;
  image_url: string | null;
  supplier_id?: number | null;
  supplier_name?: string | null;
  from_catalog?: boolean;
  /* Zargarlik buyumi — yorliqdagi to'rt qator (faqat oltin do'konida) */
  proba?: string | null;
  weight_g?: number | null;
  size?: string | null;
  stone?: string | null;
}

/** Xodim samaradorligi: kim qancha sotdi va qancha foyda keltirdi */
export interface EmployeeStat {
  employee_id: number | null;   // null — do'kon egasi o'zi sotgan
  name: string | null;
  is_active: boolean;
  sales_count: number;
  revenue: number;              // qaytarishlardan keyin
  gross_revenue: number;
  returned: number;
  returns_count: number;
  debt_revenue: number;
  items: number;
  profit: number;
  avg_check: number;
}

/** Buyurtma taklifi: kam qolgan tovar + tavsiya etilgan miqdor */
export interface OrderSuggestion {
  id: number;
  name: string;
  unit: string;
  stock: number;
  low_stock_threshold: number;
  cost_price: number;
  supplier_id: number | null;
  supplier_name: string | null;
  sold30: number;
  suggest_qty: number;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number | null;
  name: string;
  unit: string;
  qty: number;
}

export interface Order {
  id: number;
  supplier_id: number | null;
  supplier_name: string | null;
  supplier_phone: string | null;
  note: string | null;
  status: 'draft' | 'sent' | 'received';
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
  items: OrderItem[];
}

/** Katalog bo'limi (ildiz bo'lsa ichida `children` bo'ladi) */
export interface CatalogCategory {
  id: number;
  parent_id: number | null;
  name_uz: string;
  name_ru: string;
  glyph: string | null;
  color: string | null;
  product_count: number;
  children?: CatalogCategory[];
}

/** Markaziy katalogdagi tovar */
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
  category_uz?: string;
  category_ru?: string;
  category_glyph?: string | null;
  category_color?: string | null;
}

/** Tovarning bitta partiyasi — bir marta kelgan to'plam */
export interface Batch {
  id: number;
  product_id: number;
  qty: number;
  qty_left: number;
  cost_price: number;
  expiry_date: string | null;
  created_at: string;
}

/** Ta'minotchining bot bilan bog'lanishi */
export interface SupplierTelegram {
  name: string;
  phone: string | null;
  linked: boolean;
  /** bir martalik ulash havolasi (raqam yoki bot nomi yo'q bo'lsa — null) */
  invite: string | null;
}

/** /orders/send-telegram javobi */
export interface OrderSendResult {
  sent: boolean;
  name?: string;
  phone?: string;
  /** ta'minotchini botga ulaydigan bir martalik havola */
  invite?: string;
  reason?: 'no_supplier' | 'no_phone' | 'bot_off' | 'not_linked';
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
  /** shu sotuvdan qaytarilgan summa */
  returned: number;
}

export interface SaleDetail {
  id: number;
  total: number;
  payment_type: string;
  created_at: string;
  /** returned_qty — shu satrdan qancha tovar qaytarilgan */
  items: { id: number; name: string; unit: string; qty: number; price: number; returned_qty: number }[];
  customer: { name: string; phone: string | null } | null;
  /** chek chop etish uchun do'kon rekvizitlari */
  shop: { name: string; phone: string | null; address: string | null; card_number: string | null } | null;
  returns: { id: number; total: number; reason: string | null; refund_type: string; created_at: string }[];
  seller: { name: string } | null;
}

export interface ReturnRow {
  id: number;
  sale_id: number | null;
  customer_id: number | null;
  customer_name?: string | null;
  total: number;
  reason: string | null;
  refund_type: string;
  created_at: string;
  items?: string | null;
}

/** Skanerlangan tovarni qaytarish uchun: tovar va qaytarsa bo'ladigan sotuvlar */
export interface ReturnCandidate {
  sale_item_id: number;
  sale_id: number;
  price: number;
  qty: number;
  returned_qty: number;
  /** shu satrdan yana qancha qaytarish mumkin */
  left_qty: number;
  created_at: string;
  payment_type: string;
  customer_name: string | null;
}

export interface ReturnLookup {
  code: string;
  product: Product | null;
  /** tarozi yorlig'i bo'lsa — og'irlik kodning ichidan o'qiladi */
  scale: { plu: string; qty: number; mode: string } | null;
  candidates: ReturnCandidate[];
}

export interface ReturnsInfo {
  items: ReturnRow[];
  count: number;
  total: number;
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
  /** "Qarzlarni ko'rish" ruxsati bormi (server hal qiladi) */
  debts_visible?: boolean;
  i_owe: number;
  net: number;
  today: {
    count: number;
    revenue: number;
    cash: number;
    card: number;
    debt: number;
    /** yalpi foyda — tovar ustamasi */
    profit: number;
    /** bugun qaytarilgan summa */
    returns: number;
    /** bugungi xarajatlar */
    expenses: number;
    /** sof foyda = yalpi foyda − xarajatlar */
    net_profit: number;
  };
  /** kunlik savdo maqsadi (0 — belgilanmagan) */
  daily_goal: number;
  /** shu oy boshidan beri xarajatlar */
  month_expenses: number;
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
  /** yalpi foyda — tovar ustamasi */
  profit: number;
  /** qaytarishlarsiz tushum */
  gross_revenue: number;
  /** shu davrda qaytarilgan summa */
  returns: number;
  /** shu davrdagi xarajatlar */
  expenses: number;
  /** sof foyda = yalpi foyda − xarajatlar */
  net_profit: number;
  expenses_by_category: { category: string; total: number }[];
  top_products: { name: string; sold: number; revenue: number }[];
}

export type ExpensePeriod = 'day' | 'week' | 'month' | 'all';

export interface Expense {
  id: number;
  category: string;
  amount: number;
  note: string | null;
  spent_at: string;
  is_recurring: number;
  created_by_name?: string | null;
  created_at: string;
}

export interface ExpensesInfo {
  items: Expense[];
  count: number;
  total: number;
  by_category: { category: string; count: number; total: number }[];
  /** har oy takrorlanadigan, lekin bu oyda hali yozilmagan xarajatlar */
  suggestions: { category: string; last_at: string; amount: number }[];
  known_categories: string[];
}

export { fmt, fmtShort } from './i18n';

/** Ilova tepasidan o'tib turadigan e'lon */
export interface Announce {
  enabled: boolean;
  text?: string;
  color?: string;
  bg1?: string;
  bg2?: string;
  size?: number;
  weight?: string;
  /** to'liq aylanish necha soniyada — kichik son = tezroq */
  speed?: number;
  audience?: string;
  /** ro'yxatdagi o'rni — bir nechta e'lon bo'lishi mumkin */
  id?: string;
  /** hamma e'lonlar. Eski javobda yo'q — o'shanda bittasi ishlatiladi */
  items?: Announce[];
}
