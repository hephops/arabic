// AI yordamchining vositalari.
//
// ENG MUHIM QOIDA: model `shop_id` ni BERMAYDI. U tokendan olinadi va
// shu yerda, serverda qo'yiladi. Modelda begona do'konning raqamini
// yozib yuborish imkoni umuman yo'q — bu tekshirib o'tkaziladigan
// emas, kesib tashlangan yo'l.
//
// Hammasi FAQAT O'QIYDI. Ma'lumot o'zgartiradigan vosita bu yerda yo'q:
// xato javob do'konning tovarini o'chirib yuborsa, ishonch qaytmaydi.

import { db } from '../db.js';
import { dailyPrice } from '../billing.js';
import { barcodeVariants, normalizeBarcode, checkGtin } from '../barcodes.js';

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  /** shopId serverda qo'yiladi — modeldan kelmaydi.
   *  ctx — so'ragan odamning huquqi: kirim narxini ko'ra oladimi. */
  run: (shopId: number, input: any, ctx: ToolCtx) => unknown | Promise<unknown>;
  /** Bu vosita ma'lumot o'qimaydi, ISH qiladi (masalan xabar yuboradi) */
  action?: boolean;
}

/**
 * Vositani kim chaqirayotgani.
 *
 * AI yordamchisi oddiy yo'l tekshiruvidan o'tmaydi: u vositani o'zi
 * chaqiradi. Shuning uchun ruxsat shu yerdan uzatiladi — aks holda
 * kirim narxini ko'rish huquqi yo'q xodim ham "foyda qancha?" deb
 * so'rab, tannarxni bilib olardi.
 */
export interface ToolCtx {
  /** kirim narxi va foydani ko'rsa bo'ladimi (cost_view) */
  costView: boolean;
}

/** Kirim narxi bilan bog'liq maydonlarni javobdan olib tashlash */
function stripCost<T>(rows: T[], ctx: ToolCtx): T[] {
  if (ctx.costView) return rows;
  return rows.map((r: any) => {
    if (!r || typeof r !== 'object') return r;
    const { kirim_narxi, foyda, boglangan_pul, tannarx, ...qolgani } = r;
    return qolgani;
  }) as T[];
}

/** Uzbekistan vaqti bilan kun boshlanishi (UTC'da saqlanadi) */
const dayExpr = "date('now', '+5 hours')";

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/**
 * Davr chegaralari.
 *
 * Ilgari faqat kun/hafta/oy bor edi va do'konchi "yakshanba kuni
 * qancha savdo bo'lgan?" deb so'raganda yordamchi "bunday funksiya
 * yo'q" deyishga majbur edi. Endi aniq sana ham, oraliq ham bo'ladi.
 *
 * Qaytadi: [dan, gacha] — ikkalasi ham SQL ifodasi ko'rinishida,
 * gacha CHEGARASI KIRADI (>= dan AND <= gacha).
 */
function isDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function period(i: any): { from: string; to: string; label: string } {
  // Aniq oraliq
  if (isDate(i.dan) && isDate(i.gacha)) {
    return { from: `'${i.dan}'`, to: `'${i.gacha}'`, label: `${i.dan} — ${i.gacha}` };
  }
  // Bitta kun
  if (isDate(i.sana)) return { from: `'${i.sana}'`, to: `'${i.sana}'`, label: i.sana };

  const p = String(i.davr ?? 'kun');
  if (p === 'kecha') {
    const y = "date('now', '+5 hours', '-1 day')";
    return { from: y, to: y, label: 'kecha' };
  }
  if (p === 'hafta') return { from: "date('now', '+5 hours', '-6 days')", to: dayExpr, label: 'oxirgi 7 kun' };
  if (p === 'oy') return { from: "date('now', '+5 hours', '-29 days')", to: dayExpr, label: 'oxirgi 30 kun' };
  return { from: dayExpr, to: dayExpr, label: 'bugun' };
}

/** Davr tanlaydigan vositalarda bir xil takrorlanadigan maydonlar */
const PERIOD_FIELDS = {
  davr: { type: 'string', enum: ['kun', 'kecha', 'hafta', 'oy'], description: "kun — bugun. Aniq sana kerak bo'lsa 'sana' maydonini ishlating." },
  sana: { type: 'string', description: "Aniq bitta kun, YYYY-MM-DD. Kerak bo'lmasa bo'sh satr." },
  dan: { type: 'string', description: "Oraliq boshi, YYYY-MM-DD. Kerak bo'lmasa bo'sh satr." },
  gacha: { type: 'string', description: "Oraliq oxiri, YYYY-MM-DD. Kerak bo'lmasa bo'sh satr." },
} as const;
const PERIOD_REQUIRED = ['davr', 'sana', 'dan', 'gacha'];

export const TOOLS: ToolDef[] = [
  {
    name: 'ombor_holati',
    description:
      "Do'kondagi tovarlar va qoldiqlar. filtr: 'hammasi' — barchasi, " +
      "'kam_qolgan' — qoldig'i ozayganlar, 'tugagan' — qoldig'i nol.",
    input_schema: {
      type: 'object',
      properties: {
        filtr: { type: 'string', enum: ['hammasi', 'kam_qolgan', 'tugagan'] },
        limit: { type: 'integer', description: '1 dan 50 gacha' },
      },
      required: ['filtr', 'limit'],
      additionalProperties: false,
    },
    run: (shopId, i, ctx) => {
      const limit = num(i.limit, 20, 1, 50);
      const where =
        i.filtr === 'kam_qolgan'
          ? 'AND p.stock <= COALESCE(p.low_stock_threshold, 5) AND p.stock > 0'
          : i.filtr === 'tugagan'
            ? 'AND p.stock <= 0'
            : '';
      return stripCost(
        db
          .prepare(
            `SELECT p.name AS tovar, p.stock AS qoldiq, p.unit AS birlik,
                    p.sell_price AS narx, p.cost_price AS kirim_narxi,
                    p.category AS kategoriya
             FROM products p WHERE p.shop_id = ? ${where}
             ORDER BY p.stock ASC LIMIT ?`
          )
          .all(shopId, limit) as any[],
        ctx
      );
    },
  },
  {
    name: 'srogi_yaqin',
    description:
      "Yaroqlilik muddati yaqinlashgan partiyalar. Har partiyaning o'z srogi bor. " +
      'kunlar: necha kun ichida tugaydiganlari kerak.',
    input_schema: {
      type: 'object',
      properties: { kunlar: { type: 'integer', description: '1 dan 90 gacha' } },
      required: ['kunlar'],
      additionalProperties: false,
    },
    run: (shopId, i, ctx) => {
      const days = num(i.kunlar, 14, 1, 90);
      return stripCost(
        db
          .prepare(
            `SELECT p.name AS tovar, b.qty_left AS qolgan, p.unit AS birlik,
                    b.expiry_date AS srok,
                    CAST(julianday(b.expiry_date) - julianday(${dayExpr}) AS INTEGER) AS kun_qoldi,
                    b.cost_price AS kirim_narxi,
                    CAST(b.qty_left * b.cost_price AS INTEGER) AS boglangan_pul
             FROM product_batches b JOIN products p ON p.id = b.product_id
             WHERE b.shop_id = ? AND b.qty_left > 0 AND b.expiry_date IS NOT NULL
               AND julianday(b.expiry_date) - julianday(${dayExpr}) <= ?
             ORDER BY b.expiry_date LIMIT 50`
          )
          .all(shopId, days) as any[],
        ctx
      );
    },
  },
  {
    name: 'savdo_hisoboti',
    description:
      "Savdo, foyda va cheklar. Davrni uch xil berish mumkin: davr (kun/kecha/hafta/oy), " +
      "aniq sana (masalan o'tgan yakshanba), yoki dan-gacha oralig'i.",
    input_schema: {
      type: 'object',
      properties: { ...PERIOD_FIELDS },
      required: [...PERIOD_REQUIRED],
      additionalProperties: false,
    },
    run: (shopId, i, ctx) => {
      const { from, to, label } = period(i);
      const sales = db
        .prepare(
          `SELECT COUNT(*) AS chek_soni, COALESCE(SUM(total), 0) AS savdo
           FROM sales WHERE shop_id = ?
             AND date(created_at, '+5 hours') BETWEEN ${from} AND ${to}`
        )
        .get(shopId) as any;
      const profit = db
        .prepare(
          `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS foyda
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
           WHERE s.shop_id = ?
             AND date(s.created_at, '+5 hours') BETWEEN ${from} AND ${to}`
        )
        .get(shopId) as any;
      const rets = db
        .prepare(
          `SELECT COALESCE(SUM(total), 0) AS qaytarilgan FROM returns
           WHERE shop_id = ? AND date(created_at, '+5 hours') BETWEEN ${from} AND ${to}`
        )
        .get(shopId) as any;
      const byPay = db
        .prepare(
          `SELECT payment_type AS tolov_turi, COUNT(*) AS soni, COALESCE(SUM(total), 0) AS summa
           FROM sales WHERE shop_id = ?
             AND date(created_at, '+5 hours') BETWEEN ${from} AND ${to}
           GROUP BY payment_type`
        )
        .all(shopId);
      const avg = sales.chek_soni ? Math.round(sales.savdo / sales.chek_soni) : 0;
      return {
        davr: label,
        savdo: sales.savdo,
        // Foyda kirim narxidan kelib chiqadi — huquqi yo'q xodimga
        // aytilmaydi (aks holda tannarxni oson hisoblab olardi)
        ...(ctx.costView ? { foyda: profit.foyda } : {}),
        qaytarilgan: rets.qaytarilgan,
        chek_soni: sales.chek_soni,
        ortacha_chek: avg,
        tolov_turlari: byPay,
      };
    },
  },
  {
    name: 'eng_yaxshi_tovarlar',
    description:
      "Eng ko'p sotilgan yoki eng ko'p foyda keltirgan tovarlar. " +
      "tartib: 'savdo', 'foyda' yoki 'miqdor'.",
    input_schema: {
      type: 'object',
      properties: {
        ...PERIOD_FIELDS,
        tartib: { type: 'string', enum: ['savdo', 'foyda', 'miqdor'] },
        limit: { type: 'integer', description: '1 dan 20 gacha' },
      },
      required: [...PERIOD_REQUIRED, 'tartib', 'limit'],
      additionalProperties: false,
    },
    run: (shopId, i, ctx) => {
      const { from, to } = period(i);
      // Foyda bo'yicha saralash ham kirim narxini oshkor qiladi:
      // huquqi yo'q xodimga savdo bo'yicha saralanadi
      const order = !ctx.costView
        ? 'savdo'
        : i.tartib === 'foyda'
          ? 'foyda'
          : i.tartib === 'miqdor'
            ? 'miqdor'
            : 'savdo';
      return stripCost(
        db
          .prepare(
            `SELECT p.name AS tovar, p.unit AS birlik,
                    COALESCE(SUM(si.qty), 0) AS miqdor,
                    CAST(COALESCE(SUM(si.price * si.qty), 0) AS INTEGER) AS savdo,
                    CAST(COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS INTEGER) AS foyda
             FROM sale_items si
             JOIN sales s ON s.id = si.sale_id
             JOIN products p ON p.id = si.product_id
             WHERE s.shop_id = ?
               AND date(s.created_at, '+5 hours') BETWEEN ${from} AND ${to}
             GROUP BY p.id ORDER BY ${order} DESC LIMIT ?`
          )
          .all(shopId, num(i.limit, 10, 1, 20)) as any[],
        ctx
      );
    },
  },
  {
    name: 'harakatsiz_tovarlar',
    description:
      "Uzoq vaqtdan beri sotilmagan, ombordagi pulni bog'lab turgan tovarlar. " +
      'kunlar: necha kundan beri sotilmagan.',
    input_schema: {
      type: 'object',
      properties: { kunlar: { type: 'integer', description: '7 dan 180 gacha' } },
      required: ['kunlar'],
      additionalProperties: false,
    },
    run: (shopId, i, ctx) => {
      const days = num(i.kunlar, 30, 7, 180);
      return stripCost(db
        .prepare(
          `SELECT p.name AS tovar, p.stock AS qoldiq, p.unit AS birlik,
                  CAST(p.stock * p.cost_price AS INTEGER) AS boglangan_pul,
                  (SELECT MAX(date(s.created_at, '+5 hours')) FROM sale_items si
                     JOIN sales s ON s.id = si.sale_id
                    WHERE si.product_id = p.id) AS oxirgi_sotuv
           FROM products p
           WHERE p.shop_id = ? AND p.stock > 0
             AND COALESCE(
                   (SELECT MAX(julianday(s.created_at)) FROM sale_items si
                      JOIN sales s ON s.id = si.sale_id WHERE si.product_id = p.id),
                   julianday(p.created_at)
                 ) < julianday('now') - ?
           ORDER BY boglangan_pul DESC LIMIT 30`
        )
        .all(shopId, days) as any[], ctx);
    },
  },
  {
    name: 'qarzlar',
    description:
      "Mijozlarning qarzlari. holat: 'hammasi', 'kechikkan' (muddati o'tgan) " +
      "yoki 'bugun' (bugun to'lashi kerak).",
    input_schema: {
      type: 'object',
      properties: {
        holat: { type: 'string', enum: ['hammasi', 'kechikkan', 'bugun'] },
        limit: { type: 'integer', description: '1 dan 50 gacha' },
      },
      required: ['holat', 'limit'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const where =
        i.holat === 'kechikkan'
          ? `AND d.due_date IS NOT NULL AND d.due_date < ${dayExpr}`
          : i.holat === 'bugun'
            ? `AND d.due_date = ${dayExpr}`
            : '';
      return db
        .prepare(
          `SELECT c.name AS mijoz, c.phone AS telefon,
                  (d.amount - d.paid_amount) AS qarzi, d.due_date AS muddat,
                  CAST(julianday(${dayExpr}) - julianday(d.due_date) AS INTEGER) AS kechikkan_kun,
                  d.note AS izoh
           FROM debts d JOIN customers c ON c.id = d.customer_id
           WHERE d.shop_id = ? AND d.status != 'paid' ${where}
           ORDER BY d.due_date IS NULL, d.due_date LIMIT ?`
        )
        .all(shopId, num(i.limit, 20, 1, 50));
    },
  },
  {
    name: 'qarzdor_tarixi',
    description:
      "Bitta mijozning qarz va to'lov tarixi — u aytgan vaqtida to'laydimi yoki yo'q. " +
      "mijoz_nomi: ismning bir qismi ham bo'ladi.",
    input_schema: {
      type: 'object',
      properties: { mijoz_nomi: { type: 'string' } },
      required: ['mijoz_nomi'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const c = db
        .prepare('SELECT id, name, phone FROM customers WHERE shop_id = ? AND name LIKE ? LIMIT 1')
        .get(shopId, `%${String(i.mijoz_nomi ?? '').slice(0, 60)}%`) as any;
      if (!c) return { topilmadi: true };
      const debts = db
        .prepare(
          `SELECT amount AS summa, paid_amount AS tolangan, status AS holat,
                  due_date AS muddat, date(created_at, '+5 hours') AS sana
           FROM debts WHERE shop_id = ? AND customer_id = ? ORDER BY id DESC LIMIT 20`
        )
        .all(shopId, c.id);
      // "O'z vaqtida to'ladimi" — yopilgan sana ustuni yo'q, shuning
      // uchun oxirgi to'lov sanasi olinadi (ilovadagi ishonch reytingi
      // ham aynan shunday hisoblaydi — ikki joyda ikki xil raqam
      // chiqmasligi uchun)
      const paid = db
        .prepare(
          `SELECT COUNT(*) AS yopilgan,
                  SUM(CASE WHEN due_date IS NULL
                        OR date(COALESCE((SELECT MAX(dp.created_at) FROM debt_payments dp WHERE dp.debt_id = d.id),
                                         d.created_at), '+5 hours') <= date(due_date)
                      THEN 1 ELSE 0 END) AS oz_vaqtida
           FROM debts d WHERE d.shop_id = ? AND d.customer_id = ? AND d.status = 'paid'`
        )
        .get(shopId, c.id) as any;
      return { mijoz: c.name, telefon: c.phone, qarzlari: debts, tolov_odati: paid };
    },
  },
  {
    name: 'taminotchi_qarzlari',
    description: "Do'kon kimga qancha qarzdor — ta'minotchilar bo'yicha.",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: (shopId) =>
      db
        .prepare(
          `SELECT s.name AS taminotchi, s.phone AS telefon,
                  SUM(sd.amount - sd.paid_amount) AS qarzim,
                  MIN(sd.due_date) AS eng_yaqin_muddat
           FROM supplier_debts sd JOIN suppliers s ON s.id = sd.supplier_id
           WHERE sd.shop_id = ? AND sd.status != 'paid'
           GROUP BY s.id ORDER BY qarzim DESC LIMIT 30`
        )
        .all(shopId),
  },
  {
    name: 'xarajatlar',
    description: "Xarajatlar kategoriya bo'yicha. Davr, aniq sana yoki oraliq.",
    input_schema: {
      type: 'object',
      properties: { ...PERIOD_FIELDS },
      required: [...PERIOD_REQUIRED],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const { from, to } = period(i);
      return db
        .prepare(
          `SELECT COALESCE(category, 'boshqa') AS kategoriya,
                  COUNT(*) AS soni, SUM(amount) AS summa
           FROM expenses WHERE shop_id = ?
             AND date(spent_at, '+5 hours') BETWEEN ${from} AND ${to}
           GROUP BY category ORDER BY summa DESC`
        )
        .all(shopId);
    },
  },
  {
    name: 'xodim_samaradorligi',
    description: "Xodimlar bo'yicha savdo va qaytarishlar. Davr, aniq sana yoki oraliq.",
    input_schema: {
      type: 'object',
      properties: { ...PERIOD_FIELDS },
      required: [...PERIOD_REQUIRED],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const { from, to } = period(i);
      return db
        .prepare(
          `SELECT COALESCE(e.name, 'Do''kon egasi') AS xodim,
                  COUNT(*) AS chek_soni, SUM(s.total) AS savdo
           FROM sales s LEFT JOIN employees e ON e.id = s.created_by
           WHERE s.shop_id = ?
             AND date(s.created_at, '+5 hours') BETWEEN ${from} AND ${to}
           GROUP BY s.created_by ORDER BY savdo DESC`
        )
        .all(shopId);
    },
  },
  {
    name: 'buyurtma_taklifi',
    description:
      "Nima tugayapti va qancha olish kerak — ta'minotchiga buyurtma uchun taklif. " +
      'Sotuv tezligiga qarab hisoblanadi.',
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: (shopId) =>
      db
        .prepare(
          `SELECT p.name AS tovar, p.stock AS qoldiq, p.unit AS birlik,
                  sup.name AS taminotchi,
                  ROUND(COALESCE((
                    SELECT SUM(si.qty) FROM sale_items si JOIN sales s ON s.id = si.sale_id
                     WHERE si.product_id = p.id AND s.created_at >= datetime('now', '-14 days')
                  ), 0) / 14.0, 2) AS kunlik_sotuv
           FROM products p LEFT JOIN suppliers sup ON sup.id = p.supplier_id
           WHERE p.shop_id = ? AND p.stock <= COALESCE(p.low_stock_threshold, 5)
           ORDER BY kunlik_sotuv DESC LIMIT 40`
        )
        .all(shopId),
  },
  {
    name: 'xizmat_balansi',
    description: "Do'konning BuySale xizmatidagi balansi va necha kunga yetishi.",
    input_schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    run: (shopId) => {
      const s = db.prepare('SELECT balance FROM shops WHERE id = ?').get(shopId) as any;
      const rate = dailyPrice() || 1;
      return {
        balans: s?.balance ?? 0,
        kunlik_tolov: rate,
        kun_qoldi: Math.floor((s?.balance ?? 0) / rate),
      };
    },
  },
];

// Cheklar ro'yxati. Do'konchi "cheklarni ko'rsat", "kim nima olgan"
// deganda kerak: ilgari faqat cheklar SONI bor edi va yordamchi
// "bunday vosita yo'q" deyishga majbur edi.
TOOLS.push({
  name: 'cheklar',
  description:
    "Sotuvlar (cheklar) ro'yxati: har birining summasi, to'lov turi, mijozi va vaqti. " +
    'Davr, aniq sana yoki oraliq beriladi.',
  input_schema: {
    type: 'object',
    properties: {
      ...PERIOD_FIELDS,
      limit: { type: 'integer', description: '1 dan 50 gacha' },
    },
    required: [...PERIOD_REQUIRED, 'limit'],
    additionalProperties: false,
  },
  run: (shopId, i) => {
    const { from, to } = period(i);
    return db
      .prepare(
        `SELECT s.id AS chek, s.total AS summa, s.payment_type AS tolov,
                c.name AS mijoz, e.name AS sotuvchi,
                time(s.created_at, '+5 hours') AS vaqt,
                date(s.created_at, '+5 hours') AS sana,
                (SELECT GROUP_CONCAT(p.name || ' ×' || CAST(si.qty AS TEXT), ', ')
                   FROM sale_items si JOIN products p ON p.id = si.product_id
                  WHERE si.sale_id = s.id) AS tovarlar
         FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN employees e ON e.id = s.created_by
         WHERE s.shop_id = ?
           AND date(s.created_at, '+5 hours') BETWEEN ${from} AND ${to}
         ORDER BY s.id DESC LIMIT ?`
      )
      .all(shopId, num(i.limit, 20, 1, 50));
  },
});

/* ─────────── Ish qiladigan vosita ─────────── */

// Faqat BITTASI: do'konchining O'ZIGA Telegram orqali xabar yuborish.
//
// Nega bu xavfsiz: xabar faqat do'konning o'z, ilgari ulangan
// Telegram hisobiga boradi. Manzilni model bermaydi — u ham
// shop_id kabi bazadan olinadi. Ya'ni yordamchi begona odamga
// yoki mijozga hech narsa yubora olmaydi.
//
// Shuning uchun bu yerda tasdiq oynasi yo'q: do'konchi o'z
// ma'lumotini o'z telefoniga yuborishdan zarar ko'rmaydi.
TOOLS.push({
  name: 'telegramga_yubor',
  action: true,
  description:
    "Tayyor ro'yxat yoki hisobotni do'konchining O'Z Telegramiga yuboradi. " +
    "Do'konchi \"telegramga yubor\", \"telegramga tashla\" desa shuni ishlat. " +
    'Matnni oldindan tayyorlab, to\'liq ko\'rinishda ber — u o\'zgartirilmasdan yuboriladi.',
  input_schema: {
    type: 'object',
    properties: {
      sarlavha: { type: 'string', description: "Qisqa sarlavha, masalan \"Srogi yaqin tovarlar\"" },
      matn: { type: 'string', description: 'Yuboriladigan to\'liq matn' },
    },
    required: ['sarlavha', 'matn'],
    additionalProperties: false,
  },
  run: async (shopId, i) => {
    const text = String(i.matn ?? '').trim();
    const title = String(i.sarlavha ?? '').trim();
    if (!text) return { yuborilmadi: 'matn bo\'sh' };
    if (text.length > 3500) return { yuborilmadi: 'matn juda uzun' };

    // Manzil BAZADAN olinadi. Model qanday kiritma yuborsa ham
    // begona chatga yozolmaydi.
    const shop = db.prepare('SELECT name, phone, telegram_user_id FROM shops WHERE id = ?').get(shopId) as any;
    const link = shop?.phone
      ? (db.prepare('SELECT chat_id FROM telegram_links WHERE phone = ?').get(shop.phone) as any)
      : null;
    const chatId = link?.chat_id ?? shop?.telegram_user_id;
    if (!chatId) {
      return {
        yuborilmadi: "Telegram ulanmagan",
        maslahat: "Do'konchiga ayting: botga /start yozib telefon raqamini ulasin, keyin xabar yubora olaman.",
      };
    }

    const { sendMessage, telegramEnabled, escapeHtml } = await import('../telegram.js');
    if (!telegramEnabled()) return { yuborilmadi: 'Telegram bot sozlanmagan' };

    const body = (title ? `<b>${escapeHtml(title)}</b>\n\n` : '') + escapeHtml(text);
    const res: any = await sendMessage(chatId, body);
    if (res?.ok === false) return { yuborilmadi: 'Telegram qabul qilmadi' };
    return { yuborildi: true, qayerga: 'Telegram' };
  },
});

/**
 * Chegirma qo'yish — yordamchining O'ZGARTIRADIGAN yagona vositasi.
 *
 * Nega bunga ruxsat berildi: do'konchi srogi o'tayotgan tovarni
 * ko'rgach darhol "50% chegirma ber" deydi. Ilovaga o'tib, har
 * tovarni qidirib, foizni yozib chiqish — o'sha paytda eng keraksiz
 * ish. Yordamchi buni bir gapda qiladi.
 *
 * Nega xavfsiz:
 *   1. Alohida ruxsat (ai_actions) — ega bermasa umuman ishlamaydi.
 *   2. QAYTARIB BO'LADI. Chegirma sotuv narxini o'zgartirmaydi —
 *      u alohida foiz bo'lib turadi. Nolga qaytarilsa eski narx
 *      o'z-o'zidan tiklanadi, hech narsa yo'qolmaydi.
 *   3. Tovarlar NOMMA-NOM ko'rsatiladi, "hammasi" degan imkoni yo'q.
 *   4. Nima o'zgargani aniq qaytariladi — model do'konchiga eski va
 *      yangi narxni ko'rsatib aytishi shart.
 *   5. Jurnalga yoziladi (stock_movements emas, alohida izoh bilan).
 */
TOOLS.push({
  name: 'chegirma_qoy',
  action: true,
  description:
    "Ko'rsatilgan tovarlarga chegirma foizini qo'yadi yoki olib tashlaydi. " +
    "Foiz 0 bo'lsa chegirma olib tashlanadi va eski narx qaytadi. " +
    "Tovar nomlarini ANIQ yoz — avval ro'yxatni o'qiydigan vositadan ol.",
  input_schema: {
    type: 'object',
    properties: {
      tovarlar: {
        type: 'array',
        items: { type: 'string' },
        description: "Tovar nomlari, aniq yozilgan. Ko'pi bilan 20 ta.",
      },
      foiz: { type: 'integer', description: '0 dan 90 gacha. 0 — chegirmani olib tashlash.' },
    },
    required: ['tovarlar', 'foiz'],
    additionalProperties: false,
  },
  run: (shopId, i) => {
    const pct = Math.min(90, Math.max(0, Math.round(Number(i.foiz) || 0)));
    const names: string[] = Array.isArray(i.tovarlar) ? i.tovarlar.slice(0, 20).map(String) : [];
    if (!names.length) return { bajarilmadi: "Tovar nomi ko'rsatilmagan" };

    const done: any[] = [];
    const missing: string[] = [];
    for (const name of names) {
      const p = db
        .prepare('SELECT id, name, sell_price, discount_percent FROM products WHERE shop_id = ? AND name = ? COLLATE NOCASE')
        .get(shopId, name.trim()) as any;
      if (!p) {
        missing.push(name);
        continue;
      }
      db.prepare('UPDATE products SET discount_percent = ? WHERE id = ?').run(pct, p.id);
      done.push({
        tovar: p.name,
        eski_foiz: p.discount_percent ?? 0,
        yangi_foiz: pct,
        narx: p.sell_price,
        chegirmali_narx: pct ? Math.round((p.sell_price * (100 - pct)) / 100 / 100) * 100 : p.sell_price,
      });
    }
    return {
      ozgardi: done,
      topilmadi: missing,
      eslatma: pct
        ? "Chegirma qaytarib olinadi: foizni 0 qilsangiz eski narx tiklanadi."
        : 'Chegirma olib tashlandi, eski narx tiklandi.',
    };
  },
});

/**
 * Nomni solishtirish uchun soddalashtirilgan shakli: kichik harf, faqat
 * harf va raqam, ortiqcha bo'shliqsiz. Apostrofning har xil belgilari
 * ham tushib qoladi — "Yog'" va "Yogʻ" bitta tovar.
 */
export const simpleName = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\u02B9-\u02BF\u2018\u2019']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Nakladnoydan o'qilgan "kod" ustunidan HAQIQIY shtrix-kodni ajratib
 * olish. Tekshiruvdan o'tmasa bo'sh satr qaytadi — u holda kod na
 * qidirishda, na saqlashda ishlatilmaydi.
 *
 * Nega bunchalik qattiq: o'sha ustunda ko'pincha shtrix-kod emas,
 * yetkazuvchining ICHKI ARTIKULI turadi (100545 kabi). U tovarga kod
 * bo'lib yozilsa ikki zarar bor:
 *   1. /products/intake uni umumiy barcode_catalog ga ham yozadi —
 *      xato kod boshqa do'konlarga ham tarqaladi;
 *   2. keyingi nakladnoyda BOSHQA tovarning artikuli o'sha raqamga
 *      to'g'ri kelsa, qoldiq begona tovarga qo'shilib ketadi.
 *
 * Shuning uchun faqat GTIN qoidasiga to'liq mos kod o'tadi: butunlay
 * raqam, uzunligi 8/12/13/14 va nazorat raqami joyida (barcodes.ts,
 * checkGtin). Skaner o'qigan haqiqiy kod bu tekshiruvdan bemalol
 * o'tadi, artikul esa deyarli hech qachon.
 */
export function cleanBarcode(raw: unknown): string {
  // Nakladnoyda kod tire, probel yoki qavs bilan yozilgan bo'lishi
  // mumkin — avval belgilardan tozalanadi, keyin tekshiriladi
  const code = normalizeBarcode(String(raw ?? '').replace(/[^0-9A-Za-z]/g, '').slice(0, 32));
  return checkGtin(code) === true ? code : '';
}

/**
 * Kod bo'yicha ombordagi tovar — ilovaning o'z qidiruvi bilan bir xil:
 * ham products.barcode, ham qo'shimcha kodlar jadvali (bitta tovarning
 * bir necha kodi bo'ladi), kodning barcha teng ko'rinishlari bo'yicha
 * (12/13/14 xonali kod — o'sha tovar).
 */
function stockByBarcode(shopId: number, code: string): any {
  const variants = barcodeVariants(code);
  if (!variants.length) return null;
  const marks = variants.map(() => '?').join(',');
  return (
    db
      .prepare(
        `SELECT p.id, p.name, p.unit, p.sell_price, p.stock FROM products p
         WHERE p.shop_id = ? AND (
           REPLACE(REPLACE(UPPER(TRIM(p.barcode)), ' ', ''), '-', '') IN (${marks})
           OR p.id IN (SELECT product_id FROM product_barcodes WHERE shop_id = ? AND barcode IN (${marks}))
         ) LIMIT 1`
      )
      .get(shopId, ...variants, shopId, ...variants) ?? null
  );
}

/**
 * Rasmdan o'qilgan kirimni TAKLIF qilish.
 *
 * DIQQAT: bu vosita omborga hech narsa yozmaydi. U faqat ro'yxatni
 * saqlaydi va do'konchiga ko'rsatadi. Haqiqiy kirim do'konchi
 * "Tasdiqlash" tugmasini bosgandan keyin, ilovaning o'z kirim
 * yo'li orqali bo'ladi.
 *
 * Nega shunday: qo'lyozmani noto'g'ri o'qish oson — "15" ni "16",
 * "kg" ni "dona" deb. Xato kirim esa qoldiqni ham, foydani ham,
 * buyurtma taklifini ham buzadi va uni orqaga qaytarish qiyin.
 * Chegirmadan farqli, bu qaytarib bo'lmaydigan ish.
 */
TOOLS.push({
  name: 'kirim_taklif',
  action: true,
  description:
    "Rasmdan yoki matndan o'qilgan tovarlar ro'yxatini KIRIM TAKLIFI sifatida saqlaydi. " +
    "Omborga yozmaydi — do'konchi tasdiqlashi kerak. " +
    "Har tovarga nom va miqdor SHART. Narx yoki birlik noaniq bo'lsa bo'sh qoldir " +
    "va javobingda do'konchidan so'ra. " +
    "Nakladnoyda kod (shtrix-kod yoki artikul) ustuni bo'lsa uni ham o'qi — " +
    "tovar omborda bor-yo'qligi eng ishonchli shu kod bo'yicha aniqlanadi.",
  input_schema: {
    type: 'object',
    properties: {
      tovarlar: {
        type: 'array',
        description: "Ko'pi bilan 40 ta qator",
        items: {
          type: 'object',
          properties: {
            nom: { type: 'string' },
            miqdor: { type: 'number' },
            birlik: { type: 'string', description: 'dona, kg, litr, quti — bilmasang bo\'sh satr' },
            kirim_narxi: { type: 'number', description: "bir birlik uchun. Bilmasang 0" },
            sotuv_narxi: { type: 'number', description: "bir birlik uchun. Bilmasang 0" },
            srok: { type: 'string', description: 'YYYY-MM-DD yoki bo\'sh satr' },
            shtrix_kod: { type: 'string', description: "nakladnoydagi shtrix-kod yoki artikul raqami, bo'lmasa bo'sh satr" },
          },
          required: ['nom', 'miqdor', 'birlik', 'kirim_narxi', 'sotuv_narxi', 'srok', 'shtrix_kod'],
          additionalProperties: false,
        },
      },
    },
    required: ['tovarlar'],
    additionalProperties: false,
  },
  run: (shopId, i) => {
    const rows = Array.isArray(i.tovarlar) ? i.tovarlar.slice(0, 40) : [];
    const items = rows
      .map((r: any) => ({
        nom: String(r?.nom ?? '').trim().slice(0, 120),
        miqdor: Number(r?.miqdor) || 0,
        birlik: String(r?.birlik ?? '').trim().slice(0, 20),
        kirim_narxi: Math.max(0, Math.round(Number(r?.kirim_narxi) || 0)),
        sotuv_narxi: Math.max(0, Math.round(Number(r?.sotuv_narxi) || 0)),
        srok: /^\d{4}-\d{2}-\d{2}$/.test(String(r?.srok ?? '')) ? String(r.srok) : '',
        // Kod ISHLATILISHDAN OLDIN tekshiriladi: "kod" ustunida
        // ko'pincha shtrix-kod emas, artikul turadi (cleanBarcode ga
        // qara). O'tmasa qator kodsiz qoladi va tovar nomi bo'yicha
        // qidiriladi — xato kod bilan begona tovarga tushgandan ko'ra
        // shunisi xavfsiz.
        shtrix_kod: cleanBarcode(r?.shtrix_kod),
      }))
      .filter((r: any) => r.nom && r.miqdor > 0);

    if (!items.length) return { bajarilmadi: "Ro'yxat bo'sh yoki nom/miqdor o'qilmadi" };

    // Soddalashtirilgan nomlar jadvali bir marta yig'iladi: har qator
    // uchun butun omborni qayta o'qib chiqmaslik uchun.
    const bySimple = new Map<string, any>();
    for (const p of db
      .prepare('SELECT id, name, unit, sell_price, stock FROM products WHERE shop_id = ?')
      .all(shopId) as any[]) {
      const key = simpleName(p.name);
      if (!key) continue;
      // Ikki tovar bir xil soddalashsa — ikkalasi ham tashlab
      // yuboriladi. Noto'g'ri tovarning qoldig'ini oshirgandan ko'ra
      // "yangi" deb ko'rsatgan zararsiz.
      bySimple.set(key, bySimple.has(key) ? null : p);
    }

    // Ombordagi mosini topamiz — do'konchi qaysi qator yangi, qaysi
    // biri allaqachon bor ekanini ko'rib tursin
    const known = items.map((r: any) => {
      const p =
        (r.shtrix_kod ? stockByBarcode(shopId, r.shtrix_kod) : null) ??
        (db
          .prepare('SELECT id, name, unit, sell_price, stock FROM products WHERE shop_id = ? AND name = ? COLLATE NOCASE')
          .get(shopId, r.nom) as any) ??
        bySimple.get(simpleName(r.nom)) ??
        null;
      return {
        ...r,
        // Nakladnoyda sotuv narxi ko'pincha yozilmaydi, ombordagi
        // tovarda esa turibdi — do'konchi uni qo'lda qayta yozib
        // o'tirmasin. Kirim narxiga bu tegishli emas: u har partiyada
        // o'zgaradi va faqat nakladnoydan olinadi.
        sotuv_narxi: r.sotuv_narxi || (p?.sell_price ?? 0),
        // Narx nakladnoydan emas, OMBORDAN olinganini belgilab
        // qo'yamiz. Tasdiqlash shu belgiga qarab ish tutadi: do'konchi
        // qo'l tegizmagan narxni ombor tomon qaytarib yozmaydi — taklif
        // ertaga tasdiqlansa, ombordagi narx bu orada o'zgargan bo'lishi
        // mumkin va eski narx uni bosib ketardi.
        sotuv_narxi_ombordan: !r.sotuv_narxi && !!p?.sell_price,
        omborda_bor: !!p,
        mavjud_id: p?.id ?? null,
        // Ombordagi tovarning O'Z nomi. Moslik kod yoki soddalashtirilgan
        // nom bo'yicha topilganda u nakladnoydagidan boshqacha bo'ladi —
        // do'konchi kartada aynan qaysi tovarga tushayotganini ko'rib,
        // noto'g'ri mosligni tuta olsin. Nomsiz uni tekshirishning iloji
        // yo'q, xato moslik esa begona tovarning qoldig'ini oshiradi.
        eski_nom: p?.name ?? null,
        eski_birlik: p?.unit ?? null,
        eski_sotuv_narxi: p?.sell_price ?? null,
        eski_qoldiq: p?.stock ?? null,
      };
    });

    // Belgilari bilan birga saqlanadi: do'konchi kartadan chiqib qayta
    // kirsa (GET /ai/intake/pending) karta o'sha ko'rinishda qaytadi.
    const info = db
      .prepare("INSERT INTO ai_intake_drafts (shop_id, items) VALUES (?, ?)")
      .run(shopId, JSON.stringify(known));

    return {
      taklif_id: Number(info.lastInsertRowid),
      tovarlar: known,
      eslatma:
        "Ro'yxat SAQLANDI, lekin omborga hali tushmadi. Do'konchi ekranda " +
        "ko'rib 'Tasdiqlash' tugmasini bossa kirim bo'ladi. Javobingda shuni ayt.",
    };
  },
});

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Ma'lumotni o'zgartiradigan vositalar — alohida ruxsat talab qiladi */
export const ACTION_TOOLS = new Set(
  TOOLS.filter((t) => t.action && t.name !== 'telegramga_yubor').map((t) => t.name)
);

/**
 * Modelga yuboriladigan e'lon (run funksiyasisiz).
 *
 * Ruxsati yo'q bo'lsa o'zgartiradigan vosita modelga UMUMAN
 * ko'rsatilmaydi. "Ko'rsatib, keyin rad etish" emas — model bunday
 * imkoniyat borligini bilmasligi kerak, aks holda do'konchiga
 * "qila olaman" deb va'da berib, keyin uddasidan chiqmasdi.
 */
export function toolSchemas(opts?: { actions?: boolean }) {
  const allow = opts?.actions !== false;
  return TOOLS.filter((t) => allow || !ACTION_TOOLS.has(t.name)).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
    strict: true as const,
  }));
}
