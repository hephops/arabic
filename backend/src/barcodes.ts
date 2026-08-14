// Shtrix-kodlar mantig'i.
//
// Amalda bitta mahsulot bir necha xil ko'rinishdagi kod bilan uchraydi:
//   • UPC-A (12 xona) va EAN-13 (13 xona) — bir xil tovar, faqat oldiga 0 qo'shiladi;
//     skanerning turli dvigatellari bittasini 12, boshqasi 13 xonali qilib qaytaradi
//   • GTIN-14 (yashik kodi) — 13 xonaning oldiga yana bir raqam qo'shiladi
//   • qo'lda terilganda probel, tire yoki bosh nollar qo'shilib ketadi
//
// Shuning uchun kod bazaga tozalangan holda yoziladi, qidirishda esa
// barcha teng ko'rinishlari bo'yicha izlanadi.

export function normalizeBarcode(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim().replace(/[\s\-_]/g, '').toUpperCase();
  return cleaned;
}

const isNumeric = (code: string) => /^\d+$/.test(code);

/** Kodning barcha teng ko'rinishlari (o'zi ham kiradi) */
export function barcodeVariants(raw: string): string[] {
  const code = normalizeBarcode(raw);
  if (!code) return [];
  const out = new Set<string>([code]);

  if (isNumeric(code)) {
    // bosh nollarsiz "yalang'och" shakl — barcha uzunliklarni bir-biriga bog'laydi
    const bare = code.replace(/^0+/, '') || '0';
    out.add(bare);
    // eng keng tarqalgan uzunliklarga to'ldirilgan shakllar
    for (const len of [8, 12, 13, 14]) {
      if (bare.length <= len) out.add(bare.padStart(len, '0'));
    }
  }

  return [...out];
}

/**
 * GTIN (EAN-8 / UPC-A / EAN-13 / GTIN-14) nazorat raqamini tekshiradi.
 * Qo'lda terilgan kodda xato bo'lsa, shu yerda ushlanadi.
 * Boshqa uzunlikdagi yoki harfli kodlar uchun null qaytadi (tekshirib bo'lmaydi).
 */
export function checkGtin(raw: string): boolean | null {
  const code = normalizeBarcode(raw);
  if (!isNumeric(code) || ![8, 12, 13, 14].includes(code.length)) return null;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  // o'ngdan chapga: 3, 1, 3, 1, ...
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** 12 xonadan EAN-13 ning nazorat raqamini hisoblaydi */
export function gtinCheckDigit(digits12: string): number {
  const digits = digits12.split('').map(Number);
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/**
 * Do'konning o'z tovari uchun EAN-13 yasaydi (tarozidagi go'sht, uy mahsuloti —
 * zavod kodi yo'q narsalar).
 *
 * Boshida "20" turadi: GS1 bu oraliqni (20–29) korxona ichida erkin
 * ishlatish uchun ajratgan, ya'ni bu kod hech qachon haqiqiy zavod kodi
 * bilan to'qnashmaydi.
 *
 *   2 0 | do'kon (4 xona) | tovar (6 xona) | nazorat raqami
 */
export function makeInStoreEan13(shopId: number, productId: number, attempt = 0): string {
  const shopPart = String(shopId % 10000).padStart(4, '0');
  const itemPart = String((productId + attempt * 7919) % 1000000).padStart(6, '0');
  const body = `20${shopPart}${itemPart}`;
  return body + gtinCheckDigit(body);
}
