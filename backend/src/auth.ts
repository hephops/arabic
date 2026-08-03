import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

// Ikki xil token:
//   egasi:  <shopId>.<exp>.<sig>
//   xodim:  e.<shopId>.<employeeId>.<exp>.<sig>
// Xodim tokeni bilan faqat sotuv va qarz yozish mumkin — narx, o'chirish
// va hisobotlar egasida qoladi (requireOwner).

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
  }
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
