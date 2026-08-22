import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { db } from './db.js';
import { parsePerms, type PermKey } from './perms.js';

const SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

// Ikki xil token:
//   egasi:  <shopId>.<exp>.<sig>
//   xodim:  e.<shopId>.<employeeId>.<exp>.<sig>
// Xodim nima qila olishi uning shaxsiy ruxsatlari bilan belgilanadi
// (perms.ts). Balans, xodimlar ro'yxati va taklif kodi esa hech qachon
// berilmaydi — ular faqat egada (requireOwner).

export function signToken(shopId: number, employeeId?: number): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = employeeId ? `e.${shopId}.${employeeId}.${exp}` : `${shopId}.${exp}`;
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

function sigOk(body: string, sig: string): boolean {
  const expected = createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyToken(token: string): { shopId: number; employeeId: number | null } | null {
  const parts = token.split('.');

  if (parts.length === 3) {
    const [shopId, exp, sig] = parts;
    if (!sigOk(`${shopId}.${exp}`, sig)) return null;
    if (Number(exp) < Date.now()) return null;
    return { shopId: Number(shopId), employeeId: null };
  }

  if (parts.length === 5 && parts[0] === 'e') {
    const [, shopId, empId, exp, sig] = parts;
    if (!sigOk(`e.${shopId}.${empId}.${exp}`, sig)) return null;
    if (Number(exp) < Date.now()) return null;
    return { shopId: Number(shopId), employeeId: Number(empId) };
  }

  return null;
}

declare module 'fastify' {
  interface FastifyRequest {
    shopId: number;
    employeeId: number | null;
    /** Xodim sessiyasida — uning ruxsatlari. Ega uchun null (hammasi mumkin) */
    perms: PermKey[] | null;
  }
}

/**
 * Ruxsatlarni bazadan olish.
 *
 * Har so'rovda o'qiladi, tokenga yozilmaydi: ega ruxsatni olib
 * qo'yganda xodim keyingi bosishdayoq to'xtashi kerak. Tokenga yozilsa
 * u 30 kun davomida eski huquq bilan yuraverardi.
 */
/**
 * Xodimda shu ruxsat bormi — so'rov (req) siz.
 *
 * AI yordamchisi uchun kerak: u vositalarni o'zi chaqiradi va oddiy
 * yo'l tekshiruvidan o'tmaydi. Ilgari shu sabab "foyda qancha?" degan
 * savolga kirim narxini ko'rish huquqi yo'q xodim ham javob olardi.
 *
 * employeeId bo'lmasa — do'kon egasi, hamma narsa ochiq.
 */
export function employeeCan(employeeId: number | null | undefined, key: PermKey): boolean {
  if (!employeeId) return true;
  return (loadPerms(employeeId) ?? []).includes(key);
}

function loadPerms(employeeId: number): PermKey[] | null {
  const row = db.prepare('SELECT permissions, is_active FROM employees WHERE id = ?').get(employeeId) as any;
  if (!row || !row.is_active) return [];
  return parsePerms(row.permissions);
}

/** Shu so'rov uchun ruxsat bormi (ega uchun doim ha) */
export function can(req: FastifyRequest, key: PermKey): boolean {
  if (!req.employeeId) return true;
  return (req.perms ?? []).includes(key);
}

/**
 * Ruxsat talab qiladigan yo'l uchun tekshiruv.
 * Ega uchun hamma yo'l ochiq, xodim uchun faqat berilgani.
 */
export function requirePerm(key: PermKey) {
  return async function check(req: FastifyRequest, reply: FastifyReply) {
    const res = await requireAuth(req, reply);
    if (res) return res;
    if (!can(req, key)) {
      reply.code(403).send({ error: 'no_permission', permission: key });
      return reply;
    }
  };
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const session = token ? verifyToken(token) : null;
  if (!session) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  req.shopId = session.shopId;
  req.employeeId = session.employeeId;

  // Do'kon bloklangan bo'lsa — tokeni bo'lsa ham ishlamaydi.
  //
  // Ilgari is_blocked FAQAT kirish paytida tekshirilardi (/auth/verify
  // va /auth/employee). Token esa 30 kun amal qiladi: admin panelda
  // "Bloklash" bosilgandan keyin ham ilovasi ochiq turgan do'konchi
  // sotuvni davom ettiraverardi, qarz yozardi, tovar qo'shardi — blok
  // faqat u chiqib qayta kirganda sezilardi.
  const shop = db.prepare('SELECT is_blocked, blocked_reason FROM shops WHERE id = ?').get(session.shopId) as any;
  if (!shop) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  if (shop.is_blocked) {
    reply.code(403).send({ error: 'blocked', reason: shop.blocked_reason ?? null });
    return reply;
  }

  req.perms = session.employeeId ? loadPerms(session.employeeId) : null;
  // Ega xodimni bloklagan bo'lsa — tokeni bo'lsa ham kirmaydi
  if (session.employeeId && req.perms!.length === 0) {
    const alive = db.prepare('SELECT is_active FROM employees WHERE id = ?').get(session.employeeId) as any;
    if (!alive?.is_active) {
      reply.code(401).send({ error: 'employee_blocked' });
      return reply;
    }
  }
}

// Faqat do'kon egasi: narx, o'chirish, hisobot, balans, xodimlar
export async function requireOwner(req: FastifyRequest, reply: FastifyReply) {
  const res = await requireAuth(req, reply);
  if (res) return res;
  if (req.employeeId) {
    reply.code(403).send({ error: 'owner_only' });
    return reply;
  }
}
