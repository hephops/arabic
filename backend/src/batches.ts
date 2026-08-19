// Partiyalar — bitta tovarning har safar kelgan to'plami.
//
// Do'konchi Coca-Cola'ni ikki marta oladi: birinchisi 12-avgustda,
// srogi dekabrgacha; ikkinchisi 19-avgustda, srogi martgacha. Omborda
// ular bitta tovar bo'lib ko'rinadi, lekin SANASI ham, SROGI ham
// boshqa. Ilgari tovarda bitta `expiry_date` bor edi va yangi kirim
// eskisining srogini o'chirib yuborardi — eski partiya sezilmay
// muddati o'tib ketardi.
//
// Sotuvda eng erta tugaydigan partiyadan yechiladi (FIFO): do'konchi
// ham javonga birinchi bo'lib eskisini qo'yadi.

import { db } from './db.js';

export interface Batch {
  id: number;
  product_id: number;
  qty: number;
  qty_left: number;
  cost_price: number;
  expiry_date: string | null;
  created_at: string;
}

/**
 * Yechish tartibi: avval srogi bor partiyalar (eng erta tugaydigani
 * birinchi), keyin srogsizlar — kelgan tartibida.
 */
const FIFO_ORDER = `ORDER BY CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END, expiry_date, id`;

/** Yangi kirim — har safar alohida partiya bo'lib yoziladi */
export function addBatch(
  shopId: number,
  productId: number,
  qty: number,
  costPrice: number,
  expiryDate: string | null,
  createdBy: number | null
): number {
  const info = db
    .prepare(
      `INSERT INTO product_batches (shop_id, product_id, qty, qty_left, cost_price, expiry_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(shopId, productId, qty, qty, Math.round(costPrice) || 0, expiryDate || null, createdBy);
  syncProduct(productId);
  return Number(info.lastInsertRowid);
}

/** Sotildi — eng erta tugaydigan partiyadan yechamiz */
export function consume(productId: number, qty: number): void {
  let left = qty;
  const rows = db
    .prepare(`SELECT id, qty_left FROM product_batches WHERE product_id = ? AND qty_left > 0 ${FIFO_ORDER}`)
    .all(productId) as any[];
  const take = db.prepare('UPDATE product_batches SET qty_left = qty_left - ? WHERE id = ?');
  for (const b of rows) {
    if (left <= 0) break;
    const n = Math.min(left, b.qty_left);
    take.run(n, b.id);
    left -= n;
  }
  // left > 0 bo'lsa — qoldiqdan ko'p sotilgan (do'kon shunga ruxsat
  // bergan). Partiyalar minusga tushmaydi, tovar qoldig'i o'zi minus
  // ko'rsatadi.
  syncProduct(productId);
}

/** Qaytarish — yechilgan partiyalarga o'sha tartibda qaytariladi */
export function restore(productId: number, qty: number): void {
  let left = qty;
  const rows = db
    .prepare(`SELECT id, qty, qty_left FROM product_batches WHERE product_id = ? AND qty_left < qty ${FIFO_ORDER}`)
    .all(productId) as any[];
  const give = db.prepare('UPDATE product_batches SET qty_left = qty_left + ? WHERE id = ?');
  for (const b of rows) {
    if (left <= 0) break;
    const n = Math.min(left, b.qty - b.qty_left);
    give.run(n, b.id);
    left -= n;
  }
  if (left > 0) {
    // Hamma partiya to'la yoki tovar partiyasiz kelgan — qolganini
    // srogsiz partiya qilib yozamiz, aks holda qoldiq yo'qolardi
    const shop = db.prepare('SELECT shop_id FROM products WHERE id = ?').get(productId) as any;
    if (shop) addBatch(shop.shop_id, productId, left, 0, null, null);
  }
  syncProduct(productId);
}

/**
 * Inventarizatsiya — haqiqiy qoldiq kiritildi.
 * Kamaysa FIFO bo'yicha yechiladi, ko'paysa srogsiz partiya qo'shiladi.
 */
export function setTotal(shopId: number, productId: number, actual: number): void {
  const cur = totalLeft(productId);
  const diff = actual - cur;
  if (diff === 0) return;
  if (diff < 0) consume(productId, -diff);
  else addBatch(shopId, productId, diff, 0, null, null);
}

export function totalLeft(productId: number): number {
  const r = db
    .prepare('SELECT COALESCE(SUM(qty_left), 0) AS s FROM product_batches WHERE product_id = ?')
    .get(productId) as any;
  return Number(r?.s ?? 0);
}

/**
 * Tovarning `expiry_date` ustunini partiyalardan qayta hisoblaydi.
 *
 * U yerda ENG ERTA tugaydigan ochiq partiyaning srogi turadi — bosh
 * ekrandagi "srogi yaqin" ogohlantirishi va chegirma shu ustunga
 * qaraydi, shuning uchun eng xavflisi ko'rinishi kerak.
 */
export function syncProduct(productId: number): void {
  const r = db
    .prepare(
      `SELECT MIN(expiry_date) AS soonest FROM product_batches
       WHERE product_id = ? AND qty_left > 0 AND expiry_date IS NOT NULL`
    )
    .get(productId) as any;
  db.prepare('UPDATE products SET expiry_date = ? WHERE id = ?').run(r?.soonest ?? null, productId);
}

/** Ombordagi tovar kartochkasi uchun: ochiq partiyalar, eng eskisi tepada */
export function batchesOf(shopId: number, productId: number): Batch[] {
  return db
    .prepare(
      `SELECT id, product_id, qty, qty_left, cost_price, expiry_date, created_at
       FROM product_batches
       WHERE shop_id = ? AND product_id = ? AND qty_left > 0
       ${FIFO_ORDER}`
    )
    .all(shopId, productId) as Batch[];
}
