import { DatabaseSync } from 'node:sqlite';
import { normalizePhone } from './phone.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '..', 'db', 'arabic.db');

const raw = new DatabaseSync(DB_PATH, { enableForeignKeyConstraints: true });
raw.exec('PRAGMA journal_mode = WAL');

// better-sqlite3 uchun yozilgan kodni o'zgartirmaslik uchun transaction() helperini qo'shamiz
function transaction<T extends (...args: any[]) => any>(fn: T) {
  return (...args: Parameters<T>): ReturnType<T> => {
    raw.exec('BEGIN');
    try {
      const result = fn(...args);
      raw.exec('COMMIT');
      return result;
    } catch (err) {
      raw.exec('ROLLBACK');
      throw err;
    }
  };
}

// better-sqlite3 kabi bo'sh (permissive) tiplash: chaqiruvchi joylarda allaqachon `as any` bilan ishlatiladi
export const db: any = Object.assign(raw, { transaction });

db.exec(readFileSync(join(__dirname, '..', 'db', 'schema.sql'), 'utf-8'));

// Yengil migratsiya: eski dev-bazalarga yangi ustunlarni qo'shish
try {
  db.exec('ALTER TABLE products ADD COLUMN image_url TEXT');
} catch {
  /* ustun allaqachon bor */
}
try {
  db.exec('ALTER TABLE shops ADD COLUMN balance INTEGER NOT NULL DEFAULT 0');
} catch {
  /* ustun allaqachon bor */
}
try {
  db.exec('ALTER TABLE shops ADD COLUMN referred_by TEXT');
} catch {
  /* ustun allaqachon bor */
}
for (const sql of [
  "ALTER TABLE customers ADD COLUMN reminder_mode TEXT NOT NULL DEFAULT 'soft'",
  "ALTER TABLE shops ADD COLUMN default_reminder_mode TEXT NOT NULL DEFAULT 'soft'",
  'ALTER TABLE reminder_logs ADD COLUMN customer_id INTEGER',
  'ALTER TABLE reminder_logs ADD COLUMN kind TEXT',
  'ALTER TABLE shops ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE shops ADD COLUMN blocked_reason TEXT',
  // Admin qo'lda kiritgan to'lovlar uchun qo'shimcha maydonlar
  'ALTER TABLE balance_transactions ADD COLUMN method TEXT',
  'ALTER TABLE balance_transactions ADD COLUMN doc_no TEXT',
  'ALTER TABLE balance_transactions ADD COLUMN payer TEXT',
  'ALTER TABLE balance_transactions ADD COLUMN admin_id INTEGER',
  'ALTER TABLE balance_transactions ADD COLUMN paid_at TEXT',
  // Sinov muddati, mijoz limiti va mahsulot kategoriyasi
  'ALTER TABLE shops ADD COLUMN trial_ends_at TEXT',
  'ALTER TABLE customers ADD COLUMN credit_limit INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE customers ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE products ADD COLUMN category TEXT',
  // Qaytarish: bitta satrdan qancha tovar qaytganini eslab qolamiz,
  // shunda bir tovarni ikki marta qaytarib bo'lmaydi
  'ALTER TABLE sale_items ADD COLUMN returned_qty REAL NOT NULL DEFAULT 0',
  // Tovar qaysi ta'minotchidan olinadi — buyurtma shu bo'yicha guruhlanadi
  'ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)',
  // Kunlik savdo maqsadi (0 — belgilanmagan) va kechki hisobot sozlamalari
  'ALTER TABLE shops ADD COLUMN daily_goal INTEGER NOT NULL DEFAULT 0',
  // Chegirma foizi (0-90) — asosan srogi yaqin tovarni tezroq sotish uchun
  'ALTER TABLE products ADD COLUMN discount_percent INTEGER NOT NULL DEFAULT 0',
  // Kechki avtomatik hisobot: yoqilganmi, qaysi soatda (O'zbekiston vaqti)
  // va oxirgi marta qaysi kuni yuborilgan (bir kunda ikki marta ketmasin)
  'ALTER TABLE shops ADD COLUMN report_enabled INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE shops ADD COLUMN report_hour INTEGER NOT NULL DEFAULT 22',
  'ALTER TABLE shops ADD COLUMN last_report_date TEXT',
  // Mijozning Telegram'i — chek va xarid tarixi shu yerga boradi
  'ALTER TABLE customers ADD COLUMN telegram_user_id INTEGER',
  // Qoldiqdan ko'p sotishga ruxsat. Odatda O'CHIQ — ombor minusga
  // tushib ketmasin. Kerak bo'lgan do'kon sozlamadan yoqadi.
  'ALTER TABLE shops ADD COLUMN allow_negative_stock INTEGER NOT NULL DEFAULT 0',
  // Tarozi raqami (PLU) — og'irlikda sotiladigan tovarlar uchun
  'ALTER TABLE products ADD COLUMN plu TEXT',
]) {
  try {
    db.exec(sql);
  } catch {
    /* ustun allaqachon bor */
  }
}

// Ustunga tayanadigan indekslar migratsiyadan KEYIN yaratiladi.
// schema.sql eng boshida ishlaydi va eski bazada hali "plu" ustuni
// bo'lmagani uchun indeksni o'sha yerda yaratib bo'lmaydi.
try {
  db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_products_plu
     ON products (shop_id, plu) WHERE plu IS NOT NULL AND plu <> ''`
  );
} catch (e) {
  console.warn('[db] tarozi raqami indeksi yaratilmadi:', e);
}

// Eski bazalarda mahsulot kodlari faqat products.barcode da edi —
// ularni yangi product_barcodes jadvaliga ko'chiramiz (bir marta).
db.exec(`
  INSERT OR IGNORE INTO product_barcodes (shop_id, product_id, barcode)
  SELECT shop_id, id, TRIM(barcode) FROM products
  WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
`);

// Eski yozuvlardagi telefon raqamlarini bitta ko'rinishga keltiramiz.
// Raqami umuman yaroqsizlarga eslatma yuborib bo'lmaydi — ularni "o'chirilgan"
// rejimga o'tkazamiz, aks holda tizim yuborgandek ko'rsatib turadi.
{
  const rows = db.prepare('SELECT id, phone, reminder_mode FROM customers').all() as any[];
  const fix = db.prepare('UPDATE customers SET phone = ? WHERE id = ?');
  const mute = db.prepare("UPDATE customers SET reminder_mode = 'off' WHERE id = ?");
  let cleaned = 0;
  let unreachable = 0;
  for (const row of rows) {
    const norm = normalizePhone(row.phone);
    if (norm && norm !== row.phone) {
      fix.run(norm, row.id);
      cleaned++;
    } else if (!norm) {
      unreachable++;
      if (row.reminder_mode !== 'off') mute.run(row.id);
    }
  }
  if (cleaned) console.log(`[db] ${cleaned} ta telefon raqami tartibga keltirildi`);
  if (unreachable) {
    console.warn(`[db] DIQQAT: ${unreachable} ta mijozning raqami yo'q yoki noto'g'ri — ularga eslatma yuborilmaydi`);
  }
}

// Kechikkan qarzlarni belgilash (har so'rovda emas, startda va cron'da chaqiriladi)
export function markOverdueDebts() {
  db.prepare(
    `UPDATE debts SET status = 'overdue'
     WHERE status = 'active' AND due_date IS NOT NULL AND due_date < date('now')
       AND paid_amount < amount`
  ).run();
  db.prepare(
    `UPDATE supplier_debts SET status = 'overdue'
     WHERE status = 'active' AND due_date IS NOT NULL AND due_date < date('now')
       AND paid_amount < amount`
  ).run();
}
