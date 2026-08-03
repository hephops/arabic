import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';

const SECRET = process.env.AUTH_SECRET ?? 'dev-secret-change-in-prod';
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 kun

export function signToken(shopId: number): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const body = `${shopId}.${exp}`;
  const sig = createHmac('sha256', SECRET).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [shopId, exp, sig] = parts;
  const body = `${shopId}.${exp}`;
  const expected = createHmac('sha256', SECRET).update(body).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Number(shopId);
}

declare module 'fastify' {
  interface FastifyRequest {
    shopId: number;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  const shopId = token ? verifyToken(token) : null;
  if (!shopId) {
    reply.code(401).send({ error: 'unauthorized' });
    return reply;
  }
  req.shopId = shopId;
}
