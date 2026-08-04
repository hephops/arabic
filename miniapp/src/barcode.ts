// Skaner o'qigan kodni ishonchli deb hisoblash mantig'i.
// backend/src/barcodes.ts dagi checkGtin bilan bir xil algoritm.
//
// Nima uchun kerak: kamera bitta kadrni xira yoki qiyshiq ko'rsa, dvigatel
// "o'xshash" lekin noto'g'ri raqam qaytarishi mumkin (ayniqsa kod teskari
// tursa yoki ITF/Code-39 kabi nazorat raqami yo'q formatlarda). Shunday
// raqam bilan qidirilsa "mahsulot topilmadi" chiqadi va do'konchi sababini
// tushunmaydi. Shuning uchun:
//   1) nazorat raqami tekshiriladi — xato bo'lsa o'qish umuman qabul qilinmaydi;
//   2) bitta kod ketma-ket bir necha marta bir xil o'qilishi talab qilinadi.

const isNumeric = (code: string) => /^\d+$/.test(code);

/**
 * GTIN (EAN-8 / UPC-A / EAN-13 / GTIN-14) nazorat raqami to'g'rimi?
 * Tekshirib bo'lmaydigan kodlar uchun null.
 */
export function checkGtin(raw: string): boolean | null {
  const code = raw.trim();
  if (!isNumeric(code) || ![8, 12, 13, 14].includes(code.length)) return null;
  const digits = code.split('').map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Kod umuman qabul qilinishi mumkinmi (nazorat raqami buzuq emasmi) */
export function isReadable(code: string): boolean {
  const c = code.trim();
  if (c.length < 4) return false;
  return checkGtin(c) !== false;
}

/** Shu kod uchun nechta bir xil o'qish kerak */
export function votesNeeded(code: string): number {
  // nazorat raqami to'g'ri bo'lsa — ikki marta yetadi (tez va ishonchli)
  return checkGtin(code) === true ? 2 : 3;
}

/**
 * Ketma-ket o'qishlarni yig'ib, ishonchli bo'lgandagina kodni qaytaradi.
 * Har bir skaner seansi uchun bittadan yaratiladi.
 */
export function createVoter() {
  let current = '';
  let votes = 0;

  return {
    /** Kadrdan o'qilgan kod. Ishonchli bo'lsa kodni, aks holda null qaytaradi. */
    push(raw: string): string | null {
      const code = raw.trim();
      if (!isReadable(code)) {
        // buzuq o'qish — hisobni ham buzmasin
        return null;
      }
      if (code === current) votes++;
      else {
        current = code;
        votes = 1;
      }
      if (votes >= votesNeeded(code)) {
        votes = 0;
        current = '';
        return code;
      }
      return null;
    },
    reset() {
      current = '';
      votes = 0;
    },
  };
}
