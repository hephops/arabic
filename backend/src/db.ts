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
