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

export interface ToolDef {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: false;
  };
  /** shopId serverda qo'yiladi — modeldan kelmaydi */
  run: (shopId: number, input: any) => unknown;
}

/** Uzbekistan vaqti bilan kun boshlanishi (UTC'da saqlanadi) */
const dayExpr = "date('now', '+5 hours')";

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
};

/** Davr nomini SQL sanasiga aylantirish */
function periodFrom(period: string): string {
  if (period === 'hafta') return "date('now', '+5 hours', '-6 days')";
  if (period === 'oy') return "date('now', '+5 hours', '-29 days')";
  return dayExpr;
}

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
    run: (shopId, i) => {
      const limit = num(i.limit, 20, 1, 50);
      const where =
        i.filtr === 'kam_qolgan'
          ? 'AND p.stock <= COALESCE(p.low_stock_threshold, 5) AND p.stock > 0'
          : i.filtr === 'tugagan'
            ? 'AND p.stock <= 0'
            : '';
      return db
        .prepare(
          `SELECT p.name AS tovar, p.stock AS qoldiq, p.unit AS birlik,
                  p.sell_price AS narx, p.cost_price AS kirim_narxi,
                  p.category AS kategoriya
           FROM products p WHERE p.shop_id = ? ${where}
           ORDER BY p.stock ASC LIMIT ?`
        )
        .all(shopId, limit);
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
    run: (shopId, i) => {
      const days = num(i.kunlar, 14, 1, 90);
      return db
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
        .all(shopId, days);
    },
  },
  {
    name: 'savdo_hisoboti',
    description: "Savdo, foyda va cheklar. davr: 'kun', 'hafta' yoki 'oy'.",
    input_schema: {
      type: 'object',
      properties: { davr: { type: 'string', enum: ['kun', 'hafta', 'oy'] } },
      required: ['davr'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const from = periodFrom(String(i.davr));
      const sales = db
        .prepare(
          `SELECT COUNT(*) AS chek_soni, COALESCE(SUM(total), 0) AS savdo
           FROM sales WHERE shop_id = ? AND date(created_at, '+5 hours') >= ${from}`
        )
        .get(shopId) as any;
      const profit = db
        .prepare(
          `SELECT COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS foyda
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
           WHERE s.shop_id = ? AND date(s.created_at, '+5 hours') >= ${from}`
        )
        .get(shopId) as any;
      const rets = db
        .prepare(
          `SELECT COALESCE(SUM(total), 0) AS qaytarilgan FROM returns
           WHERE shop_id = ? AND date(created_at, '+5 hours') >= ${from}`
        )
        .get(shopId) as any;
      const byPay = db
        .prepare(
          `SELECT payment_type AS tolov_turi, COUNT(*) AS soni, COALESCE(SUM(total), 0) AS summa
           FROM sales WHERE shop_id = ? AND date(created_at, '+5 hours') >= ${from}
           GROUP BY payment_type`
        )
        .all(shopId);
      const avg = sales.chek_soni ? Math.round(sales.savdo / sales.chek_soni) : 0;
      return {
        davr: i.davr,
        savdo: sales.savdo,
        foyda: profit.foyda,
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
        davr: { type: 'string', enum: ['kun', 'hafta', 'oy'] },
        tartib: { type: 'string', enum: ['savdo', 'foyda', 'miqdor'] },
        limit: { type: 'integer', description: '1 dan 20 gacha' },
      },
      required: ['davr', 'tartib', 'limit'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const from = periodFrom(String(i.davr));
      const order =
        i.tartib === 'foyda' ? 'foyda' : i.tartib === 'miqdor' ? 'miqdor' : 'savdo';
      return db
        .prepare(
          `SELECT p.name AS tovar, p.unit AS birlik,
                  COALESCE(SUM(si.qty), 0) AS miqdor,
                  CAST(COALESCE(SUM(si.price * si.qty), 0) AS INTEGER) AS savdo,
                  CAST(COALESCE(SUM((si.price - p.cost_price) * si.qty), 0) AS INTEGER) AS foyda
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
           WHERE s.shop_id = ? AND date(s.created_at, '+5 hours') >= ${from}
           GROUP BY p.id ORDER BY ${order} DESC LIMIT ?`
        )
        .all(shopId, num(i.limit, 10, 1, 20));
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
    run: (shopId, i) => {
      const days = num(i.kunlar, 30, 7, 180);
      return db
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
        .all(shopId, days);
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
    description: 'Xarajatlar kategoriya bo\'yicha.',
    input_schema: {
      type: 'object',
      properties: { davr: { type: 'string', enum: ['kun', 'hafta', 'oy'] } },
      required: ['davr'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const from = periodFrom(String(i.davr));
      return db
        .prepare(
          `SELECT COALESCE(category, 'boshqa') AS kategoriya,
                  COUNT(*) AS soni, SUM(amount) AS summa
           FROM expenses WHERE shop_id = ? AND date(spent_at, '+5 hours') >= ${from}
           GROUP BY category ORDER BY summa DESC`
        )
        .all(shopId);
    },
  },
  {
    name: 'xodim_samaradorligi',
    description: "Xodimlar bo'yicha savdo va qaytarishlar.",
    input_schema: {
      type: 'object',
      properties: { davr: { type: 'string', enum: ['kun', 'hafta', 'oy'] } },
      required: ['davr'],
      additionalProperties: false,
    },
    run: (shopId, i) => {
      const from = periodFrom(String(i.davr));
      return db
        .prepare(
          `SELECT COALESCE(e.name, 'Do''kon egasi') AS xodim,
                  COUNT(*) AS chek_soni, SUM(s.total) AS savdo
           FROM sales s LEFT JOIN employees e ON e.id = s.created_by
           WHERE s.shop_id = ? AND date(s.created_at, '+5 hours') >= ${from}
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

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Modelga yuboriladigan e'lon (run funksiyasisiz) */
export function toolSchemas() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
    strict: true as const,
  }));
}
