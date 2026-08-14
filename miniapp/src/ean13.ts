// EAN-13 shtrix-kodini chizish.
//
// Tashqi kutubxonasiz: kod 95 ta ustundan iborat, ularning qay biri qora
// ekani standartdagi jadvallar bilan aniqlanadi. Skaner shu qora-oq
// ketma-ketlikni o'qiydi, shuning uchun chizma aniq bo'lishi shart.

// Chap tomon — toq (L) va juft (G) parity jadvallari, o'ng tomon — R.
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];

// Birinchi raqam chap oltilikning L/G tartibini belgilaydi — u alohida
// ustun bilan emas, shu tartib bilan "yashirin" kodlanadi.
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** 12 xonadan nazorat raqamini hisoblaydi */
export function ean13CheckDigit(digits12: string): number {
  const digits = digits12.split('').map(Number);
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10;
}

/** Kod EAN-13 bo'la oladimi (13 xona va nazorat raqami to'g'ri) */
export function isEan13(code: string): boolean {
  const c = code.trim();
  if (!/^\d{13}$/.test(c)) return false;
  return ean13CheckDigit(c.slice(0, 12)) === Number(c[12]);
}

/** 95 ta ustun: '1' — qora, '0' — oq */
export function ean13Modules(code: string): string | null {
  const c = code.trim();
  if (!/^\d{13}$/.test(c)) return null;
  const first = Number(c[0]);
  const left = c.slice(1, 7);
  const right = c.slice(7);
  let out = '101'; // boshlang'ich qo'riqchi
  for (let i = 0; i < 6; i++) {
    const d = Number(left[i]);
    out += PARITY[first][i] === 'L' ? L[d] : G[d];
  }
  out += '01010'; // o'rtadagi qo'riqchi
  for (let i = 0; i < 6; i++) out += R[Number(right[i])];
  out += '101'; // yakuniy qo'riqchi
  return out;
}

export interface BarcodeSvgOptions {
  /** bitta ustun kengligi (mm emas, SVG birligi) */
  moduleWidth?: number;
  /** chiziqlar balandligi */
  height?: number;
  /** pastda raqamlarni yozish */
  showText?: boolean;
}

/**
 * EAN-13 ni SVG matn sifatida qaytaradi. Chet-chetida "tinch zona"
 * qoldiriladi — usiz skaner kodning boshini topa olmaydi.
 */
export function ean13Svg(code: string, opts: BarcodeSvgOptions = {}): string | null {
  const modules = ean13Modules(code);
  if (!modules) return null;
  const mw = opts.moduleWidth ?? 2;
  const h = opts.height ?? 60;
  const showText = opts.showText !== false;
  const quiet = 11 * mw; // standart bo'yicha kamida 11 ustun
  const textH = showText ? 14 : 0;
  const width = quiet * 2 + modules.length * mw;
  const height = h + textH + 2;

  // Qo'riqchi chiziqlari raqamlar oralig'iga tushib turadi — shu sababli uzunroq
  const isGuard = (i: number) =>
    i < 3 || (i >= 45 && i < 50) || i >= 92;

  let bars = '';
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue;
    const barH = isGuard(i) ? h + (showText ? 6 : 0) : h;
    bars += `<rect x="${quiet + i * mw}" y="0" width="${mw}" height="${barH}" />`;
  }

  let text = '';
  if (showText) {
    const y = height - 1;
    const fs = Math.max(8, mw * 5);
    // 1 + 6 + 6: birinchi raqam chap tinch zonada turadi
    text += `<text x="${quiet - mw * 1.5}" y="${y}" font-size="${fs}" text-anchor="end">${code[0]}</text>`;
    text += `<text x="${quiet + 3 * mw + 21 * mw}" y="${y}" font-size="${fs}" text-anchor="middle" letter-spacing="${mw * 0.6}">${code.slice(1, 7)}</text>`;
    text += `<text x="${quiet + 50 * mw + 21 * mw}" y="${y}" font-size="${fs}" text-anchor="middle" letter-spacing="${mw * 0.6}">${code.slice(7)}</text>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<rect width="${width}" height="${height}" fill="#fff"/>` +
    `<g fill="#000" font-family="monospace">${bars}${text}</g>` +
    `</svg>`
  );
}
