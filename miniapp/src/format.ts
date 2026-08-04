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
