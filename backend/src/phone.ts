// Telefon raqami bilan ishlash.
//
// Qarzdorga avtomatik SMS va AI qo'ng'iroq yuboriladi — shuning uchun
// raqam bazaga bitta ko'rinishda tushishi shart: +998XXXXXXXXX.
// Do'konchi qanday yozishidan qat'i nazar (probel, tire, 8 bilan, 998 siz)
// shu ko'rinishga keltiriladi.

/** Har qanday yozuvdan +998XXXXXXXXX hosil qiladi; noto'g'ri bo'lsa '' qaytaradi */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  // eski yozuv odati: 8 90 123 45 67
  else if (d.length === 10 && d.startsWith('8')) d = d.slice(1);
  if (d.length !== 9) return '';
  return `+998${d}`;
}

export const isValidPhone = (raw: string | null | undefined) => normalizePhone(raw) !== '';
