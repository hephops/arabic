// Telefon raqami bilan ishlash.
//
// Qarzdorga avtomatik SMS va AI qo'ng'iroq yuboriladi — shuning uchun
// raqam bazaga bitta ko'rinishda tushishi shart: +998XXXXXXXXX.
// Do'konchi qanday yozishidan qat'i nazar (probel, tire, 8 bilan, 998 siz)
// shu ko'rinishga keltiriladi.

// O'zbekistondagi operator kodlari. Ro'yxatda yo'q kod — terishda xato,
// shuning uchun raqam qabul qilinmaydi (aks holda SMS bekorga ketadi).
const OPERATOR_CODES = new Set([
  '20', '33', '50', '55', '77', '88', '90', '91', '93', '94', '95', '97', '98', '99',
  '71', '78', // Toshkent shahar raqamlari
]);

/** Har qanday yozuvdan +998XXXXXXXXX hosil qiladi; noto'g'ri bo'lsa '' qaytaradi */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');

  // "998..." — mamlakat kodi faqat raqam undan uzun bo'lsa olib tashlanadi.
  // Aks holda 99-operatorning o'zi ("998 12 34 56") kesilib ketardi.
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  // eski yozuv odati: 8 90 123 45 67
  else if (d.length === 10 && d.startsWith('8')) d = d.slice(1);

  if (d.length !== 9) return '';
  if (!OPERATOR_CODES.has(d.slice(0, 2))) return '';
  return `+998${d}`;
}

export const isValidPhone = (raw: string | null | undefined) => normalizePhone(raw) !== '';
