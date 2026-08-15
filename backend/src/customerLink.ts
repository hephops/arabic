import { createHmac, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

// Mijozni o'z Telegram'iga ulash.
//
// Do'konchi mijozga havola beradi (yoki QR ko'rsatadi), mijoz uni bosadi
// va bot uni shu do'kondagi o'z yozuviga bog'laydi. Shundan keyin chek
// va xarid tarixi mijozning o'ziga boradi.
//
// Havoladagi kod imzolangan: mijoz raqamini o'zgartirib boshqa odamning
// xaridlarini ko'rib bo'lmaydi. Kod eskirmaydi — do'konchi bir marta
// bergan havola keyin ham ishlayveradi; kerak bo'lsa ulanishni uzadi.

const SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod';

/** Mijoz uchun imzolangan kod: "<id>.<imzo>" */
export function customerCode(customerId: number): string {
  const sig = createHmac('sha256', SECRET).update(`customer:${customerId}`).digest('hex').slice(0, 12);
  return `${customerId}.${sig}`;
}

/** Kodni tekshirib mijoz id sini qaytaradi (yaroqsiz bo'lsa null) */
export function verifyCustomerCode(code: string): number | null {
  const [idPart, sig] = (code ?? '').split('.');
  const id = Number(idPart);
  if (!Number.isInteger(id) || id <= 0 || !sig) return null;
  const expected = createHmac('sha256', SECRET).update(`customer:${id}`).digest('hex').slice(0, 12);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

const money = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n)).replace(/ /g, ' ');

/** Mijozning ochiq qarzi */
export function customerBalance(customerId: number): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(amount - paid_amount), 0) AS s FROM debts WHERE customer_id = ? AND status != 'paid'`)
    .get(customerId) as any;
  return Number(row.s);
}

/** "Xaridlarim" — oxirgi xaridlar va shu oydagi jami */
export function purchasesText(customerId: number): string {
  const customer = db.prepare('SELECT name, shop_id FROM customers WHERE id = ?').get(customerId) as any;
  if (!customer) return 'Ma\'lumot topilmadi.';
  const shop = db.prepare('SELECT name FROM shops WHERE id = ?').get(customer.shop_id) as any;

  const sales = db
    .prepare(
      `SELECT s.id, s.total, s.created_at, s.payment_type,
              (SELECT GROUP_CONCAT(p.name || ' ×' || CAST(si.qty AS INTEGER), ', ')
               FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS items
       FROM sales s WHERE s.customer_id = ? ORDER BY s.created_at DESC LIMIT 10`
    )
    .all(customerId) as any[];

  const month = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS s, COUNT(*) AS c FROM sales
       WHERE customer_id = ? AND date(created_at, '+5 hours') >= date('now', '+5 hours', 'start of month')`
    )
    .get(customerId) as any;

  const lines = [`<b>${escapeHtml(shop?.name ?? '')}</b> — xaridlaringiz`, ''];
  if (sales.length === 0) {
    lines.push('Hozircha xarid yozuvi yo\'q.');
  } else {
    for (const s of sales) {
      const when = String(s.created_at).slice(5, 16).replace('T', ' ');
      lines.push(`${when} — <b>${money(s.total)} so'm</b>${s.payment_type === 'debt' ? ' (qarzga)' : ''}`);
      if (s.items) lines.push(`   ${escapeHtml(String(s.items))}`);
    }
    lines.push('');
    lines.push(`📊 Bu oyda: <b>${money(month.s)} so'm</b> (${month.c} ta xarid)`);
  }

  const balance = customerBalance(customerId);
  if (balance > 0) {
    lines.push('');
    lines.push(`📒 Qarzingiz: <b>${money(balance)} so'm</b>`);
  }
  return lines.join('\n');
}

/** Bitta sotuvning cheki — mijozga yuboriladigan matn */
export function receiptText(saleId: number): string | null {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as any;
  if (!sale) return null;
  const shop = db.prepare('SELECT name, phone FROM shops WHERE id = ?').get(sale.shop_id) as any;
  const items = db
    .prepare(
      `SELECT p.name, si.qty, si.price FROM sale_items si JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ?`
    )
    .all(saleId) as any[];

  const lines = [`🧾 <b>${escapeHtml(shop?.name ?? '')}</b>`, `Chek #${sale.id} · ${String(sale.created_at).slice(0, 16).replace('T', ' ')}`, ''];
  for (const i of items) {
    lines.push(`${escapeHtml(i.name)} ×${trimNum(i.qty)} — ${money(i.price * i.qty)}`);
  }
  lines.push('');
  lines.push(`Jami: <b>${money(sale.total)} so'm</b>`);
  if (sale.payment_type === 'debt') {
    lines.push('To\'lov: qarzga');
    const balance = customerBalance(sale.customer_id);
    if (balance > 0) lines.push(`Umumiy qarzingiz: <b>${money(balance)} so'm</b>`);
  }
  if (shop?.phone) lines.push(`\n☎️ ${shop.phone}`);
  return lines.join('\n');
}

function trimNum(n: number): string {
  return String(Math.round(Number(n) * 100) / 100);
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
