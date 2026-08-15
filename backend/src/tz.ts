// O'zbekiston vaqti.
//
// SQLite `datetime('now')` ni har doim UTC'da yozadi — bazadagi
// created_at qiymatlari shuning uchun Toshkent vaqtidan 5 soat orqada.
// Saqlashni UTC'da qoldiramiz (ALTER TABLE bilan ustunning DEFAULT'ini
// o'zgartirib bo'lmaydi, eski yozuvlar esa baribir UTC), ammo do'konchi
// uchun kun Toshkent bo'yicha o'lchanishi shart: yangi kun 00:00 da
// boshlanadi, 05:00 da emas. Aks holda kechqurun 00:00–05:00 orasidagi
// savdo "kechagi kun"ga tushib qolardi.
//
// O'zbekiston UTC+5, yozgi/qishki soatga o'tish yo'q — shuning uchun
// oddiy qo'shish yetarli, hech qanday kutubxona kerak emas.

export const UZ_OFFSET_MINUTES = 5 * 60;

/**
 * SQL ichida ishlatiladigan surish.
 *
 * Ikki qoida bor va ikkalasi ham kerak:
 *   date(created_at, '+5 hours')  — UTC yozuvni Toshkent sanasiga
 *   date('now', '+5 hours')       — bugungi Toshkent sanasi
 * Faqat bittasi qo'llanilsa taqqoslash 5 soatga siljib ketadi.
 */
export const UZ_SHIFT = '+5 hours';

/** Toshkent vaqtidagi payt (UTC maydonlari orqali o'qiladi) */
export function uzDate(at: Date = new Date()): Date {
  return new Date(at.getTime() + UZ_OFFSET_MINUTES * 60_000);
}

/** Bugungi Toshkent sanasi: "2026-08-16" */
export function uzToday(at: Date = new Date()): string {
  return uzDate(at).toISOString().slice(0, 10);
}

/** Toshkent sanasi N kun oldin (manfiy) yoki keyin (musbat) */
export function uzDayShift(days: number, at: Date = new Date()): string {
  return uzToday(new Date(at.getTime() + days * 86_400_000));
}

/** Toshkent sanasi va soati — kechki hisobot jadvali uchun */
export function uzNow(at: Date = new Date()): { date: string; hour: number } {
  const d = uzDate(at);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

/** Toshkentdagi hafta kuni (0 — yakshanba) */
export function uzWeekday(at: Date = new Date()): number {
  return uzDate(at).getUTCDay();
}

/** Toshkent sanasining kun/oy/yil qismlari */
export function uzParts(at: Date = new Date()): { year: number; month: number; day: number } {
  const d = uzDate(at);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}
