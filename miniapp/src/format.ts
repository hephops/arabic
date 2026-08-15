// Kiritish maskalari — foydalanuvchi yozayotgan paytda darhol formatlanadi.
// Bazaga faqat toza raqamlar boradi (digits*), ekranda esa bo'g'inlab ko'rsatiladi.

export const digits = (v: string) => v.replace(/\D/g, '');

/* ── Telefon: +998 93 922 88 89 ── */

// O'zbekistondagi operator kodlari — backend/src/phone.ts bilan bir xil ro'yxat.
// Ikkalasi bir xil bo'lishi shart: aks holda ilova qabul qilgan raqamni
// server boshqacha o'qib, qarz begona raqamga biriktirilib qolardi.
const OPERATOR_CODES = new Set([
  '20', '33', '50', '55', '77', '88', '90', '91', '93', '94', '95', '97', '98', '99',
  '71', '78',
]);

// Kiritilgan har qanday ko'rinishdan faqat 9 xonali milliy raqam qoladi
export function phoneDigits(value: string): string {
  let d = digits(value);
  // "998" faqat raqam undan uzun bo'lsa mamlakat kodi hisoblanadi —
  // aks holda 99-operatorning o'zi kesilib ketardi
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  else if (d.length === 10 && d.startsWith('8')) d = d.slice(1);
  return d.slice(0, 9);
}

// Ekranda ko'rsatish uchun: 939228889 -> "+998 93 922 88 89"
export function formatPhone(value: string): string {
  const d = phoneDigits(value);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return parts.length ? `+998 ${parts.join(' ')}` : '+998';
}

// Serverga yuboriladigan ko'rinish: +998939228889
export const phoneE164 = (value: string) => '+998' + phoneDigits(value);

// Ixtiyoriy maydonlar uchun: bo'sh bo'lsa bo'sh qoladi (majburan "+998" chiqmaydi)
export const formatPhoneSoft = (value: string) => (phoneDigits(value) ? formatPhone(value) : '');
export const phoneStore = (value: string) => (phoneDigits(value) ? phoneE164(value) : '');

export const isPhoneComplete = (value: string) => {
  const d = phoneDigits(value);
  return d.length === 9 && OPERATOR_CODES.has(d.slice(0, 2));
};

/* ── Karta: 8600 1234 5678 9012 (16 xona) ── */

export const cardDigits = (value: string) => digits(value).slice(0, 16);

export function formatCard(value: string): string {
  return (cardDigits(value).match(/.{1,4}/g) ?? []).join(' ');
}

export const isCardComplete = (value: string) => cardDigits(value).length === 16;

// Ro'yxatlarda qisqartirib ko'rsatish: •••• 9012
export function maskCard(value: string | null | undefined): string {
  const d = cardDigits(value ?? '');
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : '';
}

/* ── Summa: 120 000 ── */

export const amountDigits = (value: string) => digits(value).slice(0, 12);

export function formatAmount(value: string): string {
  const d = amountDigits(value).replace(/^0+(?=\d)/, '');
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export const amountValue = (value: string) => Number(amountDigits(value) || 0);

/* ── Vaqt: Toshkent (UTC+5) ── */

// Server vaqtlarni UTC'da saqlaydi ("2026-08-15 19:12:03") — SQLite shunday
// yozadi. Ekranda esa do'konchi o'z soatini ko'rishi kerak, shuning uchun
// har bir vaqt ko'rsatilishidan oldin 5 soatga suriladi. O'zbekistonda
// yozgi/qishki soatga o'tish yo'q, shuning uchun surish doim bir xil.
const UZ_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Bazadagi vaqtni Toshkent vaqtiga o'girish. Noto'g'ri qiymatda null. */
export function uzDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  // "2026-08-15 19:12:03" va "2026-08-15T19:12:03" — ikkalasi ham UTC
  const iso = value.trim().replace(' ', 'T');
  const ms = Date.parse(iso.endsWith('Z') ? iso : iso + 'Z');
  return Number.isNaN(ms) ? null : new Date(ms + UZ_OFFSET_MS);
}

const two = (n: number) => String(n).padStart(2, '0');

/** Soat: "19:12" */
export function fmtTime(value: string | null | undefined): string {
  const d = uzDate(value);
  return d ? `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : '';
}

/** Sana: "15.08.2026" */
export function fmtDay(value: string | null | undefined): string {
  const d = uzDate(value);
  return d ? `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}` : '';
}

/** Sana va soat: "15.08.2026 19:12" */
export function fmtDateTime(value: string | null | undefined): string {
  const d = uzDate(value);
  return d ? `${fmtDay(value)} ${fmtTime(value)}` : '';
}

/** Ro'yxatlar uchun qisqa ko'rinish: "15.08 19:12" */
export function fmtWhen(value: string | null | undefined): string {
  const d = uzDate(value);
  return d ? `${two(d.getUTCDate())}.${two(d.getUTCMonth() + 1)} ${fmtTime(value)}` : '';
}

/** Bugungi Toshkent sanasi: "2026-08-16" */
export function uzToday(at: Date = new Date()): string {
  return new Date(at.getTime() + UZ_OFFSET_MS).toISOString().slice(0, 10);
}
