import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? join(__dirname, '..', 'db', 'arabic.db');

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
]) {
  try {
    db.exec(sql);
  } catch {
    /* ustun allaqachon bor */
  }
}

// Eski bazalarda mahsulot kodlari faqat products.barcode da edi —
// ularni yangi product_barcodes jadvaliga ko'chiramiz (bir marta).
db.exec(`
  INSERT OR IGNORE INTO product_barcodes (shop_id, product_id, barcode)
  SELECT shop_id, id, TRIM(barcode) FROM products
  WHERE barcode IS NOT NULL AND TRIM(barcode) <> ''
`);

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
