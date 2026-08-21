/**
 * Anthropic chegarasining hozirgi holati.
 *
 * Har javobda `anthropic-ratelimit-*` sarlavhalari keladi: chegara
 * qancha, qanchasi qolgan, qachon to'ladi. Ularni ushlab qo'yamiz —
 * shunda "yuz do'kon bir vaqtda ishlatsa yetadimi?" degan savolga
 * taxmin bilan emas, HAQIQIY raqam bilan javob beriladi.
 *
 * Bepul: alohida so'rov yubormaymiz, baribir kelayotgan javobning
 * sarlavhasini o'qiymiz.
 */

import { db } from '../db.js';

export interface RateSnapshot {
  /** so'rov / daqiqa */
  req_limit: number | null;
  req_left: number | null;
  /** kirish token / daqiqa */
  in_limit: number | null;
  in_left: number | null;
  /** chiqish token / daqiqa */
  out_limit: number | null;
  out_left: number | null;
  /** chegara qachon to'liq tiklanadi */
  reset: string | null;
  /** oxirgi marta qachon o'qildi */
  at: string;
}

let last: RateSnapshot | null = null;

const num = (v: string | null): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Javob sarlavhalaridan holatni olish.
 *
 * Sarlavha kelmasligi ham mumkin (proksi kesib tashlashi, soxta server
 * bo'lishi) — u holda eski holat saqlanib qoladi, chunki eski raqam
 * hech qanday raqamdan yaxshiroq.
 */
export function readRateHeaders(h: Headers | null | undefined) {
  if (!h) return;
  const req = num(h.get('anthropic-ratelimit-requests-limit'));
  const inp = num(h.get('anthropic-ratelimit-input-tokens-limit'));
  const out = num(h.get('anthropic-ratelimit-output-tokens-limit'));
  // Birortasi ham kelmasa — bu Anthropic javobi emas, tegmaymiz
  if (req == null && inp == null && out == null) return;

  last = {
    req_limit: req,
    req_left: num(h.get('anthropic-ratelimit-requests-remaining')),
    in_limit: inp,
    in_left: num(h.get('anthropic-ratelimit-input-tokens-remaining')),
    out_limit: out,
    out_left: num(h.get('anthropic-ratelimit-output-tokens-remaining')),
    reset:
      h.get('anthropic-ratelimit-output-tokens-reset') ??
      h.get('anthropic-ratelimit-requests-reset'),
    at: new Date().toISOString(),
  };
  // Serverni qayta yoqqanda raqam yo'qolib ketmasin: birinchi savolgacha
  // admin panel bo'sh turgandan ko'ra oxirgi ma'lum holatni ko'rsatsin
  try {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('ai_rate_snapshot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(JSON.stringify(last));
  } catch {
    /* saqlanmasa ham xotiradagisi ishlayveradi */
  }
}

export function rateState(): RateSnapshot | null {
  if (last) return last;
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'ai_rate_snapshot'").get() as any;
    if (row?.value) last = JSON.parse(row.value);
  } catch {
    /* buzuq yozuv — holat yo'q deb hisoblanadi */
  }
  return last;
}
