// AI yordamchining sozlamalari.
//
// NARX — asosiy cheklov. Do'konchi kuniga 3 300 so'm to'laydi (oyiga
// ~100 000). AI xarajati shundan sezilarli ulush olmasligi kerak,
// shuning uchun kundalik savollar HAIKU bilan ishlanadi:
//
//   Haiku 4.5  ($1/$5 per 1M)  — bitta savol ~58 so'm
//   Sonnet 5   ($3/$15)        — bitta chuqur tahlil ~210 so'm
//
// Do'konchi kuniga 5 savol bersa oyiga ~15 000 so'm chiqadi — kunlik
// to'lovning ~15%. Opus bilan bu raqam obunaning o'zidan oshib
// ketardi, shuning uchun standart Haiku.
//
// Modelni almashtirmoqchi bo'lsangiz .env orqali: AI_MODEL=claude-sonnet-5

/** Kundalik savollar uchun */
export const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5';

/** Chuqur tahlil uchun (do'konchi "batafsil tahlil qil" desa) */
export const MODEL_DEEP = process.env.AI_MODEL_DEEP || 'claude-sonnet-5';

/** 1M token uchun narx, dollarda. Sarfni so'mda ko'rsatish uchun. */
const PRICE: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
};

/** Dollar kursi. Kurs o'zgarsa .env dan to'g'rilanadi. */
const USD = Number(process.env.AI_USD_RATE) || 12500;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * Bitta chaqiruvning tannarxi, so'mda (yaxlitlangan).
 *
 * Keshdan o'qilgan token to'liq narxning ~10%i, keshga yozilgani
 * ~125%i. Shuning uchun ular alohida hisoblanadi — aks holda kesh
 * ishlayotgani ham, buzilgani ham raqamda ko'rinmasdi.
 */
export function costUzs(model: string, u: Usage): number {
  const p = PRICE[model] ?? PRICE['claude-haiku-4-5'];
  const fresh = u.input_tokens || 0;
  const cached = u.cache_read_input_tokens || 0;
  const written = u.cache_creation_input_tokens || 0;
  const usd =
    ((fresh + cached * 0.1 + written * 1.25) * p.in + (u.output_tokens || 0) * p.out) / 1_000_000;
  return Math.round(usd * USD);
}

/** Kuniga nechta savol. 0 — cheksiz. */
export const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 20);

/** Bitta savolda modelga necha marta murojaat qilinadi (vosita halqasi) */
export const MAX_STEPS = Number(process.env.AI_MAX_STEPS ?? 6);

/** Suhbat necha kun saqlanadi */
export const KEEP_DAYS = Number(process.env.AI_KEEP_DAYS ?? 30);

/** Kalit qo'yilganmi — qo'yilmasa AI butunlay o'chiq turadi */
export function aiEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
