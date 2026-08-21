// AI yordamchining sozlamalari.
//
// NARX — asosiy cheklov. Do'konchi kuniga 3 300 so'm to'laydi (oyiga
// ~100 000). AI xarajati shundan sezilarli ulush olmasligi kerak,
// shuning uchun kundalik savollar HAIKU bilan ishlanadi.
//
// HAQIQIY MODEL BILAN O'LCHANGAN (TZ dagi taxmin emas):
//
//   Haiku 4.5  ($1/$5 per 1M)  — bitta savol ~100 so'm
//   Sonnet 5   ($3/$15)        — bitta savol ~300 so'm
//
// TZ da 58 va 210 so'm deb taxmin qilingan edi; haqiqiy raqam ~1.7
// barobar yuqori chiqdi, chunki har chaqiruvda 12 ta vositaning
// ta'rifi (~1900 token) qaytadan yuboriladi va kesh ishlamaydi
// (sababi agent.ts dagi izohda).
//
// Kuniga 5 savol -> ~500 so'm/kun -> ~15 000 so'm/oy, ya'ni 100 000
// so'mlik obunaning ~15%i. Bu qabul qilsa bo'ladigan raqam.
//
// Modelni almashtirmoqchi bo'lsangiz admin panel > Sozlamalar, yoki
// .env orqali: AI_MODEL=claude-sonnet-5

import { getSetting } from '../billing.js';

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

/**
 * Kuniga nechta savol. 0 — cheksiz (tavsiya etilmaydi).
 *
 * 10 tanlandi: eng yomon holatda 10 × 100 = 1 000 so'm/kun, ya'ni
 * 3 300 so'mlik kunlik to'lovning uchdan biri. 20 bo'lsa xarajat
 * to'lovning uchdan ikkisiga chiqib ketardi.
 */
export const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 10);

/** Bitta savolda modelga necha marta murojaat qilinadi (vosita halqasi) */
export const MAX_STEPS = Number(process.env.AI_MAX_STEPS ?? 6);

/** Suhbat necha kun saqlanadi */
export const KEEP_DAYS = Number(process.env.AI_KEEP_DAYS ?? 30);

/**
 * Kalit qayerdan olinadi.
 *
 * Avval admin paneldagi sozlama, keyin .env. Nega shu tartibda:
 * kalitni almashtirish uchun serverga kirib fayl tahrirlash va
 * qayta ishga tushirish kerak bo'lmasin — admin panelda yozib
 * saqlash bilan darhol ishlasin.
 *
 * .env dagisi qolaveradi: sozlama bo'sh bo'lsa u ishlatiladi.
 */
export function aiKey(): string {
  return (getSetting('anthropic_api_key', '') || process.env.ANTHROPIC_API_KEY || '').trim();
}

/** Kalit qo'yilganmi — qo'yilmasa AI butunlay o'chiq turadi */
export function aiEnabled(): boolean {
  return !!aiKey();
}

/** Model ham admin paneldan almashtirilishi mumkin */
export function model(): string {
  return getSetting('ai_model', '').trim() || MODEL;
}

/**
 * Kunlik chegara.
 *
 * DIQQAT: sozlama BO'SH bo'lsa .env dagi qiymat olinadi, nol emas.
 * Number('') nolga teng, nol esa "cheksiz" degani — ya'ni sozlama
 * to'ldirilmagan bo'lsa chegara jimgina olib tashlanardi va bitta
 * do'kon kuniga yuzlab savol berib pul yeyishi mumkin edi.
 */
export function dailyLimit(): number {
  const raw = getSetting('ai_daily_limit', '').trim();
  if (!raw) return DAILY_LIMIT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : DAILY_LIMIT;
}
