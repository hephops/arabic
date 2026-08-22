// Targ'ovchi xodimlar (agentlar) va to'lov cheklari.
//
// Ish oqimi shunday:
//   1. Xodim do'konni ko'ndiradi va uni dasturga ro'yxatdan o'tkazadi.
//   2. Do'konchi pulni kartaga o'tkazadi va CHEKNI ilovadan yuboradi —
//      o'sha yerda xodimning telefon raqamini ham yozadi.
//   3. Admin panelda chek ko'rinadi. Tasdiqlansa: pul balansga tushadi
//      va do'kon o'sha xodimga BIRIKTIRILADI.
//   4. Har biriktirilgan do'kon uchun xodimga mukofot yoziladi
//      (sozlamadagi agent_bonus, odatda 100 000 so'm).
//
// Mukofot summasi do'kon yozuviga saqlanadi (shops.agent_bonus): umumiy
// narx keyin o'zgarsa, allaqachon ulangan do'konlarning hisobi buzilmasin.

import { db } from './db.js';
import { getSetting } from './billing.js';

/** Raqamlarni solishtirish uchun bir ko'rinishga keltirish.
 *
 *  Do'konchi "+998 90 123 45 67" deb ham, "901234567" deb ham yozadi —
 *  ikkovi ham bitta xodimni topishi kerak. Oxirgi 9 raqam olinadi:
 *  O'zbekistonda shu qism yagona. */
export function phoneKey(raw: string | null | undefined): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

/** Telefon bo'yicha faol targ'ovchi xodimni topish */
export function agentByPhone(phone: string): { id: number; name: string; username: string } | null {
  const key = phoneKey(phone);
  if (key.length < 9) return null;
  const rows = db
    .prepare("SELECT id, name, username, phone FROM admins WHERE role = 'agent' AND is_active = 1")
    .all() as any[];
  const hit = rows.find((a) => phoneKey(a.phone) === key);
  return hit ? { id: Number(hit.id), name: String(hit.name ?? ''), username: String(hit.username) } : null;
}

/** Sozlamadagi mukofot (bitta do'kon uchun) */
export function agentBonus(): number {
  const n = Math.round(Number(getSetting('agent_bonus', '100000')));
  return Number.isFinite(n) && n >= 0 ? n : 100000;
}

/**
 * Do'konni xodimga biriktirish.
 *
 * Bir do'kon FAQAT BIR MARTA hisoblanadi: agar allaqachon biriktirilgan
 * bo'lsa, tegilmaydi. Aks holda do'konchi har chek yuborganda xodimga
 * yana 100 mingdan yozilaverardi.
 */
export function linkAgent(shopId: number, agentId: number, bonus?: number): boolean {
  const shop = db.prepare('SELECT id, agent_id FROM shops WHERE id = ?').get(shopId) as any;
  if (!shop || shop.agent_id) return false;
  db.prepare("UPDATE shops SET agent_id = ?, agent_bonus = ?, agent_linked_at = datetime('now') WHERE id = ?").run(
    agentId,
    bonus ?? agentBonus(),
    shopId
  );
  return true;
}

/** Bitta xodimning hisobi: nechta do'kon, qancha ishlagan, qancha olgan */
export function agentStats(agentId: number) {
  const w = db
    .prepare(
      `SELECT COUNT(*) AS shops, COALESCE(SUM(COALESCE(agent_bonus, 0)), 0) AS earned
       FROM shops WHERE agent_id = ?`
    )
    .get(agentId) as any;
  const p = db
    .prepare('SELECT COALESCE(SUM(amount), 0) AS paid FROM agent_payouts WHERE agent_id = ?')
    .get(agentId) as any;
  const shops = Number(w?.shops ?? 0);
  const earned = Number(w?.earned ?? 0);
  const paid = Number(p?.paid ?? 0);
  return { shops, earned, paid, left: earned - paid };
}

