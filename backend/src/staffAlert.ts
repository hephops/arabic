// Xodim kirganda do'kon egasiga Telegram'ga xabar.
//
// Do'konchi doim do'konda bo'lmaydi. Smena qachon boshlangani, kim
// kirgani va tunda kimdir kirgan-kirmagani — u bilishi kerak bo'lgan
// narsa. Shuning uchun har kirish yozib boriladi va egasiga xabar
// beriladi.
//
// Xabar takrorlanmasligi uchun: bitta xodim yaqin orada qayta kirsa
// (ilovani yopib-ochsa, telefoni o'chib qolsa) — ikkinchi marta xabar
// ketmaydi. Egasiga kerak bo'lgani "smena boshlandi", "sahifa qayta
// yuklandi" emas.

import { db } from './db.js';
import { sendMessage, telegramEnabled } from './telegram.js';
import { bt, normalizeLang } from './botText.js';
import { uzDate } from './tz.js';

/** Shu vaqt ichida qayta kirsa — yangi xabar ketmaydi */
const QUIET_MINUTES = 30;

/** "14:35" — Toshkent vaqti */
function uzTime(at: Date = new Date()): string {
  const d = uzDate(at);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Kirishni yozib qo'yish va (kerak bo'lsa) egasiga xabar berish.
 *
 * Xabar yuborish kirishni sekinlashtirmasligi kerak — shuning uchun
 * chaqiruvchi buni kutmasa ham bo'ladi.
 */
export async function noteEmployeeLogin(shop: any, emp: { id: number; name: string }): Promise<boolean> {
  const recent = db
    .prepare(
      `SELECT id FROM employee_logins
       WHERE shop_id = ? AND employee_id = ? AND notified = 1
         AND created_at > datetime('now', ?)
       LIMIT 1`
    )
    .get(shop.id, emp.id, `-${QUIET_MINUTES} minutes`) as any;

  const notify = !recent && shop.staff_notify !== 0 && telegramEnabled() && !!shop.telegram_user_id;

  db.prepare(
    'INSERT INTO employee_logins (shop_id, employee_id, employee_name, notified) VALUES (?, ?, ?, ?)'
  ).run(shop.id, emp.id, emp.name, notify ? 1 : 0);
  if (!notify) return false;

  const lang = normalizeLang(shop.language);
  const res: any = await sendMessage(
    shop.telegram_user_id,
    bt(lang, 'staffIn', {
      name: escapeHtml(emp.name),
      time: uzTime(),
      shop: escapeHtml(shop.name ?? ''),
    })
  );
  return !!res?.ok;
}

/**
 * PIN-kod ketma-ket noto'g'ri terilganda ogohlantirish.
 *
 * Bu kamdan-kam bo'ladi, shuning uchun har safar yuborilaveradi:
 * kimdir PIN tanlab ko'rayotgan bo'lsa — egasi darhol bilishi kerak.
 */
export async function notifyPinAttempts(shop: any, attempts: number): Promise<boolean> {
  if (!telegramEnabled() || !shop?.telegram_user_id) return false;
  const lang = normalizeLang(shop.language);
  const res: any = await sendMessage(
    shop.telegram_user_id,
    bt(lang, 'staffPinWarn', { shop: escapeHtml(shop.name ?? ''), n: attempts })
  );
  return !!res?.ok;
}

/** Oxirgi kirishlar — "Xodimlar" ekranida ko'rinadi */
export function recentLogins(shopId: number, limit = 30) {
  return db
    .prepare(
      `SELECT l.id, l.employee_id, l.created_at,
              COALESCE(l.employee_name, e.name) AS employee_name
       FROM employee_logins l
       LEFT JOIN employees e ON e.id = l.employee_id
       WHERE l.shop_id = ?
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(shopId, limit);
}
