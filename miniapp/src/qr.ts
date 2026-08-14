// QR kod yasash (tashqi kutubxonasiz).
//
// Chekdagi QR ni xaridor telefoni bilan o'qiydi — ichida do'kon nomi,
// chek raqami, sanasi va summasi turadi. Qarzga olingan bo'lsa karta
// raqami ham qo'shiladi, xaridor to'lash uchun qayta terib o'tirmaydi.
//
// Baytli (byte mode) kodlash, xatolikni tuzatish darajasi M (~15%),
// 1–10-versiyalar (216 baytgacha) — chek uchun bundan ortig'i kerak emas.

// ── Har bir versiya uchun: umumiy kodso'zlar, blokdagi tuzatish kodso'zlari,
//    va bloklar tuzilishi [1-guruh bloklari, ulardagi ma'lumot, 2-guruh, ...]
const VERSIONS: { total: number; ec: number; g1: number; d1: number; g2: number; d2: number }[] = [
  { total: 26, ec: 10, g1: 1, d1: 16, g2: 0, d2: 0 }, // 1
  { total: 44, ec: 16, g1: 1, d1: 28, g2: 0, d2: 0 }, // 2
  { total: 70, ec: 26, g1: 1, d1: 44, g2: 0, d2: 0 }, // 3
  { total: 100, ec: 18, g1: 2, d1: 32, g2: 0, d2: 0 }, // 4
  { total: 134, ec: 24, g1: 2, d1: 43, g2: 0, d2: 0 }, // 5
  { total: 172, ec: 16, g1: 4, d1: 27, g2: 0, d2: 0 }, // 6
  { total: 196, ec: 18, g1: 4, d1: 31, g2: 0, d2: 0 }, // 7
  { total: 242, ec: 22, g1: 2, d1: 38, g2: 2, d2: 39 }, // 8
  { total: 292, ec: 22, g1: 3, d1: 36, g2: 2, d2: 37 }, // 9
  { total: 346, ec: 26, g1: 4, d1: 43, g2: 1, d2: 44 }, // 10
];

/** Tekislash (alignment) naqshlarining markazlari */
const ALIGN: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
  [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
];

/** 7-versiyadan boshlab matritsaga versiya ma'lumoti ham yoziladi */
const VERSION_BITS: Record<number, string> = {
  7: '000111110010010100',
  8: '001000010110111100',
  9: '001001101010011001',
  10: '001010010011010011',
};

// ── Galua maydoni GF(256) — Reed-Solomon uchun ──
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d; // QR uchun keltirilmaydigan ko'phad
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** Berilgan darajadagi generator ko'phadi */
function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Ma'lumot blokining xatolikni tuzatish kodso'zlari */
function ecCodewords(data: number[], ecLen: number): number[] {
  const gen = generator(ecLen);
  const res = new Array(data.length + ecLen).fill(0);
  data.forEach((d, i) => (res[i] = d));
  for (let i = 0; i < data.length; i++) {
    const factor = res[i];
    if (factor === 0) continue;
    for (let j = 0; j < gen.length; j++) res[i + j] ^= mul(gen[j], factor);
  }
  return res.slice(data.length);
}

/** Format ma'lumoti: xatolik darajasi + niqob, BCH(15,5) bilan himoyalangan */
function formatBits(maskId: number): string {
  const ecLevelM = 0b00;
  let value = (ecLevelM << 3) | maskId;
  let rem = value;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >> 9) * 0x537);
  }
  const bits = ((value << 10) | rem) ^ 0x5412;
  return bits.toString(2).padStart(15, '0');
}

type Grid = (0 | 1 | null)[][];

/** Doimiy naqshlarni (qidiruv, tekislash, vaqt) joylashtiradi */
function placeStatic(grid: Grid, version: number, size: number) {
  const put = (r: number, c: number, v: 0 | 1) => {
    if (r >= 0 && r < size && c >= 0 && c < size) grid[r][c] = v;
  };
  // Uchta burchakdagi qidiruv naqshi + ajratgich
  for (const [br, bc] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const inner = r >= 0 && r <= 6 && c >= 0 && c <= 6;
        const dark = inner && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
        put(br + r, bc + c, dark ? 1 : 0);
      }
    }
  }
  // Vaqt (timing) chiziqlari
  for (let i = 8; i < size - 8; i++) {
    const v: 0 | 1 = i % 2 === 0 ? 1 : 0;
    grid[6][i] = v;
    grid[i][6] = v;
  }
  // Tekislash naqshlari
  const centers = ALIGN[version - 1];
  for (const r of centers) {
    for (const c of centers) {
      // Qidiruv naqshlari bilan ustma-ust tushmasin
      if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          grid[r + dr][c + dc] = dark ? 1 : 0;
        }
      }
    }
  }
  // Doim qora modul
  grid[size - 8][8] = 1;
  // Format maydonlarini band qilib qo'yamiz (qiymati keyin yoziladi)
  for (let i = 0; i < 9; i++) {
    if (grid[8][i] === null) grid[8][i] = 0;
    if (grid[i][8] === null) grid[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (grid[8][size - 1 - i] === null) grid[8][size - 1 - i] = 0;
    if (grid[size - 1 - i][8] === null) grid[size - 1 - i][8] = 0;
  }
  // Versiya ma'lumoti (7-versiyadan boshlab)
  if (version >= 7) {
    const bits = VERSION_BITS[version];
    for (let i = 0; i < 18; i++) {
      const bit = (bits[17 - i] === '1' ? 1 : 0) as 0 | 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      grid[r][c] = bit;
      grid[c][r] = bit;
    }
  }
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Niqoblangan matritsa qanchalik "yomon" ekani — standartdagi jarima */
function penalty(m: (0 | 1)[][], size: number): number {
  let score = 0;
  // 1-qoida: ketma-ket bir xil ranglar
  for (let i = 0; i < size; i++) {
    for (const line of [m[i], m.map((row) => row[i])]) {
      let run = 1;
      for (let j = 1; j < size; j++) {
        if (line[j] === line[j - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      if (run >= 5) score += run - 2;
    }
  }
  // 2-qoida: 2×2 bir xil bloklar
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }
  // 3-qoida: qidiruv naqshiga o'xshash "1011101" ketma-ketligi — skaner uni
  // haqiqiy burchak naqshi deb adashishi mumkin. Bir tomonida 4 ta oq modul
  // bo'lsa jarima yoziladi; belgidan tashqarisi oq hisoblanadi.
  const core = [1, 0, 1, 1, 1, 0, 1];
  const allWhite = (line: (0 | 1)[], from: number, to: number) => {
    for (let i = Math.max(from, 0); i < Math.min(to, line.length); i++) if (line[i] === 1) return false;
    return true;
  };
  const columns = Array.from({ length: size }, (_, c) => m.map((row) => row[c]));
  for (const lines of [m, columns]) {
    for (const line of lines) {
      for (let j = 0; j + 7 <= size; j++) {
        if (!core.every((v, k) => v === line[j + k])) continue;
        if (allWhite(line, j - 4, j) || allWhite(line, j + 7, j + 11)) score += 40;
      }
    }
  }
  // 4-qoida: qora modullar ulushi 50% dan qancha uzoq
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
  const pct = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/** Matnni QR modullariga aylantiradi. Sig'masa null qaytadi. */
export function qrMatrix(text: string): (0 | 1)[][] | null {
  const bytes = [...new TextEncoder().encode(text)];

  // Sig'adigan eng kichik versiya
  let version = 0;
  for (let v = 1; v <= VERSIONS.length; v++) {
    const spec = VERSIONS[v - 1];
    const capacity = spec.g1 * spec.d1 + spec.g2 * spec.d2;
    const lenBits = v < 10 ? 8 : 16;
    if (4 + lenBits + bytes.length * 8 <= capacity * 8) {
      version = v;
      break;
    }
  }
  if (!version) return null;

  const spec = VERSIONS[version - 1];
  const dataCount = spec.g1 * spec.d1 + spec.g2 * spec.d2;

  // ── Bit oqimi: rejim + uzunlik + ma'lumot + tugatgich + to'ldirish
  let bits = '0100';
  bits += bytes.length.toString(2).padStart(version < 10 ? 8 : 16, '0');
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  bits += '0'.repeat(Math.min(4, dataCount * 8 - bits.length));
  if (bits.length % 8) bits += '0'.repeat(8 - (bits.length % 8));
  const pad = ['11101100', '00010001'];
  for (let i = 0; bits.length < dataCount * 8; i++) bits += pad[i % 2];

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) codewords.push(parseInt(bits.slice(i, i + 8), 2));

  // ── Bloklarga bo'lish va tuzatish kodso'zlari
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let pos = 0;
  for (const [count, len] of [[spec.g1, spec.d1], [spec.g2, spec.d2]]) {
    for (let i = 0; i < count; i++) {
      const block = codewords.slice(pos, pos + len);
      pos += len;
      dataBlocks.push(block);
      ecBlocks.push(ecCodewords(block, spec.ec));
    }
  }
  // Bloklar navbatma-navbat qo'shiladi (interleaving)
  const final: number[] = [];
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  for (let i = 0; i < maxData; i++) {
    for (const b of dataBlocks) if (i < b.length) final.push(b[i]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (const b of ecBlocks) final.push(b[i]);
  }

  // ── Matritsa
  const size = version * 4 + 17;
  const grid: Grid = Array.from({ length: size }, () => new Array(size).fill(null));
  placeStatic(grid, version, size);

  // Ma'lumot bitlari: o'ngdan chapga, ikkitalik ustunlarda zigzag
  const dataBits = final.map((b) => b.toString(2).padStart(8, '0')).join('');
  let bitIndex = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // vaqt chizig'i ustuni o'tkazib yuboriladi
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i;
      for (const c of [col, col - 1]) {
        if (grid[row][c] !== null) continue;
        grid[row][c] = (bitIndex < dataBits.length ? (dataBits[bitIndex] === '1' ? 1 : 0) : 0) as 0 | 1;
        bitIndex++;
      }
    }
    upward = !upward;
  }

  // ── Niqob: sakkiztasidan eng yaxshisi tanlanadi
  const isFunction = (r: number, c: number): boolean => {
    if (r === 6 || c === 6) return true; // vaqt chiziqlari
    if (r < 9 && c < 9) return true;
    if (r < 9 && c >= size - 8) return true;
    if (r >= size - 8 && c < 9) return true;
    if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) return true;
    const centers = ALIGN[version - 1];
    for (const ar of centers) {
      for (const ac of centers) {
        if ((ar <= 8 && ac <= 8) || (ar <= 8 && ac >= size - 9) || (ar >= size - 9 && ac <= 8)) continue;
        if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
      }
    }
    return false;
  };

  let best: (0 | 1)[][] | null = null;
  let bestScore = Infinity;
  for (let maskId = 0; maskId < 8; maskId++) {
    const m: (0 | 1)[][] = grid.map((row, r) =>
      row.map((v, c) => {
        const base = (v ?? 0) as 0 | 1;
        if (isFunction(r, c)) return base;
        return (MASKS[maskId](r, c) ? (base ^ 1) : base) as 0 | 1;
      })
    );
    // Format ma'lumoti — ikki nusxada yoziladi.
    // Standartdagi joylashuv (satr, ustun) tartibida:
    //   1-nusxa: 0–5-bitlar 8-ustunda yuqoridan pastga, keyin burchak,
    //            9–14-bitlar 8-satrda o'ngdan chapga
    //   2-nusxa: 0–7-bitlar 8-satrda o'ngdan, 8–14-bitlar 8-ustunda pastdan
    const fmt = formatBits(maskId);
    for (let i = 0; i < 15; i++) {
      const bit = (fmt[14 - i] === '1' ? 1 : 0) as 0 | 1;
      // 1-nusxa (chap yuqori burchak)
      if (i < 6) m[i][8] = bit;
      else if (i === 6) m[7][8] = bit;
      else if (i === 7) m[8][8] = bit;
      else if (i === 8) m[8][7] = bit;
      else m[8][14 - i] = bit;
      // 2-nusxa
      if (i < 8) m[8][size - 1 - i] = bit;
      else m[size - 15 + i][8] = bit;
    }
    m[size - 8][8] = 1; // doim qora modul
    const score = penalty(m, size);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** QR ni SVG matn sifatida qaytaradi. Chet-chetida tinch zona qoldiriladi. */
export function qrSvg(text: string, opts: { size?: number; quiet?: number } = {}): string | null {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length;
  const quiet = opts.quiet ?? 4;
  const total = n + quiet * 2;
  const px = opts.size ?? 4;

  let path = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) path += `M${c + quiet} ${r + quiet}h1v1h-1z`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${total * px}" height="${total * px}" ` +
    `viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/>` +
    `<path d="${path}" fill="#000"/>` +
    `</svg>`
  );
}
